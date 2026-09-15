-- Keep the service request and service header in sync inside the same database transaction.
-- This prevents a service header from being created while its request remains
-- in MENUNGGU_TRANSPORT because a second frontend update failed.

CREATE OR REPLACE FUNCTION public.sync_service_request_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.permintaan_service
  SET
    status = CASE
      WHEN NEW.status = 'MENUNGGU_APPROVAL' THEN 'MENUNGGU_APPROVAL'::public.service_request_status
      ELSE 'DALAM_PROSES'::public.service_request_status
    END,
    diproses_oleh = COALESCE(NEW.diproses_oleh, diproses_oleh),
    diproses_at = COALESCE(NEW.created_at, now())
  WHERE id = NEW.permintaan_service_id
    AND status NOT IN ('SELESAI', 'DIBATALKAN', 'DITOLAK');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pengajuan service tidak dapat disinkronkan dengan service yang baru dibuat.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_request_on_service_insert
  ON public.service;

CREATE TRIGGER trg_sync_request_on_service_insert
AFTER INSERT ON public.service
FOR EACH ROW
EXECUTE FUNCTION public.sync_service_request_on_insert();
