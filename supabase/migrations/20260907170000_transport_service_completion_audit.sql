-- Keep the kilometer audit trail synchronized with completed services.
-- The service workflow already updates kendaraan.kilometer_terakhir; this trigger
-- records the same service KM in riwayat_kilometer so completion remains traceable.

CREATE OR REPLACE FUNCTION public.record_service_completion_km()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'SELESAI'
     AND OLD.status IS DISTINCT FROM 'SELESAI'
     AND NEW.kilometer IS NOT NULL THEN
    INSERT INTO public.riwayat_kilometer (
      kendaraan_id,
      tanggal,
      kilometer,
      sumber,
      keterangan,
      dicatat_oleh
    )
    SELECT
      NEW.kendaraan_id,
      COALESCE(NEW.tanggal_service, CURRENT_DATE),
      NEW.kilometer,
      'SERVICE',
      CONCAT('KM saat penyelesaian service ', COALESCE(NEW.nomor_service, CONCAT('#', NEW.id))),
      auth.uid()
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.riwayat_kilometer rk
      WHERE rk.kendaraan_id = NEW.kendaraan_id
        AND rk.tanggal = COALESCE(NEW.tanggal_service, CURRENT_DATE)
        AND rk.kilometer = NEW.kilometer
        AND rk.sumber = 'SERVICE'
        AND COALESCE(rk.keterangan, '') = CONCAT('KM saat penyelesaian service ', COALESCE(NEW.nomor_service, CONCAT('#', NEW.id)))
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_record_service_completion_km
  ON public.service;

CREATE TRIGGER trg_record_service_completion_km
AFTER UPDATE OF status ON public.service
FOR EACH ROW
EXECUTE FUNCTION public.record_service_completion_km();

-- Once a service is completed, its immutable job/evidence details should not
-- be altered through the detail tables. ADMIN/TRANSPORT may still edit
-- unfinished service details according to existing RLS policies.
CREATE OR REPLACE FUNCTION public.guard_service_detail_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  service_status text;
BEGIN
  SELECT s.status
    INTO service_status
  FROM public.service s
  WHERE s.id = COALESCE(NEW.service_id, OLD.service_id);

  IF service_status IN ('SELESAI', 'DITOLAK', 'DIBATALKAN') THEN
    RAISE EXCEPTION 'Detail service tidak dapat diubah setelah service berstatus %.', service_status;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_service_item_mutation ON public.service_item;
CREATE TRIGGER trg_guard_service_item_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public.service_item
FOR EACH ROW
EXECUTE FUNCTION public.guard_service_detail_mutation();

DROP TRIGGER IF EXISTS trg_guard_service_bukti_mutation ON public.service_bukti;
CREATE TRIGGER trg_guard_service_bukti_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public.service_bukti
FOR EACH ROW
EXECUTE FUNCTION public.guard_service_detail_mutation();
