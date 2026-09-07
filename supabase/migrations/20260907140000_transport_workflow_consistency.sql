-- Workflow consistency helpers.
-- These guards make the database resilient when the UI performs multiple writes
-- for one business action.

-- Rental repairs can infer their active contract from the selected SEWA vehicle.
-- This keeps the form simple while still enforcing a real contract relationship.
CREATE OR REPLACE FUNCTION public.validate_transport_rental_repair()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  contract_vehicle_id bigint;
  vehicle_ownership text;
  active_contract_id bigint;
  active_contract_count integer;
BEGIN
  IF NEW.kontrak_sewa_id IS NULL THEN
    SELECT count(*)::integer, min(id)
      INTO active_contract_count, active_contract_id
    FROM public.kontrak_sewa
    WHERE kendaraan_id = NEW.kendaraan_id
      AND status = 'AKTIF';

    IF active_contract_count = 1 THEN
      NEW.kontrak_sewa_id := active_contract_id;
    ELSE
      RAISE EXCEPTION 'Kendaraan sewa belum memiliki tepat satu kontrak rental aktif.';
    END IF;
  END IF;

  SELECT kendaraan_id
    INTO contract_vehicle_id
  FROM public.kontrak_sewa
  WHERE id = NEW.kontrak_sewa_id;

  IF contract_vehicle_id IS NULL THEN
    RAISE EXCEPTION 'Kontrak rental untuk perbaikan tidak ditemukan.';
  END IF;

  IF NEW.kendaraan_id IS DISTINCT FROM contract_vehicle_id THEN
    RAISE EXCEPTION 'Kendaraan perbaikan harus sama dengan kendaraan pada kontrak rental.';
  END IF;

  SELECT kepemilikan
    INTO vehicle_ownership
  FROM public.kendaraan
  WHERE id = NEW.kendaraan_id;

  IF vehicle_ownership IS DISTINCT FROM 'SEWA' THEN
    RAISE EXCEPTION 'Perbaikan rental hanya boleh dicatat untuk kendaraan dengan kepemilikan SEWA.';
  END IF;

  IF NEW.biaya_aktual IS NOT NULL AND NEW.biaya_aktual < 0 THEN
    RAISE EXCEPTION 'Biaya aktual perbaikan tidak boleh negatif.';
  END IF;

  IF NEW.estimasi_biaya IS NOT NULL AND NEW.estimasi_biaya < 0 THEN
    RAISE EXCEPTION 'Estimasi biaya perbaikan tidak boleh negatif.';
  END IF;

  IF NEW.jumlah_dipotong IS NOT NULL AND NEW.jumlah_dipotong < 0 THEN
    RAISE EXCEPTION 'Jumlah potongan perbaikan tidak boleh negatif.';
  END IF;

  IF COALESCE(NEW.dapat_dipotong, false) AND NOT COALESCE(NEW.dibayar_kantor, false) THEN
    RAISE EXCEPTION 'Perbaikan tidak boleh ditandai dapat dipotong sebelum dibayar kantor.';
  END IF;

  IF COALESCE(NEW.dapat_dipotong, false) AND COALESCE(NEW.jumlah_dipotong, 0) <= 0 THEN
    RAISE EXCEPTION 'Jumlah potongan wajib lebih dari 0 jika perbaikan dapat dipotong.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_transport_rental_repair
  ON public.perbaikan_sewa;
CREATE TRIGGER trg_validate_transport_rental_repair
BEFORE INSERT OR UPDATE ON public.perbaikan_sewa
FOR EACH ROW
EXECUTE FUNCTION public.validate_transport_rental_repair();

-- Keep the request and service headers synchronized when a service is completed.
CREATE OR REPLACE FUNCTION public.sync_transport_request_after_service()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'SELESAI' AND OLD.status IS DISTINCT FROM 'SELESAI'
     AND NEW.permintaan_service_id IS NOT NULL THEN
    UPDATE public.permintaan_service
    SET status = 'SELESAI',
        diproses_oleh = COALESCE(NEW.diproses_oleh, diproses_oleh),
        diproses_at = COALESCE(NEW.selesai_at, now()),
        updated_at = now()
    WHERE id = NEW.permintaan_service_id
      AND status IS DISTINCT FROM 'SELESAI';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_transport_request_after_service
  ON public.service;
CREATE TRIGGER trg_sync_transport_request_after_service
AFTER UPDATE OF status ON public.service
FOR EACH ROW
EXECUTE FUNCTION public.sync_transport_request_after_service();

-- A completed service should be reflected as the vehicle's latest KM.
CREATE OR REPLACE FUNCTION public.sync_transport_vehicle_km_after_service()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'SELESAI' AND OLD.status IS DISTINCT FROM 'SELESAI'
     AND NEW.kendaraan_id IS NOT NULL
     AND NEW.kilometer IS NOT NULL THEN
    UPDATE public.kendaraan
    SET kilometer_terakhir = GREATEST(COALESCE(kilometer_terakhir, 0), NEW.kilometer),
        updated_at = now()
    WHERE id = NEW.kendaraan_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_transport_vehicle_km_after_service
  ON public.service;
CREATE TRIGGER trg_sync_transport_vehicle_km_after_service
AFTER UPDATE OF status ON public.service
FOR EACH ROW
EXECUTE FUNCTION public.sync_transport_vehicle_km_after_service();
