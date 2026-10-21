-- Align private vehicle-photo downloads with the roles allowed to read
-- vehicle-document metadata. Existing write/delete policies remain unchanged.
DROP POLICY IF EXISTS storage_kendaraan_select ON storage.objects;

CREATE POLICY storage_kendaraan_select
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'kendaraan'
  AND private.has_any_role(ARRAY[
    'ADMIN'::user_role,
    'TRANSPORT'::user_role,
    'ATASAN_TRANSPORT'::user_role,
    'DIREKTUR'::user_role,
    'AKUNTANSI'::user_role
  ])
);
