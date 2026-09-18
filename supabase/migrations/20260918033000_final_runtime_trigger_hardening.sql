-- Final runtime hardening for triggers that use search_path='' and calendar month semantics.

create or replace function public.guard_rental_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.kontrak_sewa%rowtype;
  expected_period integer;
  contract_start_month integer;
  payment_month integer;
begin
  select * into c from public.kontrak_sewa where id=new.kontrak_sewa_id;
  if c.id is null then
    raise exception 'Kontrak rental tidak ditemukan.';
  end if;

  if new.periode_ke < 1 or new.periode_ke > 6 then
    raise exception 'Periode pembayaran harus 1 sampai 6.';
  end if;

  if new.bulan_pembayaran < c.tanggal_mulai or new.bulan_pembayaran > c.tanggal_selesai then
    raise exception 'Bulan pembayaran harus berada di dalam periode kontrak rental.';
  end if;

  contract_start_month := (extract(year from c.tanggal_mulai)::integer * 12) + extract(month from c.tanggal_mulai)::integer;
  payment_month := (extract(year from new.bulan_pembayaran)::integer * 12) + extract(month from new.bulan_pembayaran)::integer;
  expected_period := payment_month - contract_start_month + 1;

  if expected_period <> new.periode_ke then
    raise exception 'Periode pembayaran tidak sesuai dengan bulan pembayaran dan kontrak.';
  end if;

  if new.jumlah_dibayar > new.jumlah_tagihan then
    raise exception 'Jumlah dibayar tidak boleh melebihi tagihan.';
  end if;

  if new.tanggal_pembayaran is not null and new.tanggal_pembayaran < c.tanggal_mulai then
    raise exception 'Tanggal pembayaran tidak boleh sebelum kontrak dimulai.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_rental_payment on public.pembayaran_sewa;
create trigger trg_guard_rental_payment
before insert or update on public.pembayaran_sewa
for each row execute function public.guard_rental_payment();

create or replace function public.guard_service_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  svc public.service%rowtype;
  approval_count integer;
  estimate_amount numeric;
  actual_amount numeric;
  approval_amount numeric;
  required_role public.user_role;
  required_count integer;
begin
  if new.status not in ('DISETUJUI','DITOLAK') then
    raise exception 'Approval service harus berstatus DISETUJUI atau DITOLAK.';
  end if;

  select * into svc from public.service where id=new.service_id for update;
  if svc.id is null then
    raise exception 'Service tidak ditemukan.';
  end if;

  if svc.status <> 'MENUNGGU_APPROVAL' then
    raise exception 'Service tidak sedang menunggu approval.';
  end if;

  select count(*)::integer into approval_count
  from public.service_approval
  where service_id=svc.id and status='DISETUJUI';

  estimate_amount := coalesce(svc.estimasi_biaya,0);
  actual_amount := coalesce(svc.biaya_aktual,0);
  approval_amount := greatest(estimate_amount,actual_amount);

  required_count :=
    case
      when estimate_amount > 5000000
        then case when actual_amount > estimate_amount then 2 else 1 end
      when actual_amount > estimate_amount or actual_amount > 5000000
        then 1
      else 0
    end;

  if approval_count >= required_count
     and not (actual_amount > 5000000 and not exists (
       select 1 from public.service_approval
       where service_id=svc.id and status='DISETUJUI' and jenis_approval='DIREKTUR'
     )) then
    raise exception 'Approval service sudah terpenuhi.';
  end if;

  required_role := case
    when approval_amount > 5000000 then 'DIREKTUR'::public.user_role
    else 'ATASAN_TRANSPORT'::public.user_role
  end;

  if required_role='DIREKTUR'::public.user_role then
    if not public.has_any_role(ARRAY['ADMIN'::public.user_role,'DIREKTUR'::public.user_role]) then
      raise exception 'Approval untuk nilai % harus diberikan Direktur.', approval_amount;
    end if;
    new.jenis_approval := 'DIREKTUR';
  else
    if not public.has_any_role(ARRAY['ADMIN'::public.user_role,'ATASAN_TRANSPORT'::public.user_role]) then
      raise exception 'Approval untuk nilai % harus diberikan Atasan Transport.', approval_amount;
    end if;
    new.jenis_approval := 'KEPALA_BAGIAN';
  end if;

  new.urutan := approval_count + 1;
  new.pemberi_approval := auth.uid();
  new.waktu_approval := coalesce(new.waktu_approval,now());
  return new;
end;
$$;

drop trigger if exists trg_guard_service_approval on public.service_approval;
create trigger trg_guard_service_approval
before insert on public.service_approval
for each row execute function public.guard_service_approval();

create or replace function public.record_service_completion_km()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status='SELESAI' and old.status is distinct from 'SELESAI'
     and new.kilometer is not null
     and coalesce(new.nomor_service,'') not like 'IMP-SRV-%' then
    insert into public.riwayat_kilometer(kendaraan_id,tanggal,kilometer,sumber,keterangan,dicatat_oleh)
    select new.kendaraan_id,
           coalesce(new.tanggal_service,current_date),
           new.kilometer,
           'SERVICE',
           concat('KM saat penyelesaian service ',coalesce(new.nomor_service,concat('#',new.id))),
           auth.uid()
    where not exists (
      select 1 from public.riwayat_kilometer rk
      where rk.kendaraan_id=new.kendaraan_id
        and rk.tanggal=coalesce(new.tanggal_service,current_date)
        and rk.kilometer=new.kilometer
        and rk.sumber='SERVICE'
        and coalesce(rk.keterangan,'')=concat('KM saat penyelesaian service ',coalesce(new.nomor_service,concat('#',new.id)))
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_record_service_completion_km on public.service;
create trigger trg_record_service_completion_km
after update of status on public.service
for each row execute function public.record_service_completion_km();

create or replace function public.guard_vehicle_master_km_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kilometer_terakhir is distinct from old.kilometer_terakhir
     and new.kilometer_terakhir is not null
     and old.kilometer_terakhir is not null
     and new.kilometer_terakhir < old.kilometer_terakhir then
    raise exception 'KM kendaraan tidak boleh diturunkan dari nilai sebelumnya (%).', old.kilometer_terakhir;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_vehicle_master_km_update on public.kendaraan;
create trigger trg_guard_vehicle_master_km_update
before update of kilometer_terakhir on public.kendaraan
for each row execute function public.guard_vehicle_master_km_update();

revoke execute on function public.guard_rental_payment() from public,anon,authenticated;
revoke execute on function public.guard_service_approval() from public,anon,authenticated;
revoke execute on function public.record_service_completion_km() from public,anon,authenticated;
revoke execute on function public.guard_vehicle_master_km_update() from public,anon,authenticated;