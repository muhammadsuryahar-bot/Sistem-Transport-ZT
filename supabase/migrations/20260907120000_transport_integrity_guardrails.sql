-- Integrity guardrails that complement the application workflow.
-- Safe to re-run; indexes and triggers are created conditionally.

-- A service request represents one operational workflow. Prevent duplicate service headers.
CREATE UNIQUE INDEX IF NOT EXISTS uq_service_permintaan_service
  ON public.service (permintaan_service_id)
  WHERE permintaan_service_id IS NOT NULL;

-- A vehicle should not have two active rental contracts at the same time.
CREATE UNIQUE INDEX IF NOT EXISTS uq_kontrak_sewa_kendaraan_aktif
  ON public.kontrak_sewa (kendaraan_id)
  WHERE status = 'AKTIF';

-- Rental deduction validation across related rows.
CREATE OR REPLACE FUNCTION public.validate_transport_rental_deduction()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  repair_contract_id bigint;
  repair_allowed numeric;
  existing_deduction numeric;
  payment_contract_id bigint;
BEGIN
  SELECT ps.kontrak_sewa_id, COALESCE(ps.jumlah_dipotong, 0)
    INTO repair_contract_id, repair_allowed
  FROM public.perbaikan_sewa ps
  WHERE ps.id = NEW.perbaikan_sewa_id;

  SELECT p.kontrak_sewa_id
    INTO payment_contract_id
  FROM public.pembayaran_sewa p
  WHERE p.id = NEW.pembayaran_sewa_id;

  IF repair_contract_id IS NULL THEN
    RAISE EXCEPTION 'Perbaikan rental tidak ditemukan atau belum terkait kontrak.';
  END IF;

  IF payment_contract_id IS NULL THEN
    RAISE EXCEPTION 'Pembayaran rental tidak ditemukan.';
  END IF;

  IF repair_contract_id <> payment_contract_id THEN
    RAISE EXCEPTION 'Potongan hanya boleh diterapkan pada pembayaran dari kontrak rental yang sama.';
  END IF;

  IF NEW.jumlah_potongan <= 0 THEN
    RAISE EXCEPTION 'Jumlah potongan harus lebih dari 0.';
  END IF;

  SELECT COALESCE(SUM(pp.jumlah_potongan), 0)
    INTO existing_deduction
  FROM public.potongan_pembayaran_sewa pp
  WHERE pp.perbaikan_sewa_id = NEW.perbaikan_sewa_id
    AND (TG_OP = 'INSERT' OR pp.id <> NEW.id);

  IF existing_deduction + NEW.jumlah_potongan > repair_allowed THEN
    RAISE EXCEPTION 'Total potongan perbaikan melebihi nilai potongan yang diizinkan.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_transport_rental_deduction
  ON public.potongan_pembayaran_sewa;

CREATE TRIGGER trg_validate_transport_rental_deduction
BEFORE INSERT OR UPDATE ON public.potongan_pembayaran_sewa
FOR EACH ROW
EXECUTE FUNCTION public.validate_transport_rental_deduction();

-- Prevent rental payments from being recorded outside the contract period.
CREATE OR REPLACE FUNCTION public.validate_transport_rental_payment_period()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  start_date date;
  end_date date;
BEGIN
  SELECT tanggal_mulai, tanggal_selesai
    INTO start_date, end_date
  FROM public.kontrak_sewa
  WHERE id = NEW.kontrak_sewa_id;

  IF start_date IS NULL OR end_date IS NULL THEN
    RAISE EXCEPTION 'Kontrak rental tidak ditemukan.';
  END IF;

  IF NEW.bulan_pembayaran < date_trunc('month', start_date)::date
     OR NEW.bulan_pembayaran > date_trunc('month', end_date)::date THEN
    RAISE EXCEPTION 'Bulan pembayaran berada di luar periode kontrak rental.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_transport_rental_payment_period
  ON public.pembayaran_sewa;

CREATE TRIGGER trg_validate_transport_rental_payment_period
BEFORE INSERT OR UPDATE ON public.pembayaran_sewa
FOR EACH ROW
EXECUTE FUNCTION public.validate_transport_rental_payment_period();

-- Useful operational indexes.
CREATE INDEX IF NOT EXISTS idx_permintaan_service_status_created
  ON public.permintaan_service (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pembayaran_sewa_status_jatuh_tempo
  ON public.pembayaran_sewa (status, tanggal_jatuh_tempo);

CREATE INDEX IF NOT EXISTS idx_perbaikan_sewa_status_dipotong
  ON public.perbaikan_sewa (status, dapat_dipotong, dibayar_kantor);

CREATE INDEX IF NOT EXISTS idx_potongan_pembayaran_sewa_perbaikan
  ON public.potongan_pembayaran_sewa (perbaikan_sewa_id);
