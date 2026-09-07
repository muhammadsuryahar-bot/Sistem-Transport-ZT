-- Transport storage security.
-- All application buckets are private. Access is limited by authenticated role.

-- Vehicle documents: ADMIN + TRANSPORT
 drop policy if exists transport_vehicle_docs_select on storage.objects;
 create policy transport_vehicle_docs_select on storage.objects for select to authenticated using (
   bucket_id = 'dokumen-kendaraan'
   and public.has_any_role(array['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role])
 );
 drop policy if exists transport_vehicle_docs_insert on storage.objects;
 create policy transport_vehicle_docs_insert on storage.objects for insert to authenticated with check (
   bucket_id = 'dokumen-kendaraan'
   and public.has_any_role(array['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role])
 );
 drop policy if exists transport_vehicle_docs_update on storage.objects;
 create policy transport_vehicle_docs_update on storage.objects for update to authenticated using (
   bucket_id = 'dokumen-kendaraan'
   and public.has_any_role(array['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role])
 ) with check (
   bucket_id = 'dokumen-kendaraan'
   and public.has_any_role(array['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role])
 );
 drop policy if exists transport_vehicle_docs_delete on storage.objects;
 create policy transport_vehicle_docs_delete on storage.objects for delete to authenticated using (
   bucket_id = 'dokumen-kendaraan'
   and public.has_any_role(array['ADMIN'::public.user_role])
 );

-- Service evidence, including before/after part photos: ADMIN + TRANSPORT
 drop policy if exists transport_service_bukti_select on storage.objects;
 create policy transport_service_bukti_select on storage.objects for select to authenticated using (
   bucket_id = 'service-bukti'
   and public.has_any_role(array['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role])
 );
 drop policy if exists transport_service_bukti_insert on storage.objects;
 create policy transport_service_bukti_insert on storage.objects for insert to authenticated with check (
   bucket_id = 'service-bukti'
   and public.has_any_role(array['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role])
 );
 drop policy if exists transport_service_bukti_update on storage.objects;
 create policy transport_service_bukti_update on storage.objects for update to authenticated using (
   bucket_id = 'service-bukti'
   and public.has_any_role(array['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role])
 ) with check (
   bucket_id = 'service-bukti'
   and public.has_any_role(array['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role])
 );
 drop policy if exists transport_service_bukti_delete on storage.objects;
 create policy transport_service_bukti_delete on storage.objects for delete to authenticated using (
   bucket_id = 'service-bukti'
   and public.has_any_role(array['ADMIN'::public.user_role])
 );

-- Rental contracts, payment proofs, and rental repair evidence:
-- ADMIN + TRANSPORT + AKUNTANSI may view/upload; only ADMIN/TRANSPORT may delete.
 drop policy if exists transport_rental_docs_select on storage.objects;
 create policy transport_rental_docs_select on storage.objects for select to authenticated using (
   bucket_id = 'dokumen-sewa'
   and public.has_any_role(array['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role, 'AKUNTANSI'::public.user_role])
 );
 drop policy if exists transport_rental_docs_insert on storage.objects;
 create policy transport_rental_docs_insert on storage.objects for insert to authenticated with check (
   bucket_id = 'dokumen-sewa'
   and public.has_any_role(array['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role, 'AKUNTANSI'::public.user_role])
 );
 drop policy if exists transport_rental_docs_update on storage.objects;
 create policy transport_rental_docs_update on storage.objects for update to authenticated using (
   bucket_id = 'dokumen-sewa'
   and public.has_any_role(array['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role, 'AKUNTANSI'::public.user_role])
 ) with check (
   bucket_id = 'dokumen-sewa'
   and public.has_any_role(array['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role, 'AKUNTANSI'::public.user_role])
 );
 drop policy if exists transport_rental_docs_delete on storage.objects;
 create policy transport_rental_docs_delete on storage.objects for delete to authenticated using (
   bucket_id = 'dokumen-sewa'
   and public.has_any_role(array['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role])
 );

-- Vehicle-related files bucket, reserved for ADMIN/TRANSPORT writes.
 drop policy if exists transport_vehicle_bucket_select on storage.objects;
 create policy transport_vehicle_bucket_select on storage.objects for select to authenticated using (
   bucket_id = 'kendaraan'
   and public.has_any_role(array['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role])
 );
 drop policy if exists transport_vehicle_bucket_insert on storage.objects;
 create policy transport_vehicle_bucket_insert on storage.objects for insert to authenticated with check (
   bucket_id = 'kendaraan'
   and public.has_any_role(array['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role])
 );
 drop policy if exists transport_vehicle_bucket_update on storage.objects;
 create policy transport_vehicle_bucket_update on storage.objects for update to authenticated using (
   bucket_id = 'kendaraan'
   and public.has_any_role(array['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role])
 ) with check (
   bucket_id = 'kendaraan'
   and public.has_any_role(array['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role])
 );
 drop policy if exists transport_vehicle_bucket_delete on storage.objects;
 create policy transport_vehicle_bucket_delete on storage.objects for delete to authenticated using (
   bucket_id = 'kendaraan'
   and public.has_any_role(array['ADMIN'::public.user_role])
 );
