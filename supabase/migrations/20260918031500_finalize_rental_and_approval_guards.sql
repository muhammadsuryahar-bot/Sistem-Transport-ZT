-- Finalize rental payment and repair invariants.

create or replace function public.guard_rental_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.kontrak_sewa%rowtype;
  expected_period integer;
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

  expected_period :=
    (extract(year from age(new.bulan_pembayaran, c.tanggal_mulai))::integer * 12)
    + extract(month from age(new.bulan_pembayaran, c.tanggal_mulai))::integer + 1;

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

create or replace function public.validate_transport_rental_repair()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  contract_vehicle_id bigint;
  vehicle_ownership text;
  active_contract_count integer;
  active_contract_id bigint;
  allowed_deduction numeric;
begin
  if new.kontrak_sewa_id is null then
    select count(*)::integer, min(id)
    into active_contract_count, active_contract_id
    from public.kontrak_sewa
    where kendaraan_id=new.kendaraan_id and status='AKTIF';
    if active_contract_count=1 then
      new.kontrak_sewa_id := active_contract_id;
    else
      raise exception 'Kendaraan sewa belum memiliki tepat satu kontrak rental aktif.';
    end if;
  end if;

  select kendaraan_id into contract_vehicle_id
  from public.kontrak_sewa where id=new.kontrak_sewa_id;

  if contract_vehicle_id is null then
    raise exception 'Kontrak rental untuk perbaikan tidak ditemukan.';
  end if;

  if new.kendaraan_id is distinct from contract_vehicle_id then
    raise exception 'Kendaraan perbaikan harus sama dengan kendaraan pada kontrak rental.';
  end if;

  select kepemilikan into vehicle_ownership
  from public.kendaraan where id=new.kendaraan_id;

  if vehicle_ownership is distinct from 'SEWA' then
    raise exception 'Perbaikan rental hanya boleh dicatat untuk kendaraan dengan kepemilikan SEWA.';
  end if;

  if new.dibayar_kantor and new.tanggal_dibayar is null then
    raise exception 'Tanggal pembayaran perbaikan wajib diisi jika dibayar kantor.';
  end if;

  if new.dapat_dipotong and not new.dibayar_kantor then
    raise exception 'Perbaikan tidak boleh ditandai dapat dipotong sebelum dibayar kantor.';
  end if;

  allowed_deduction := coalesce(new.biaya_aktual,new.estimasi_biaya,0);
  if new.dapat_dipotong and coalesce(new.jumlah_dipotong,0) <= 0 then
    raise exception 'Jumlah potongan wajib lebih dari 0 jika perbaikan dapat dipotong.';
  end if;

  if new.dapat_dipotong and coalesce(new.jumlah_dipotong,0) > allowed_deduction then
    raise exception 'Jumlah potongan tidak boleh melebihi biaya perbaikan.';
  end if;

  if not new.dapat_dipotong and coalesce(new.jumlah_dipotong,0) <> 0 then
    raise exception 'Jumlah potongan harus 0 jika perbaikan belum ditandai dapat dipotong.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_transport_rental_repair on public.perbaikan_sewa;
create trigger trg_validate_transport_rental_repair
before insert or update on public.perbaikan_sewa
for each row execute function public.validate_transport_rental_repair();

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
    if not public.has_any_role(ARRAY['ADMIN'::user_role,'ATASAN_TRANSPORT'::user_role]) then
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

revoke execute on function public.guard_rental_payment() from public,anon,authenticated;
revoke execute on function public.validate_transport_rental_repair() from public,anon,authenticated;
revoke execute on function public.guard_service_approval() from public,anon,authenticated;