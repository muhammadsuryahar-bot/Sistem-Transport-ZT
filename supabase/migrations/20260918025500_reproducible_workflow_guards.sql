
-- Reproducible workflow guards currently enforced by the production database.
-- Keep database invariants independent from the browser client.

create or replace function public.guard_vehicle_kilometer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_km numeric;
begin
  select coalesce(kilometer_terakhir,0)
    into current_km
  from public.kendaraan
  where id = new.kendaraan_id
  for update;

  if current_km is null then current_km := 0; end if;

  if new.kilometer < current_km then
    raise exception 'KM baru tidak boleh lebih kecil dari KM terakhir kendaraan (%).', current_km;
  end if;

  return new;
end;
$$;

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

create or replace function public.guard_service_insert_workflow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  req public.permintaan_service%rowtype;
  approval_amount numeric;
begin
  if new.permintaan_service_id is null then
    return new;
  end if;

  select * into req
  from public.permintaan_service
  where id = new.permintaan_service_id;

  if req.id is null then
    raise exception 'Pengajuan service tidak ditemukan.';
  end if;

  if req.kendaraan_id <> new.kendaraan_id then
    raise exception 'Kendaraan service harus sama dengan kendaraan pada pengajuan.';
  end if;

  if req.status in ('SELESAI','DIBATALKAN','DITOLAK') then
    raise exception 'Pengajuan service sudah tidak dapat diproses karena statusnya %.', req.status;
  end if;

  if coalesce(new.estimasi_biaya,0) < 0 or coalesce(new.biaya_aktual,0) < 0 then
    raise exception 'Estimasi dan biaya aktual tidak boleh negatif.';
  end if;

  approval_amount := greatest(coalesce(new.estimasi_biaya,0),coalesce(new.biaya_aktual,0));

  if approval_amount > 5000000
     or coalesce(new.biaya_aktual,0) > coalesce(new.estimasi_biaya,0) then
    new.status := 'MENUNGGU_APPROVAL';
  elsif new.status is null or new.status = 'MENUNGGU_APPROVAL' then
    new.status := 'DALAM_PENGERJAAN';
  end if;

  new.updated_at := coalesce(new.updated_at,now());
  return new;
end;
$$;

create or replace function public.guard_service_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  svc public.service%rowtype;
  approval_count integer;
  approval_amount numeric;
  estimate_amount numeric;
  actual_amount numeric;
  required_role public.user_role;
begin
  if new.status not in ('DISETUJUI','DITOLAK') then
    raise exception 'Approval service harus berstatus DISETUJUI atau DITOLAK.';
  end if;

  select * into svc
  from public.service
  where id = new.service_id
  for update;

  if svc.id is null then
    raise exception 'Service tidak ditemukan.';
  end if;

  if svc.status <> 'MENUNGGU_APPROVAL' then
    raise exception 'Service tidak sedang menunggu approval.';
  end if;

  select count(*)::integer into approval_count
  from public.service_approval
  where service_id = svc.id
    and status = 'DISETUJUI';

  estimate_amount := coalesce(svc.estimasi_biaya, 0);
  actual_amount := coalesce(svc.biaya_aktual, estimate_amount);

  if approval_count = 0 then
    approval_amount := estimate_amount;
  else
    if actual_amount <= estimate_amount then
      raise exception 'Service sudah memiliki approval yang diperlukan.';
    end if;
    approval_amount := actual_amount;
  end if;

  if approval_count >= 2 then
    raise exception 'Jumlah approval service sudah terpenuhi.';
  end if;

  required_role := case
    when approval_amount > 5000000 then 'DIREKTUR'::public.user_role
    else 'ATASAN_TRANSPORT'::public.user_role
  end;

  if not public.has_any_role(ARRAY['ADMIN'::public.user_role, required_role]) then
    raise exception 'Approval untuk nilai % harus diberikan oleh %.', approval_amount, required_role;
  end if;

  new.urutan := approval_count + 1;
  new.jenis_approval := case when required_role = 'DIREKTUR'::public.user_role then 'DIREKTUR' else 'KEPALA_BAGIAN' end;
  new.pemberi_approval := auth.uid();
  new.waktu_approval := coalesce(new.waktu_approval, now());
  return new;
