-- Transport system RLS + Storage hardening and missing write paths.

revoke execute on function public.get_my_role() from public, anon;
grant execute on function public.get_my_role() to authenticated;
revoke execute on function public.has_any_role(public.user_role[]) from public, anon;
grant execute on function public.has_any_role(public.user_role[]) to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles for update to authenticated
using (has_any_role(ARRAY['ADMIN'::user_role]))
with check (has_any_role(ARRAY['ADMIN'::user_role]));

drop policy if exists permintaan_service_select_manage on public.permintaan_service;
create policy permintaan_service_select_manage on public.permintaan_service for select to authenticated
using (
  pemohon_id = auth.uid()
  or has_any_role(ARRAY[
    'ADMIN'::user_role,'TRANSPORT'::user_role,'ATASAN_TRANSPORT'::user_role,
    'DIREKTUR'::user_role,'AKUNTANSI'::user_role
  ])
);

drop policy if exists permintaan_service_update_transport on public.permintaan_service;
create policy permintaan_service_update_transport on public.permintaan_service for update to authenticated
using (has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role]))
with check (has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role]));

drop policy if exists permintaan_service_delete_admin on public.permintaan_service;
create policy permintaan_service_delete_admin on public.permintaan_service for delete to authenticated
using (has_any_role(ARRAY['ADMIN'::user_role]));

drop policy if exists service_select_manage on public.service;
create policy service_select_manage on public.service for select to authenticated
using (has_any_role(ARRAY[
  'ADMIN'::user_role,'TRANSPORT'::user_role,'ATASAN_TRANSPORT'::user_role,
  'DIREKTUR'::user_role,'AKUNTANSI'::user_role
]));

drop policy if exists service_update_approver on public.service;
create policy service_update_approver on public.service for update to authenticated
using (
  (has_any_role(ARRAY['ATASAN_TRANSPORT'::user_role]) and coalesce(biaya_aktual,estimasi_biaya,0) <= 5000000)
  or
  (has_any_role(ARRAY['DIREKTUR'::user_role]) and coalesce(biaya_aktual,estimasi_biaya,0) > 5000000)
)
with check (
  status in ('DISETUJUI','DITOLAK')
  and (
    (has_any_role(ARRAY['ATASAN_TRANSPORT'::user_role]) and coalesce(biaya_aktual,estimasi_biaya,0) <= 5000000)
    or
    (has_any_role(ARRAY['DIREKTUR'::user_role]) and coalesce(biaya_aktual,estimasi_biaya,0) > 5000000)
  )
);

create or replace function public.prevent_approver_service_data_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if has_any_role(ARRAY['ATASAN_TRANSPORT'::user_role,'DIREKTUR'::user_role]) then
    if new.nomor_service is distinct from old.nomor_service
       or new.permintaan_service_id is distinct from old.permintaan_service_id
       or new.kendaraan_id is distinct from old.kendaraan_id
       or new.tanggal_service is distinct from old.tanggal_service
       or new.kilometer is distinct from old.kilometer
       or new.bengkel is distinct from old.bengkel
       or new.jenis_service is distinct from old.jenis_service
       or new.keluhan is distinct from old.keluhan
       or new.estimasi_biaya is distinct from old.estimasi_biaya
       or new.biaya_aktual is distinct from old.biaya_aktual
       or new.nilai_dpp is distinct from old.nilai_dpp
       or new.ppn is distinct from old.ppn
       or new.total is distinct from old.total
       or new.diproses_oleh is distinct from old.diproses_oleh
       or new.selesai_at is distinct from old.selesai_at
       or new.catatan is distinct from old.catatan
    then
      raise exception 'Approver hanya boleh mengubah status approval service.';
    end if;
    if new.status not in ('DISETUJUI','DITOLAK') then
      raise exception 'Approver hanya boleh menetapkan status DISETUJUI atau DITOLAK.';
    end if;
    if has_any_role(ARRAY['ATASAN_TRANSPORT'::user_role])
       and coalesce(old.biaya_aktual,old.estimasi_biaya,0) > 5000000 then
      raise exception 'Service di atas Rp5.000.000 harus di-approve Direktur.';
    end if;
    if has_any_role(ARRAY['DIREKTUR'::user_role])
       and coalesce(old.biaya_aktual,old.estimasi_biaya,0) <= 5000000 then
      raise exception 'Service sampai Rp5.000.000 harus di-approve Atasan Transport.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_approver_service_data_change on public.service;
create trigger trg_prevent_approver_service_data_change
before update on public.service
for each row execute function public.prevent_approver_service_data_change();
revoke execute on function public.prevent_approver_service_data_change() from public,anon,authenticated;

