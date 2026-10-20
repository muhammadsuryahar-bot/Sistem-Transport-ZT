-- Align private service evidence downloads with roles permitted to read
-- service_bukti metadata. Write/delete remain restricted separately.
DROP POLICY IF EXISTS storage_service_bukti_select ON storage.objects;

CREATE POLICY storage_service_bukti_select
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'service-bukti'
  AND private.has_any_role(ARRAY[
    'ADMIN'::user_role,
    'TRANSPORT'::user_role,
    'ATASAN_TRANSPORT'::user_role,
    'DIREKTUR'::user_role,
    'AKUNTANSI'::user_role
  ])
);
