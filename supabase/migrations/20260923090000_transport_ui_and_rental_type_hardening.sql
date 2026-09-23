-- Keep rental vehicles limited to the two business categories requested by the transport module.
update public.kendaraan
set jenis_sewa = case
  when upper(trim(coalesce(pemilik,''))) ~ '^(PT|CV|UD|YAYASAN|KOPERASI)(\\.|\\s|$)' then 'SEWA_PERUSAHAAN'
  when trim(coalesce(pemilik,'')) <> '' then 'SEWA_PERORANGAN'
  else jenis_sewa
end
where kepemilikan = 'SEWA'
  and jenis_sewa is null;

alter table public.kendaraan drop constraint if exists kendaraan_jenis_sewa_check;
alter table public.kendaraan
  add constraint kendaraan_jenis_sewa_check
  check (
    (kepemilikan = 'ASET' and jenis_sewa is null)
    or
    (kepemilikan = 'SEWA' and jenis_sewa in ('SEWA_PERORANGAN','SEWA_PERUSAHAAN'))
  );

-- CRUD permissions used by the transport UI. Each statement is idempotent so
-- this migration can be replayed safely against an already-hardened project.

drop policy if exists service_delete_transport on public.service;
create policy service_delete_transport
on public.service
for delete to authenticated
using (
  private.has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role])
  and not exists (select 1 from public.service_item i where i.service_id = service.id)
  and not exists (select 1 from public.service_bukti b where b.service_id = service.id)
  and not exists (select 1 from public.service_approval a where a.service_id = service.id)
);

drop policy if exists service_bukti_update_transport on public.service_bukti;
create policy service_bukti_update_transport
on public.service_bukti
for update to authenticated
using (private.has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role]))
with check (private.has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role]));

drop policy if exists service_bukti_delete_transport on public.service_bukti;
create policy service_bukti_delete_transport
on public.service_bukti
for delete to authenticated
using (private.has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role]));

drop policy if exists riwayat_ban_update_transport on public.riwayat_ban;
create policy riwayat_ban_update_transport
on public.riwayat_ban
for update to authenticated
using (private.has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role]))
with check (private.has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role]));

drop policy if exists riwayat_ban_delete_transport on public.riwayat_ban;
create policy riwayat_ban_delete_transport
on public.riwayat_ban
for delete to authenticated
using (private.has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role]));

drop policy if exists riwayat_aki_update_transport on public.riwayat_aki;
create policy riwayat_aki_update_transport
on public.riwayat_aki
for update to authenticated
using (private.has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role]))
with check (private.has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role]));

drop policy if exists riwayat_aki_delete_transport on public.riwayat_aki;
create policy riwayat_aki_delete_transport
on public.riwayat_aki
for delete to authenticated
using (private.has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role]));

drop policy if exists riwayat_kilometer_update_transport on public.riwayat_kilometer;
create policy riwayat_kilometer_update_transport
on public.riwayat_kilometer
for update to authenticated
using (private.has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role]))
with check (private.has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role]));

drop policy if exists riwayat_kilometer_delete_transport on public.riwayat_kilometer;
create policy riwayat_kilometer_delete_transport
on public.riwayat_kilometer
for delete to authenticated
using (private.has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role]));
