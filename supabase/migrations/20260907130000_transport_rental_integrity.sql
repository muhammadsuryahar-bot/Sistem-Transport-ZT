-- Rental workflow integrity guardrails.
-- A rental repair must belong to a rental contract and the contract must belong
-- to the same rental vehicle. This prevents orphan repair records and accidental
-- deductions against an unrelated contract.

CREATE OR REPLACE FUNCTION public.validate_transport_rental_repair()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  contract_vehicle_id bigint;
  vehicle_ownership text;
BEGIN
  IF NEW.kontrak_sewa_id IS NULL THEN
    RAISE EXCEPTION 'Perbaikan kendaraan sewa wajib terkait kontrak rental.';
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

-- A contract can only be created for a vehicle registered as SEWA.
CREATE OR REPLACE FUNCTION public.validate_transport_rental_contract()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  vehicle_ownership text;
BEGIN
  SELECT kepemilikan
    INTO vehicle_ownership
  FROM public.kendaraan
  WHERE id = NEW.kendaraan_id;

  IF vehicle_ownership IS NULL THEN
    RAISE EXCEPTION 'Kendaraan untuk kontrak rental tidak ditemukan.';
  END IF;

  IF vehicle_ownership <> 'SEWA' THEN
    RAISE EXCEPTION 'Kontrak rental hanya boleh dibuat untuk kendaraan berkepemilikan SEWA.';
  END IF;

  IF NEW.periode_bulan IS DISTINCT FROM 6 THEN
    RAISE EXCEPTION 'Periode kontrak rental wajib 6 bulan.';
  END IF;

  IF NEW.tanggal_mulai IS NOT NULL AND NEW.tanggal_selesai IS NOT NULL
     AND NEW.tanggal_selesai < NEW.tanggal_mulai THEN
    RAISE EXCEPTION 'Tanggal selesai kontrak tidak boleh sebelum tanggal mulai.';
  END IF;

  IF NEW.nilai_sewa_bulanan IS NULL OR NEW.nilai_sewa_bulanan <= 0 THEN
    RAISE EXCEPTION 'Nilai sewa bulanan harus lebih dari 0.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_transport_rental_contract
  ON public.kontrak_sewa;

CREATE TRIGGER trg_validate_transport_rental_contract
BEFORE INSERT OR UPDATE ON public.kontrak_sewa
FOR EACH ROW
EXECUTE FUNCTION public.validate_transport_rental_contract();

CREATE INDEX IF NOT EXISTS idx_kontrak_sewa_kendaraan_tanggal
  ON public.kontrak_sewa (kendaraan_id, tanggal_mulai, tanggal_selesai);

CREATE INDEX IF NOT EXISTS idx_perbaikan_sewa_kontrak_kendaraan
  ON public.perbaikan_sewa (kontrak_sewa_id, kendaraan_id);
