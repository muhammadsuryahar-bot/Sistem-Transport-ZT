-- One-shot reconciliation for the Excel import workflow.
-- Run once in Supabase SQL Editor. Safe to re-run.

-- Vehicle columns used by the current master page/importer.
ALTER TABLE public.kendaraan
  ADD COLUMN IF NOT EXISTS masa_berlaku_pajak date,
  ADD COLUMN IF NOT EXISTS status_pajak text,
  ADD COLUMN IF NOT EXISTS unit_kerja text,
  ADD COLUMN IF NOT EXISTS catatan_hutang text;

-- The import workflow writes to these tables.
ALTER TABLE IF EXISTS public.dokumen_kendaraan ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.permintaan_service ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.service ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.service_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pemilik_sewa ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.kontrak_sewa ENABLE ROW LEVEL SECURITY;

-- Vehicle documents: ADMIN / TRANSPORT can read and write.
DROP POLICY IF EXISTS dokumen_kendaraan_select_import ON public.dokumen_kendaraan;
CREATE POLICY dokumen_kendaraan_select_import
ON public.dokumen_kendaraan
FOR SELECT TO authenticated
USING (public.has_any_role(ARRAY['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role]));

DROP POLICY IF EXISTS dokumen_kendaraan_write_import ON public.dokumen_kendaraan;
CREATE POLICY dokumen_kendaraan_write_import
ON public.dokumen_kendaraan
FOR INSERT TO authenticated
WITH CHECK (public.has_any_role(ARRAY['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role]));

DROP POLICY IF EXISTS dokumen_kendaraan_update_import ON public.dokumen_kendaraan;
CREATE POLICY dokumen_kendaraan_update_import
ON public.dokumen_kendaraan
FOR UPDATE TO authenticated
USING (public.has_any_role(ARRAY['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role]))
WITH CHECK (public.has_any_role(ARRAY['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role]));

-- Historical service requests can be created by ADMIN / OPERASIONAL / TRANSPORT.
DROP POLICY IF EXISTS permintaan_service_insert_import ON public.permintaan_service;
CREATE POLICY permintaan_service_insert_import
ON public.permintaan_service
FOR INSERT TO authenticated
WITH CHECK (
  pemohon_id = auth.uid()
  AND public.has_any_role(ARRAY[
    'ADMIN'::public.user_role,
    'OPERASIONAL'::public.user_role,
    'TRANSPORT'::public.user_role
  ])
);

-- Service header/detail imports are restricted to ADMIN / TRANSPORT.
DROP POLICY IF EXISTS service_insert_import ON public.service;
CREATE POLICY service_insert_import
ON public.service
FOR INSERT TO authenticated
WITH CHECK (public.has_any_role(ARRAY['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role]));

DROP POLICY IF EXISTS service_update_import ON public.service;
CREATE POLICY service_update_import
ON public.service
FOR UPDATE TO authenticated
USING (public.has_any_role(ARRAY['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role]))
WITH CHECK (public.has_any_role(ARRAY['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role]));

DROP POLICY IF EXISTS service_item_write_import ON public.service_item;
CREATE POLICY service_item_write_import
ON public.service_item
FOR ALL TO authenticated
USING (public.has_any_role(ARRAY['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role]))
WITH CHECK (public.has_any_role(ARRAY['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role]));

-- Rental master/contract imports are available to ADMIN / TRANSPORT / AKUNTANSI.
DROP POLICY IF EXISTS pemilik_sewa_write_import ON public.pemilik_sewa;
CREATE POLICY pemilik_sewa_write_import
ON public.pemilik_sewa
FOR ALL TO authenticated
USING (public.has_any_role(ARRAY['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role, 'AKUNTANSI'::public.user_role]))
WITH CHECK (public.has_any_role(ARRAY['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role, 'AKUNTANSI'::public.user_role]));

DROP POLICY IF EXISTS kontrak_sewa_write_import ON public.kontrak_sewa;
CREATE POLICY kontrak_sewa_write_import
ON public.kontrak_sewa
FOR ALL TO authenticated
USING (public.has_any_role(ARRAY['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role, 'AKUNTANSI'::public.user_role]))
WITH CHECK (public.has_any_role(ARRAY['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role, 'AKUNTANSI'::public.user_role]));

NOTIFY pgrst, 'reload schema';
