-- Service requests originate from Operational staff; Transport receives and processes them.
-- Transport may update workflow fields only, not rewrite the original request.
CREATE OR REPLACE FUNCTION private.guard_transport_request_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
BEGIN
  IF private.get_my_role() = 'TRANSPORT'::public.user_role THEN
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.nomor_pengajuan IS DISTINCT FROM OLD.nomor_pengajuan
      OR NEW.pemohon_id IS DISTINCT FROM OLD.pemohon_id
      OR NEW.kendaraan_id IS DISTINCT FROM OLD.kendaraan_id
      OR NEW.tanggal_pengajuan IS DISTINCT FROM OLD.tanggal_pengajuan
      OR NEW.kilometer_pengajuan IS DISTINCT FROM OLD.kilometer_pengajuan
      OR NEW.jenis_permintaan IS DISTINCT FROM OLD.jenis_permintaan
      OR NEW.keluhan IS DISTINCT FROM OLD.keluhan
      OR NEW.prioritas IS DISTINCT FROM OLD.prioritas
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR (
        NEW.diproses_oleh IS DISTINCT FROM OLD.diproses_oleh
        AND NEW.diproses_oleh IS NOT NULL
        AND NEW.diproses_oleh IS DISTINCT FROM auth.uid()
      )
    THEN
      RAISE EXCEPTION USING
        errcode = '42501',
        message = 'Transport hanya dapat memperbarui status dan catatan pemrosesan pengajuan. Rincian permintaan diubah oleh Operasional.';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_transport_request_fields ON public.permintaan_service;
CREATE TRIGGER guard_transport_request_fields
BEFORE UPDATE ON public.permintaan_service
FOR EACH ROW
EXECUTE FUNCTION private.guard_transport_request_fields();

-- RLS must agree with the UI: ADMIN and OPERASIONAL can originate requests.
DROP POLICY IF EXISTS permintaan_service_insert_import ON public.permintaan_service;
CREATE POLICY permintaan_service_insert_import
ON public.permintaan_service
FOR INSERT
TO authenticated
WITH CHECK (
  pemohon_id = (SELECT auth.uid())
  AND (SELECT private.has_any_role(ARRAY['ADMIN'::user_role, 'OPERASIONAL'::user_role]))
);
