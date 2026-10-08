-- Prevent destructive parent deletes from bypassing application guardrails.
-- These policies preserve historical/child data when direct API deletes are attempted.

drop policy if exists kendaraan_delete_admin on public.kendaraan;
create policy kendaraan_delete_admin
on public.kendaraan
for delete
to authenticated
using (
  (select private.has_any_role(ARRAY['ADMIN'::user_role]))
  and not exists (select 1 from public.dokumen_kendaraan d where d.kendaraan_id = kendaraan.id)
  and not exists (select 1 from public.permintaan_service ps where ps.kendaraan_id = kendaraan.id)
  and not exists (select 1 from public.service s where s.kendaraan_id = kendaraan.id)
  and not exists (select 1 from public.kontrak_sewa ks where ks.kendaraan_id = kendaraan.id)
  and not exists (select 1 from public.perbaikan_sewa pr where pr.kendaraan_id = kendaraan.id)
  and not exists (select 1 from public.riwayat_ban rb where rb.kendaraan_id = kendaraan.id)
  and not exists (select 1 from public.riwayat_aki ra where ra.kendaraan_id = kendaraan.id)
  and not exists (select 1 from public.riwayat_kilometer rk where rk.kendaraan_id = kendaraan.id)
);

drop policy if exists kontrak_sewa_write_import on public.kontrak_sewa;
drop policy if exists kontrak_sewa_select_rental on public.kontrak_sewa;
drop policy if exists kontrak_sewa_insert_rental on public.kontrak_sewa;
drop policy if exists kontrak_sewa_update_rental on public.kontrak_sewa;
drop policy if exists kontrak_sewa_delete_rental on public.kontrak_sewa;

create policy kontrak_sewa_select_rental
on public.kontrak_sewa
for select
to authenticated
using (private.has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role,'AKUNTANSI'::user_role]));

create policy kontrak_sewa_insert_rental
on public.kontrak_sewa
for insert
to authenticated
with check (private.has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role,'AKUNTANSI'::user_role]));

create policy kontrak_sewa_update_rental
on public.kontrak_sewa
for update
to authenticated
using (private.has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role,'AKUNTANSI'::user_role]))
with check (private.has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role,'AKUNTANSI'::user_role]));

create policy kontrak_sewa_delete_rental
on public.kontrak_sewa
for delete
to authenticated
using (
  private.has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role,'AKUNTANSI'::user_role])
  and not exists (select 1 from public.pembayaran_sewa p where p.kontrak_sewa_id = kontrak_sewa.id)
  and not exists (select 1 from public.perbaikan_sewa r where r.kontrak_sewa_id = kontrak_sewa.id)
);

drop policy if exists pembayaran_sewa_delete_rental on public.pembayaran_sewa;
create policy pembayaran_sewa_delete_rental
on public.pembayaran_sewa
for delete
to authenticated
using (
  private.has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role,'AKUNTANSI'::user_role])
  and not exists (
    select 1 from public.potongan_pembayaran_sewa pp
    where pp.pembayaran_sewa_id = pembayaran_sewa.id
  )
);
