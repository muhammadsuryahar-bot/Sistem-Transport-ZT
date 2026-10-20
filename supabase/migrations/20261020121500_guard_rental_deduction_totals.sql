-- Preserve gross invoice amount separately from the amount payable after repair deductions.
ALTER TABLE public.pembayaran_sewa
  ADD COLUMN IF NOT EXISTS jumlah_tagihan_bruto numeric;

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.pembayaran_sewa'::regclass
      AND conname = 'pembayaran_sewa_jumlah_tagihan_bruto_check'
  ) THEN
    ALTER TABLE public.pembayaran_sewa
      ADD CONSTRAINT pembayaran_sewa_jumlah_tagihan_bruto_check
      CHECK (
        jumlah_tagihan_bruto IS NULL
        OR (jumlah_tagihan_bruto >= 0 AND jumlah_tagihan_bruto >= jumlah_tagihan)
      );
  END IF;
END;
$constraint$;

-- Validate every repair deduction against remaining approved cost and gross rent invoice.
-- Row locks prevent two concurrent requests from spending the same repair allowance.
CREATE OR REPLACE FUNCTION public.guard_rental_deduction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  p_contract bigint;
  p_net numeric;
  p_gross numeric;
  has_explicit_gross boolean;
  r_contract bigint;
  r_paid boolean;
  r_allowed boolean;
  r_limit numeric;
  r_cost numeric;
  p_prior_deductions numeric := 0;
  r_prior_deductions numeric := 0;
BEGIN
  SELECT kontrak_sewa_id, jumlah_tagihan, jumlah_tagihan_bruto
    INTO p_contract, p_net, p_gross
  FROM public.pembayaran_sewa
  WHERE id = NEW.pembayaran_sewa_id
  FOR UPDATE;

  IF p_contract IS NULL THEN
    RAISE EXCEPTION 'Pembayaran rental tidak ditemukan.';
  END IF;

  has_explicit_gross := p_gross IS NOT NULL;
  -- Backward-compatible fallback while an old frontend instance may still be running.
  IF NOT has_explicit_gross THEN
    p_gross := p_net + NEW.jumlah_potongan;
  END IF;

  SELECT kontrak_sewa_id, dibayar_kantor, dapat_dipotong, jumlah_dipotong,
         coalesce(biaya_aktual, estimasi_biaya, 0)
    INTO r_contract, r_paid, r_allowed, r_limit, r_cost
  FROM public.perbaikan_sewa
  WHERE id = NEW.perbaikan_sewa_id
  FOR UPDATE;

  IF r_contract IS NULL THEN
    RAISE EXCEPTION 'Perbaikan rental tidak ditemukan.';
  END IF;
  IF p_contract <> r_contract THEN
    RAISE EXCEPTION 'Potongan harus berasal dari kontrak rental yang sama.';
  END IF;
  IF NOT r_paid OR NOT r_allowed THEN
    RAISE EXCEPTION 'Perbaikan belum memenuhi syarat untuk dipotong.';
  END IF;
  IF NEW.jumlah_potongan <= 0 THEN
    RAISE EXCEPTION 'Jumlah potongan harus lebih dari 0.';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT coalesce(sum(jumlah_potongan), 0)
      INTO p_prior_deductions
    FROM public.potongan_pembayaran_sewa
    WHERE pembayaran_sewa_id = NEW.pembayaran_sewa_id
      AND id <> NEW.id;

    SELECT coalesce(sum(jumlah_potongan), 0)
      INTO r_prior_deductions
    FROM public.potongan_pembayaran_sewa
    WHERE perbaikan_sewa_id = NEW.perbaikan_sewa_id
      AND id <> NEW.id;
  ELSE
    SELECT coalesce(sum(jumlah_potongan), 0)
      INTO p_prior_deductions
    FROM public.potongan_pembayaran_sewa
    WHERE pembayaran_sewa_id = NEW.pembayaran_sewa_id;

    SELECT coalesce(sum(jumlah_potongan), 0)
      INTO r_prior_deductions
    FROM public.potongan_pembayaran_sewa
    WHERE perbaikan_sewa_id = NEW.perbaikan_sewa_id;
  END IF;

  IF NEW.jumlah_potongan > r_limit OR NEW.jumlah_potongan > r_cost
     OR r_prior_deductions + NEW.jumlah_potongan > r_limit
     OR r_prior_deductions + NEW.jumlah_potongan > r_cost THEN
    RAISE EXCEPTION 'Total potongan melebihi sisa nilai perbaikan yang diperbolehkan.';
  END IF;

  IF has_explicit_gross THEN
    IF p_gross < p_net OR p_gross < 0 THEN
      RAISE EXCEPTION 'Nilai tagihan bruto tidak boleh lebih kecil daripada tagihan bersih.';
    END IF;
    IF p_prior_deductions + NEW.jumlah_potongan > p_gross THEN
      RAISE EXCEPTION 'Total potongan tidak boleh melebihi tagihan bruto rental.';
    END IF;
    IF p_prior_deductions + NEW.jumlah_potongan <> p_gross - p_net THEN
      RAISE EXCEPTION 'Total potongan harus sama dengan selisih tagihan bruto dan tagihan bersih.';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
