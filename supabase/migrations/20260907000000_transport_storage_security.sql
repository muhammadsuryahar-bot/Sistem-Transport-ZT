-- Transport storage security.
-- All application buckets are private. Access is limited by authenticated role.

-- Read/write: ADMIN + TRANSPORT
 drop policy if exists transport_vehicle_docs_select on storage.objects;
 create policy transport_vehicle_docs_select
 on storage.objects for select to authenticated
 using (
   bucket_id = 'dokumen-kendaraan'
   and public.has_any_role(array['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role])
 );
 drop policy if exists transport_vehicle_docs_insert on storage.objects;
 create policy transport_vehicle_docs_insert
 on storage.objects for insert to authenticated
 with check (
   bucket_id = 'dokumen-kendaraan'
   and public.has_any_role(array['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role])
 );
 drop policy if exists transport_vehicle_docs_update on storage.objects;
 create policy transport_vehicle_docs_update
 on storage.objects for update to authenticated
 using (
   bucket_id = 'dokumen-kendaraan'
   and public.has_any_role(array['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role])
 )
 with check (
   bucket_id = 'dokumen-kendaraan'
   and public.has_any_role(array['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role])
 );
 drop policy if exists transport_vehicle_docs_delete on storage.objects;
 create policy transport_vehicle_docs_delete
 on storage.objects for delete to authenticated
 using (
   bucket_id = 'dokumen-kendaraan'
   and public.has_any_role(array['ADMIN'::public.user_role])
 );

-- Service evidence: ADMIN + TRANSPORT
 drop policy if exists transport_service_bukti_select on storage.objects;
 create policy transport_service_bukti_select
 on storage.objects for select to authenticated
 using (
   bucket_id = 'service-bukti'
   and public.has_any_role(array['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role])
 );
 drop policy if exists transport_service_bukti_insert on storage.objects;
 create policy transport_service_bukti_insert
 on storage.objects for insert to authenticated
 with check (
   bucket_id = 'service-bukti'
   and public.has_any_role(array['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role])
 );
 drop policy if exists transport_service_bukti_update on storage.objects;
 create policy transport_service_bukti_update
 on storage.objects for update to authenticated
 using (
   bucket_id = 'service-bukti'
   and public.has_any_role(array['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role])
 )
 with check (
   bucket_id = 'service-bukti'
   and public.has_any_role(array['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role])
 );
 drop policy if exists transport_service_bukti_delete on storage.objects;
 create policy transport_service_bukti_delete
 on storage.objects for delete to authenticated
 using (
   bucket_id = 'service-bukti'
   and public.has_any_role(array['ADMIN'::public.user_role])
 );

-- Rental documents/evidence: ADMIN + TRANSPORT + AKUNTANSI
 drop policy if exists transport_rental_docs_select on storage.objects;
 create policy transport_rental_docs_select
 on storage.objects for select to authenticated
 using (
   bucket_id = 'dokumen-sewa'
   and public.has_any_role(array['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role, 'AKUNTANSI'::public.user_role])
 );
 drop policy if exists transport_rental_docs_insert on storage.objects;
 create policy transport_rental_docs_insert
 on storage.objects for insert to authenticated
 with check (
   bucket_id = 'dokumen-sewa'
   and public.has_any_role(array['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role, 'AKUNTANSI'::public.user_role])
 );
 drop policy if exists transport_rental_docs_update on storage.objects;
 create policy transport_rental_docs_update
 on storage.objects for update to authenticated
 using (
   bucket_id = 'dokumen-sewa'
   and public.has_any_role(array['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role, 'AKUNTANSI'::public.user_role])
 )
 with check (
   bucket_id = 'dokumen-sewa'
   and public.has_any_role(array['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role, 'AKUNTANSI'::public.user_role])
 );
 drop policy if exists transport_rental_docs_delete on storage.objects;
 create policy transport_rental_docs_delete
 on storage.objects for delete to authenticated
 using (
   bucket_id = 'dokumen-sewa'
   and public.has_any_role(array['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role])
 );

-- General rental vehicle photos/evidence bucket. Kept aligned with rental-role access.
 drop policy if exists transport_rental_bucket_select on storage.objects;
 create policy transport_rental_bucket_select
 on storage.objects for select to authenticated
 using (
   bucket_id = 'kendaraan'
   and public.has_any_role(array['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role, 'AKUNTANSI'::public.user_role])
 );
 drop policy if exists transport_rental_bucket_insert on storage.objects;
 create policy transport_rental_bucket_insert
 on storage.objects for insert to authenticated
 with check (
   bucket_id = 'kendaraan'
   and public.has_any_role(array['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role])
 );
 drop policy if exists transport_rental_bucket_update on storage.objects;
 create policy transport_rental_bucket_update
 on storage.objects for update to authenticated
 using (
   bucket_id = 'kendaraan'
   and public.has_any_role(array['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role])
 )
 with check (
   bucket_id = 'kendaraan'
   and public.has_any_role(array['ADMIN'::public.user_role, 'TRANSPORT'::user_role])
 );
 drop policy if exists transport_rental_bucket_delete on storage.objects;
 create policy transport_rental_bucket_delete
 on storage.objects for delete to authenticated
 using (
   bucket_id = 'kendaraan'
   and public.has_any_role(array['ADMIN'::public.user_role])
 );
