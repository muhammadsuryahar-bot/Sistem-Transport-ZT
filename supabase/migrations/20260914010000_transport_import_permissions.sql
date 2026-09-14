-- Allow ADMIN and TRANSPORT to import historical service requests.
-- The import UI is intentionally available to ADMIN / TRANSPORT, so the
-- database policy must allow the same roles to create migration records.

DROP POLICY IF EXISTS "permintaan_service_insert_operasional_admin" ON public.permintaan_service;
DROP POLICY IF EXISTS "permintaan_service_insert_import_transport" ON public.permintaan_service;

CREATE POLICY "permintaan_service_insert_import_transport"
ON public.permintaan_service
FOR INSERT
TO authenticated
WITH CHECK (
  pemohon_id = auth.uid()
  AND public.has_any_role(array[
    'ADMIN'::public.user_role,
    'OPERASIONAL'::public.user_role,
    'TRANSPORT'::public.user_role
  ])
);