end;
$$;

create or replace function public.guard_service_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  estimate_amount numeric := coalesce(new.estimasi_biaya,0);
  actual_amount numeric := coalesce(new.biaya_aktual,new.estimasi_biaya,0);
  approval_count integer;
  required_count integer;
  director_ok boolean;
  evidence_count integer;
begin
  if new.status <> 'SELESAI' or old.status='SELESAI' then
    return new;
  end if;

  if coalesce(new.nomor_service,'') like 'IMP-SRV-%' then
    return new;
  end if;

  select count(*)::integer into approval_count
  from public.service_approval
  where service_id=new.id and status='DISETUJUI';

  director_ok := exists (
    select 1 from public.service_approval
    where service_id=new.id and status='DISETUJUI' and jenis_approval='DIREKTUR'
  );

  required_count :=
    case
      when estimate_amount > 5000000
        then case when actual_amount > estimate_amount then 2 else 1 end
      when actual_amount > estimate_amount or actual_amount > 5000000
        then 1
      else 0
    end;

  if approval_count < required_count then
    raise exception 'Service belum memenuhi jumlah approval yang diwajibkan.';
  end if;

  if actual_amount > 5000000 and not director_ok then
    raise exception 'Service di atas Rp5.000.000 memerlukan approval Direktur.';
  end if;

  select count(*)::integer into evidence_count
  from public.service_bukti
  where service_id=new.id;

  if evidence_count < 1 then
    raise exception 'Service tidak dapat diselesaikan tanpa minimal satu bukti service.';
  end if;

  return new;
end;
$$;

create or replace function public.guard_service_detail_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  service_status text;
begin
  select s.status
    into service_status
  from public.service s
  where s.id=coalesce(new.service_id,old.service_id);

  if service_status in ('SELESAI','DITOLAK','DIBATALKAN') then
    raise exception 'Detail service tidak dapat diubah setelah service berstatus %.',service_status;
  end if;
  return coalesce(new,old);
end;
$$;

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
  select * into c
  from public.kontrak_sewa
  where id=new.kontrak_sewa_id;

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

create or replace function public.guard_rental_deduction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p_contract bigint;
  r_contract bigint;
  r_paid boolean;
  r_allowed boolean;
  r_limit numeric;
  r_cost numeric;
begin
  select kontrak_sewa_id into p_contract
  from public.pembayaran_sewa
  where id=new.pembayaran_sewa_id;

  select kontrak_sewa_id,dibayar_kantor,dapat_dipotong,jumlah_dipotong,coalesce(biaya_aktual,estimasi_biaya,0)
    into r_contract,r_paid,r_allowed,r_limit,r_cost
  from public.perbaikan_sewa
  where id=new.perbaikan_sewa_id;

  if p_contract is null or r_contract is null then raise exception 'Pembayaran/perbaikan rental tidak ditemukan.'; end if;
  if p_contract <> r_contract then raise exception 'Potongan harus berasal dari kontrak rental yang sama.'; end if;
  if not r_paid or not r_allowed then raise exception 'Perbaikan belum memenuhi syarat untuk dipotong.'; end if;
  if new.jumlah_potongan <= 0 then raise exception 'Jumlah potongan harus lebih dari 0.'; end if;
  if new.jumlah_potongan > r_limit or new.jumlah_potongan > r_cost then
    raise exception 'Jumlah potongan melebihi nilai yang diperbolehkan.';
  end if;
  return new;
end;
$$;

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

create or replace function public.sync_transport_request_after_service()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status='SELESAI' and old.status is distinct from 'SELESAI'
     and new.permintaan_service_id is not null then
    update public.permintaan_service
    set status='SELESAI',
        diproses_oleh=coalesce(new.diproses_oleh,diproses_oleh),
        diproses_at=coalesce(new.selesai_at,now()),
        updated_at=now()
    where id=new.permintaan_service_id
      and status is distinct from 'SELESAI';
  end if;
  return new;
end;
$$;

