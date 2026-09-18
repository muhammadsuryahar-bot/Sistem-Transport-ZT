
-- Final workflow hardening aligned with the current Transport frontend/database contract.

-- Core uniqueness rules.
create unique index if not exists ux_kontrak_sewa_active_vehicle
  on public.kontrak_sewa (kendaraan_id)
  where status = 'AKTIF';

create unique index if not exists ux_service_one_request
  on public.service (permintaan_service_id)
  where permintaan_service_id is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname='pembayaran_sewa_periode_max_check'
  ) then
    alter table public.pembayaran_sewa
      add constraint pembayaran_sewa_periode_max_check check (periode_ke between 1 and 6);
  end if;
  if not exists (
    select 1 from pg_constraint where conname='kontrak_sewa_exact_six_months_check'
  ) then
    alter table public.kontrak_sewa
      add constraint kontrak_sewa_exact_six_months_check
      check (
        periode_bulan = 6
        and tanggal_selesai = (tanggal_mulai + interval '6 months' - interval '1 day')::date
      );
  end if;
  if not exists (
    select 1 from pg_constraint where conname='pembayaran_sewa_dibayar_le_tagihan_check'
  ) then
    alter table public.pembayaran_sewa
      add constraint pembayaran_sewa_dibayar_le_tagihan_check
      check (jumlah_dibayar <= jumlah_tagihan);
  end if;
end $$;

-- Service creation guard: same request vehicle, one service per request,
-- and approval is required for high value or cost escalation.
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

drop trigger if exists trg_guard_service_insert_workflow on public.service;
create trigger trg_guard_service_insert_workflow
before insert on public.service
for each row execute function public.guard_service_insert_workflow();

-- Approval guard. Database stores the existing enum-compatible label
-- KEPALA_BAGIAN for Atasan Transport.
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
  where service_id = svc.id and status='DISETUJUI';

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

-- Repair rental guard.
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

  if new.dapat_dipotong and not new.dibayar_kantor then
    raise exception 'Perbaikan tidak boleh ditandai dapat dipotong sebelum dibayar kantor.';
  end if;

  if new.dapat_dipotong and coalesce(new.jumlah_dipotong,0) <= 0 then
    raise exception 'Jumlah potongan wajib lebih dari 0 jika perbaikan dapat dipotong.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_transport_rental_repair on public.perbaikan_sewa;
create trigger trg_validate_transport_rental_repair
before insert or update on public.perbaikan_sewa
for each row execute function public.validate_transport_rental_repair();

-- Payment deduction integrity.
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
  select kontrak_sewa_id into p_contract from public.pembayaran_sewa where id=new.pembayaran_sewa_id;
  select kontrak_sewa_id,dibayar_kantor,dapat_dipotong,jumlah_dipotong,coalesce(biaya_aktual,estimasi_biaya,0)
    into r_contract,r_paid,r_allowed,r_limit,r_cost
  from public.perbaikan_sewa where id=new.perbaikan_sewa_id;

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

drop trigger if exists trg_guard_rental_deduction on public.potongan_pembayaran_sewa;
create trigger trg_guard_rental_deduction
before insert or update on public.potongan_pembayaran_sewa
for each row execute function public.guard_rental_deduction();

-- Service completion guard.
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

  -- Excel history imports are already historical records; they are allowed to
  -- close without creating artificial approval/evidence records.
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

drop trigger if exists trg_guard_service_completion on public.service;
create trigger trg_guard_service_completion
before update of status on public.service
for each row execute function public.guard_service_completion();

-- Synchronization triggers for completion.
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

drop trigger if exists trg_sync_transport_request_after_service on public.service;
create trigger trg_sync_transport_request_after_service
after update of status on public.service
for each row execute function public.sync_transport_request_after_service();

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

drop trigger if exists trg_sync_transport_vehicle_km_after_service on public.service;
create trigger trg_sync_transport_vehicle_km_after_service
after update of status on public.service
for each row execute function public.sync_transport_vehicle_km_after_service();

create or replace function public.record_service_completion_km()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status='SELESAI' and old.status is distinct from 'SELESAI' and new.kilometer is not null then
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

-- Completed service detail is immutable.
create or replace function public.guard_service_detail_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  service_status text;
begin
  select s.status into service_status
  from public.service s
  where s.id=coalesce(new.service_id,old.service_id);

  if service_status in ('SELESAI','DITOLAK','DIBATALKAN') then
    raise exception 'Detail service tidak dapat diubah setelah service berstatus %.',service_status;
  end if;
  return coalesce(new,old);
end;
$$;

drop trigger if exists trg_guard_service_item_mutation on public.service_item;
create trigger trg_guard_service_item_mutation
before insert or update or delete on public.service_item
for each row execute function public.guard_service_detail_mutation();

drop trigger if exists trg_guard_service_bukti_mutation on public.service_bukti;
create trigger trg_guard_service_bukti_mutation
before insert or update or delete on public.service_bukti
for each row execute function public.guard_service_detail_mutation();

-- Kilometer can never move backwards.
create or replace function public.guard_vehicle_kilometer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_km numeric;
begin
  select coalesce(kilometer_terakhir,0) into current_km
  from public.kendaraan where id=new.kendaraan_id for update;

  if current_km is null then current_km := 0; end if;

  if new.kilometer < current_km then
    raise exception 'KM baru tidak boleh lebih kecil dari KM terakhir kendaraan (%).', current_km;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_vehicle_kilometer on public.riwayat_kilometer;
create trigger trg_guard_vehicle_kilometer
before insert on public.riwayat_kilometer
for each row execute function public.guard_vehicle_kilometer();

-- Storage/document deletion access for roles that can manage documents.
drop policy if exists dokumen_kendaraan_delete_manage on public.dokumen_kendaraan;
create policy dokumen_kendaraan_delete_manage
on public.dokumen_kendaraan for delete to authenticated
using ((select has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role])));

-- Approval insert policy delegates exact authority to the trigger above.
drop policy if exists service_approval_insert_role on public.service_approval;
create policy service_approval_insert_role
on public.service_approval for insert to authenticated
with check (
  (select has_any_role(ARRAY['ADMIN'::user_role]))
  or (select has_any_role(ARRAY['ATASAN_TRANSPORT'::user_role,'DIREKTUR'::user_role]))
);

-- Prevent direct execution of trigger-only helpers.
revoke execute on function public.guard_service_insert_workflow() from public,anon,authenticated;
revoke execute on function public.guard_service_approval() from public,anon,authenticated;
revoke execute on function public.validate_transport_rental_repair() from public,anon,authenticated;
revoke execute on function public.guard_rental_deduction() from public,anon,authenticated;
revoke execute on function public.guard_service_completion() from public,anon,authenticated;
revoke execute on function public.sync_transport_request_after_service() from public,anon,authenticated;
revoke execute on function public.sync_transport_vehicle_km_after_service() from public,anon,authenticated;
revoke execute on function public.record_service_completion_km() from public,anon,authenticated;
revoke execute on function public.guard_service_detail_mutation() from public,anon,authenticated;
revoke execute on function public.guard_vehicle_kilometer() from public,anon,authenticated;
