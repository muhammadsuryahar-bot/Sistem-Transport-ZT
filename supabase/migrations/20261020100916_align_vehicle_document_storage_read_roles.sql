-- Keep private vehicle-document attachments readable by the same roles
-- that are allowed to read their metadata. Write/delete remain restricted
-- to ADMIN and TRANSPORT by their separate policies.
DROP POLICY IF EXISTS storage_dokumen_kendaraan_select ON storage.objects;

CREATE POLICY storage_dokumen_kendaraan_select
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'dokumen-kendaraan'
  AND private.has_any_role(ARRAY[
    'ADMIN'::user_role,
    'TRANSPORT'::user_role,
    'ATASAN_TRANSPORT'::user_role,
    'DIREKTUR'::user_role,
    'AKUNTANSI'::user_role
  ])
);