create or replace function public.sync_transport_vehicle_km_after_service()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status='SELESAI' and old.status is distinct from 'SELESAI'
     and new.kendaraan_id is not null and new.kilometer is not null then
    update public.kendaraan
    set kilometer_terakhir=greatest(coalesce(kilometer_terakhir,0),new.kilometer),
        updated_at=now()
    where id=new.kendaraan_id;
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_vehicle_kilometer() from public,anon,authenticated;
revoke execute on function public.guard_vehicle_master_km_update() from public,anon,authenticated;
revoke execute on function public.guard_service_insert_workflow() from public,anon,authenticated;
revoke execute on function public.guard_service_approval() from public,anon,authenticated;
revoke execute on function public.guard_service_completion() from public,anon,authenticated;
revoke execute on function public.guard_service_detail_mutation() from public,anon,authenticated;
revoke execute on function public.guard_rental_payment() from public,anon,authenticated;
revoke execute on function public.guard_rental_deduction() from public,anon,authenticated;
revoke execute on function public.validate_transport_rental_repair() from public,anon,authenticated;
revoke execute on function public.record_service_completion_km() from public,anon,authenticated;
revoke execute on function public.sync_transport_request_after_service() from public,anon,authenticated;
revoke execute on function public.sync_transport_vehicle_km_after_service() from public,anon,authenticated;

drop trigger if exists trg_guard_vehicle_kilometer on public.riwayat_kilometer;
create trigger trg_guard_vehicle_kilometer
before insert on public.riwayat_kilometer
for each row execute function public.guard_vehicle_kilometer();

drop trigger if exists trg_guard_vehicle_master_km_update on public.kendaraan;
create trigger trg_guard_vehicle_master_km_update
before update of kilometer_terakhir on public.kendaraan
for each row execute function public.guard_vehicle_master_km_update();

drop trigger if exists trg_guard_service_insert_workflow on public.service;
create trigger trg_guard_service_insert_workflow
before insert on public.service
for each row execute function public.guard_service_insert_workflow();

drop trigger if exists trg_guard_service_approval on public.service_approval;
create trigger trg_guard_service_approval
before insert on public.service_approval
for each row execute function public.guard_service_approval();

drop trigger if exists trg_guard_service_completion on public.service;
create trigger trg_guard_service_completion
before update of status on public.service
for each row execute function public.guard_service_completion();

drop trigger if exists trg_guard_service_item_mutation on public.service_item;
create trigger trg_guard_service_item_mutation
before insert or delete or update on public.service_item
for each row execute function public.guard_service_detail_mutation();

drop trigger if exists trg_guard_service_bukti_mutation on public.service_bukti;
create trigger trg_guard_service_bukti_mutation
before insert or delete or update on public.service_bukti
for each row execute function public.guard_service_detail_mutation();

drop trigger if exists trg_guard_rental_payment on public.pembayaran_sewa;
create trigger trg_guard_rental_payment
before insert or update on public.pembayaran_sewa
for each row execute function public.guard_rental_payment();

drop trigger if exists trg_guard_rental_deduction on public.potongan_pembayaran_sewa;
create trigger trg_guard_rental_deduction
before insert or update on public.potongan_pembayaran_sewa
for each row execute function public.guard_rental_deduction();

drop trigger if exists trg_validate_transport_rental_repair on public.perbaikan_sewa;
create trigger trg_validate_transport_rental_repair
before insert or update on public.perbaikan_sewa
for each row execute function public.validate_transport_rental_repair();

drop trigger if exists trg_record_service_completion_km on public.service;
create trigger trg_record_service_completion_km
after update of status on public.service
for each row execute function public.record_service_completion_km();

drop trigger if exists trg_sync_transport_request_after_service on public.service;
create trigger trg_sync_transport_request_after_service
after update of status on public.service
for each row execute function public.sync_transport_request_after_service();

drop trigger if exists trg_sync_transport_vehicle_km_after_service on public.service;
create trigger trg_sync_transport_vehicle_km_after_service
after update of status on public.service
for each row execute function public.sync_transport_vehicle_km_after_service();
