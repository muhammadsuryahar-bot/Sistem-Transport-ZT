-- Transport database performance and RLS policy cleanup.

-- Cover foreign keys reported by the Supabase performance advisor.
create index if not exists idx_kontrak_dibuat_oleh on public.kontrak_sewa (dibuat_oleh);
create index if not exists idx_pembayaran_diproses_oleh on public.pembayaran_sewa (diproses_oleh);
create index if not exists idx_perbaikan_dicatat_oleh on public.perbaikan_sewa (dicatat_oleh);
create index if not exists idx_permintaan_diproses_oleh on public.permintaan_service (diproses_oleh);
create index if not exists idx_permintaan_bukti_uploaded_by on public.permintaan_service_bukti (uploaded_by);
create index if not exists idx_riwayat_aki_dicatat_oleh on public.riwayat_aki (dicatat_oleh);
create index if not exists idx_riwayat_ban_dicatat_oleh on public.riwayat_ban (dicatat_oleh);
create index if not exists idx_riwayat_kilometer_dicatat_oleh on public.riwayat_kilometer (dicatat_oleh);
create index if not exists idx_service_diproses_oleh on public.service (diproses_oleh);
create index if not exists idx_service_approval_pemberi on public.service_approval (pemberi_approval);
create index if not exists idx_service_bukti_uploaded_by on public.service_bukti (uploaded_by);

-- Replace row-by-row auth checks with initplan-safe expressions.
drop policy if exists profiles_select_admin on public.profiles;
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_authenticated
on public.profiles for select to authenticated
using (
  (select has_any_role(ARRAY['ADMIN'::user_role]))
  or id = (select auth.uid())
);

drop policy if exists driver_select_authenticated_active on public.driver;
create policy driver_select_authenticated_active
on public.driver for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.aktif = true
  )
);

drop policy if exists kendaraan_select_authenticated_active on public.kendaraan;
create policy kendaraan_select_authenticated_active
on public.kendaraan for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.aktif = true
  )
);

drop policy if exists permintaan_service_insert_import on public.permintaan_service;
create policy permintaan_service_insert_import
on public.permintaan_service for insert to authenticated
with check (
  pemohon_id = (select auth.uid())
  and (select has_any_role(ARRAY['ADMIN'::user_role,'OPERASIONAL'::user_role,'TRANSPORT'::user_role]))
);

drop policy if exists permintaan_service_select_manage on public.permintaan_service;
create policy permintaan_service_select_manage
on public.permintaan_service for select to authenticated
using (
  pemohon_id = (select auth.uid())
  or (select has_any_role(ARRAY[
    'ADMIN'::user_role,'TRANSPORT'::user_role,'ATASAN_TRANSPORT'::user_role,
    'DIREKTUR'::user_role,'AKUNTANSI'::user_role
  ]))
);

-- Consolidate document SELECT policies.
drop policy if exists dokumen_kendaraan_select_import on public.dokumen_kendaraan;
drop policy if exists dokumen_kendaraan_select_report_roles on public.dokumen_kendaraan;
create policy dokumen_kendaraan_select_roles
on public.dokumen_kendaraan for select to authenticated
using (
  (select has_any_role(ARRAY[
    'ADMIN'::user_role,'TRANSPORT'::user_role,'ATASAN_TRANSPORT'::user_role,
    'DIREKTUR'::user_role,'AKUNTANSI'::user_role
  ]))
);

-- Consolidate service UPDATE policies while keeping approvers restricted by trigger.
drop policy if exists service_update_import on public.service;
drop policy if exists service_update_approver on public.service;
create policy service_update_roles
on public.service for update to authenticated
using (
  (select has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role]))
  or (
    (select has_any_role(ARRAY['ATASAN_TRANSPORT'::user_role]))
    and coalesce(biaya_aktual,estimasi_biaya,0) <= 5000000
  )
  or (
    (select has_any_role(ARRAY['DIREKTUR'::user_role]))
    and coalesce(biaya_aktual,estimasi_biaya,0) > 5000000
  )
)
with check (
  (select has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role]))
  or (
    status in ('DISETUJUI','DITOLAK')
    and (select has_any_role(ARRAY['ATASAN_TRANSPORT'::user_role]))
    and coalesce(biaya_aktual,estimasi_biaya,0) <= 5000000
  )
  or (
    status in ('DISETUJUI','DITOLAK')
    and (select has_any_role(ARRAY['DIREKTUR'::user_role]))
    and coalesce(biaya_aktual,estimasi_biaya,0) > 5000000
  )
);

-- Split service_item write permissions so SELECT has one policy.
drop policy if exists service_item_write_import on public.service_item;
drop policy if exists service_item_select_report on public.service_item;
create policy service_item_select_report
on public.service_item for select to authenticated
using (
  (select has_any_role(ARRAY[
    'ADMIN'::user_role,'TRANSPORT'::user_role,'ATASAN_TRANSPORT'::user_role,
    'DIREKTUR'::user_role,'AKUNTANSI'::user_role
  ]))
);
create policy service_item_insert_transport
on public.service_item for insert to authenticated
with check ((select has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role])));
create policy service_item_update_transport
on public.service_item for update to authenticated
using ((select has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role])))
with check ((select has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role])));
create policy service_item_delete_transport
on public.service_item for delete to authenticated
using ((select has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role])));
