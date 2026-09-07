-- Server-side synchronization for the transport workflow.
-- Keeps request, approval, service, and vehicle KM records consistent even when
-- the UI performs separate operations or a client implementation changes.

CREATE OR REPLACE FUNCTION public.sync_service_from_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'DITOLAK' THEN
    UPDATE public.service
    SET status = 'DITOLAK',
        updated_at = now()
    WHERE id = NEW.service_id
      AND status = 'MENUNGGU_APPROVAL';
  ELSIF NEW.status = 'DISETUJUI' THEN
    UPDATE public.service
    SET status = 'DISETUJUI',
        updated_at = now()
    WHERE id = NEW.service_id
      AND status = 'MENUNGGU_APPROVAL';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_service_from_approval
  ON public.service_approval;

CREATE TRIGGER trg_sync_service_from_approval
AFTER INSERT ON public.service_approval
FOR EACH ROW
EXECUTE FUNCTION public.sync_service_from_approval();

CREATE OR REPLACE FUNCTION public.sync_request_and_vehicle_from_service()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'SELESAI' THEN
      UPDATE public.permintaan_service
      SET status = 'SELESAI',
          diproses_oleh = COALESCE(auth.uid(), diproses_oleh),
          diproses_at = COALESCE(NEW.selesai_at, now()),
          updated_at = now()
      WHERE id = NEW.permintaan_service_id;

      IF NEW.kilometer IS NOT NULL THEN
        UPDATE public.kendaraan
        SET kilometer_terakhir = GREATEST(
              COALESCE(kilometer_terakhir, 0),
              COALESCE(NEW.kilometer, 0)
            ),
            updated_at = now()
        WHERE id = NEW.kendaraan_id;
      END IF;
    ELSIF NEW.status = 'DITOLAK' THEN
      UPDATE public.permintaan_service
      SET status = 'DITOLAK',
          diproses_oleh = COALESCE(auth.uid(), diproses_oleh),
          diproses_at = now(),
          updated_at = now()
      WHERE id = NEW.permintaan_service_id;
    ELSIF NEW.status = 'DIBATALKAN' THEN
      UPDATE public.permintaan_service
      SET status = 'DIBATALKAN',
          diproses_oleh = COALESCE(auth.uid(), diproses_oleh),
          diproses_at = now(),
          updated_at = now()
      WHERE id = NEW.permintaan_service_id;
    ELSIF NEW.status = 'DISETUJUI' THEN
      UPDATE public.permintaan_service
      SET status = 'DALAM_PROSES',
          diproses_oleh = COALESCE(auth.uid(), diproses_oleh),
          diproses_at = now(),
          updated_at = now()
      WHERE id = NEW.permintaan_service_id
        AND status <> 'SELESAI';
    ELSIF NEW.status = 'MENUNGGU_APPROVAL' THEN
      UPDATE public.permintaan_service
      SET status = 'MENUNGGU_APPROVAL',
          diproses_oleh = COALESCE(auth.uid(), diproses_oleh),
          diproses_at = now(),
          updated_at = now()
      WHERE id = NEW.permintaan_service_id
        AND status <> 'SELESAI';
    ELSIF NEW.status = 'DALAM_PENGERJAAN' THEN
      UPDATE public.permintaan_service
      SET status = 'DALAM_PROSES',
          diproses_oleh = COALESCE(auth.uid(), diproses_oleh),
          diproses_at = COALESCE(diproses_at, now()),
          updated_at = now()
      WHERE id = NEW.permintaan_service_id
        AND status <> 'SELESAI';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_request_and_vehicle_from_service
  ON public.service;

CREATE TRIGGER trg_sync_request_and_vehicle_from_service
AFTER UPDATE OF status ON public.service
FOR EACH ROW
EXECUTE FUNCTION public.sync_request_and_vehicle_from_service();

-- If an older client finishes a service without explicitly updating the vehicle
-- KM, the completion trigger above remains the source of truth.
CREATE INDEX IF NOT EXISTS idx_service_status_vehicle
  ON public.service (status, kendaraan_id, updated_at DESC);