drop policy if exists service_item_select_report on public.service_item;
create policy service_item_select_report on public.service_item for select to authenticated
using (has_any_role(ARRAY[
  'ADMIN'::user_role,'TRANSPORT'::user_role,'ATASAN_TRANSPORT'::user_role,
  'DIREKTUR'::user_role,'AKUNTANSI'::user_role
]));

drop policy if exists service_approval_select_report on public.service_approval;
create policy service_approval_select_report on public.service_approval for select to authenticated
using (has_any_role(ARRAY[
  'ADMIN'::user_role,'TRANSPORT'::user_role,'ATASAN_TRANSPORT'::user_role,
  'DIREKTUR'::user_role,'AKUNTANSI'::user_role
]));

drop policy if exists service_approval_insert_role on public.service_approval;
create policy service_approval_insert_role on public.service_approval for insert to authenticated
with check (
  has_any_role(ARRAY['ADMIN'::user_role])
  or (
    jenis_approval='ATASAN_TRANSPORT' and has_any_role(ARRAY['ATASAN_TRANSPORT'::user_role])
    and exists (select 1 from public.service s where s.id=service_id and coalesce(s.biaya_aktual,s.estimasi_biaya,0) <= 5000000)
  )
  or (
    jenis_approval='DIREKTUR' and has_any_role(ARRAY['DIREKTUR'::user_role])
    and exists (select 1 from public.service s where s.id=service_id and coalesce(s.biaya_aktual,s.estimasi_biaya,0) > 5000000)
  )
);

drop policy if exists service_bukti_select_report on public.service_bukti;
create policy service_bukti_select_report on public.service_bukti for select to authenticated
using (has_any_role(ARRAY[
  'ADMIN'::user_role,'TRANSPORT'::user_role,'ATASAN_TRANSPORT'::user_role,
  'DIREKTUR'::user_role,'AKUNTANSI'::user_role
]));

drop policy if exists service_bukti_insert_transport on public.service_bukti;
create policy service_bukti_insert_transport on public.service_bukti for insert to authenticated
with check (has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role]));

drop policy if exists riwayat_ban_select_report on public.riwayat_ban;
create policy riwayat_ban_select_report on public.riwayat_ban for select to authenticated
using (has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role,'ATASAN_TRANSPORT'::user_role,'DIREKTUR'::user_role,'AKUNTANSI'::user_role]));
drop policy if exists riwayat_ban_insert_transport on public.riwayat_ban;
create policy riwayat_ban_insert_transport on public.riwayat_ban for insert to authenticated
with check (has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role]));

drop policy if exists riwayat_aki_select_report on public.riwayat_aki;
create policy riwayat_aki_select_report on public.riwayat_aki for select to authenticated
using (has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role,'ATASAN_TRANSPORT'::user_role,'DIREKTUR'::user_role,'AKUNTANSI'::user_role]));
drop policy if exists riwayat_aki_insert_transport on public.riwayat_aki;
create policy riwayat_aki_insert_transport on public.riwayat_aki for insert to authenticated
with check (has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role]));

drop policy if exists riwayat_kilometer_select_report on public.riwayat_kilometer;
create policy riwayat_kilometer_select_report on public.riwayat_kilometer for select to authenticated
using (has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role,'ATASAN_TRANSPORT'::user_role,'DIREKTUR'::user_role,'AKUNTANSI'::user_role]));
drop policy if exists riwayat_kilometer_insert_transport on public.riwayat_kilometer;
create policy riwayat_kilometer_insert_transport on public.riwayat_kilometer for insert to authenticated
with check (has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role]));

drop policy if exists pembayaran_sewa_select_rental on public.pembayaran_sewa;
create policy pembayaran_sewa_select_rental on public.pembayaran_sewa for select to authenticated
using (has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role,'AKUNTANSI'::user_role]));
drop policy if exists pembayaran_sewa_insert_rental on public.pembayaran_sewa;
create policy pembayaran_sewa_insert_rental on public.pembayaran_sewa for insert to authenticated
with check (has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role,'AKUNTANSI'::user_role]));

drop policy if exists perbaikan_sewa_select_rental on public.perbaikan_sewa;
create policy perbaikan_sewa_select_rental on public.perbaikan_sewa for select to authenticated
using (has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role,'AKUNTANSI'::user_role]));
drop policy if exists perbaikan_sewa_insert_rental on public.perbaikan_sewa;
create policy perbaikan_sewa_insert_rental on public.perbaikan_sewa for insert to authenticated
with check (has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role]));

drop policy if exists potongan_pembayaran_sewa_select_rental on public.potongan_pembayaran_sewa;
create policy potongan_pembayaran_sewa_select_rental on public.potongan_pembayaran_sewa for select to authenticated
using (has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role,'AKUNTANSI'::user_role]));
drop policy if exists potongan_pembayaran_sewa_insert_rental on public.potongan_pembayaran_sewa;
create policy potongan_pembayaran_sewa_insert_rental on public.potongan_pembayaran_sewa for insert to authenticated
with check (has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role,'AKUNTANSI'::user_role]));

