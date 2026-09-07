-- Server-side validation for creating a service from a service request.
-- The frontend may suggest the correct values, but PostgreSQL enforces the workflow.

CREATE OR REPLACE FUNCTION public.guard_service_insert_workflow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req public.permintaan_service%ROWTYPE;
  approval_amount numeric;
BEGIN
  SELECT * INTO req
  FROM public.permintaan_service
  WHERE id = NEW.permintaan_service_id;

  IF req.id IS NULL THEN
    RAISE EXCEPTION 'Pengajuan service tidak ditemukan.';
  END IF;

  IF req.kendaraan_id <> NEW.kendaraan_id THEN
    RAISE EXCEPTION 'Kendaraan service harus sama dengan kendaraan pada pengajuan.';
  END IF;

  IF req.status IN ('SELESAI', 'DIBATALKAN', 'DITOLAK') THEN
    RAISE EXCEPTION 'Pengajuan service sudah tidak dapat diproses karena statusnya %.', req.status;
  END IF;

  IF COALESCE(NEW.estimasi_biaya, 0) < 0 OR COALESCE(NEW.biaya_aktual, 0) < 0 THEN
    RAISE EXCEPTION 'Estimasi dan biaya aktual tidak boleh negatif.';
  END IF;

  -- Initial approval is required whenever the amount that is already known
  -- at creation time is above Rp5.000.000.
  approval_amount := GREATEST(
    COALESCE(NEW.estimasi_biaya, 0),
    COALESCE(NEW.biaya_aktual, 0)
  );

  IF approval_amount > 5000000 THEN
    NEW.status := 'MENUNGGU_APPROVAL';
  ELSIF NEW.status IS NULL OR NEW.status = 'MENUNGGU_APPROVAL' THEN
    NEW.status := 'DALAM_PENGERJAAN';
  END IF;

  NEW.updated_at := COALESCE(NEW.updated_at, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_service_insert_workflow ON public.service;
CREATE TRIGGER trg_guard_service_insert_workflow
BEFORE INSERT ON public.service
FOR EACH ROW EXECUTE FUNCTION public.guard_service_insert_workflow();

-- Keep the service/request relationship fast for workflow checks.
CREATE INDEX IF NOT EXISTS idx_permintaan_service_kendaraan_status
  ON public.permintaan_service (kendaraan_id, status);