drop policy if exists dokumen_kendaraan_select_report_roles on public.dokumen_kendaraan;
create policy dokumen_kendaraan_select_report_roles on public.dokumen_kendaraan for select to authenticated
using (has_any_role(ARRAY[
  'ADMIN'::user_role,'TRANSPORT'::user_role,'ATASAN_TRANSPORT'::user_role,
  'DIREKTUR'::user_role,'AKUNTANSI'::user_role
]));

drop policy if exists storage_kendaraan_select on storage.objects;
create policy storage_kendaraan_select on storage.objects for select to authenticated
using (bucket_id='kendaraan' and has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role]));
drop policy if exists storage_kendaraan_insert_admin on storage.objects;
create policy storage_kendaraan_insert_admin on storage.objects for insert to authenticated
with check (bucket_id='kendaraan' and has_any_role(ARRAY['ADMIN'::user_role]));
drop policy if exists storage_kendaraan_delete_admin on storage.objects;
create policy storage_kendaraan_delete_admin on storage.objects for delete to authenticated
using (bucket_id='kendaraan' and has_any_role(ARRAY['ADMIN'::user_role]));
drop policy if exists storage_kendaraan_update_admin on storage.objects;
create policy storage_kendaraan_update_admin on storage.objects for update to authenticated
using (bucket_id='kendaraan' and has_any_role(ARRAY['ADMIN'::user_role]))
with check (bucket_id='kendaraan' and has_any_role(ARRAY['ADMIN'::user_role]));

drop policy if exists storage_service_bukti_select on storage.objects;
create policy storage_service_bukti_select on storage.objects for select to authenticated
using (bucket_id='service-bukti' and has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role,'ATASAN_TRANSPORT'::user_role,'DIREKTUR'::user_role]));
drop policy if exists storage_service_bukti_insert on storage.objects;
create policy storage_service_bukti_insert on storage.objects for insert to authenticated
with check (bucket_id='service-bukti' and has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role]));
drop policy if exists storage_service_bukti_delete on storage.objects;
create policy storage_service_bukti_delete on storage.objects for delete to authenticated
using (bucket_id='service-bukti' and has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role]));
drop policy if exists storage_service_bukti_update on storage.objects;
create policy storage_service_bukti_update on storage.objects for update to authenticated
using (bucket_id='service-bukti' and has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role]))
with check (bucket_id='service-bukti' and has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role]));

drop policy if exists storage_dokumen_kendaraan_select on storage.objects;
create policy storage_dokumen_kendaraan_select on storage.objects for select to authenticated
using (bucket_id='dokumen-kendaraan' and has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role]));
drop policy if exists storage_dokumen_kendaraan_insert on storage.objects;
create policy storage_dokumen_kendaraan_insert on storage.objects for insert to authenticated
with check (bucket_id='dokumen-kendaraan' and has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role]));
drop policy if exists storage_dokumen_kendaraan_delete on storage.objects;
create policy storage_dokumen_kendaraan_delete on storage.objects for delete to authenticated
using (bucket_id='dokumen-kendaraan' and has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role]));
drop policy if exists storage_dokumen_kendaraan_update on storage.objects;
create policy storage_dokumen_kendaraan_update on storage.objects for update to authenticated
using (bucket_id='dokumen-kendaraan' and has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role]))
with check (bucket_id='dokumen-kendaraan' and has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role]));

drop policy if exists storage_dokumen_sewa_select on storage.objects;
create policy storage_dokumen_sewa_select on storage.objects for select to authenticated
using (bucket_id='dokumen-sewa' and has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role,'AKUNTANSI'::user_role]));
drop policy if exists storage_dokumen_sewa_insert on storage.objects;
create policy storage_dokumen_sewa_insert on storage.objects for insert to authenticated
with check (bucket_id='dokumen-sewa' and has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role,'AKUNTANSI'::user_role]));
drop policy if exists storage_dokumen_sewa_delete on storage.objects;
create policy storage_dokumen_sewa_delete on storage.objects for delete to authenticated
using (bucket_id='dokumen-sewa' and has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role,'AKUNTANSI'::user_role]));
drop policy if exists storage_dokumen_sewa_update on storage.objects;
create policy storage_dokumen_sewa_update on storage.objects for update to authenticated
using (bucket_id='dokumen-sewa' and has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role,'AKUNTANSI'::user_role]))
with check (bucket_id='dokumen-sewa' and has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role,'AKUNTANSI'::user_role]));
