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


-- Do not reduce repair eligibility below amounts that have already been deducted.
CREATE OR REPLACE FUNCTION public.validate_transport_rental_repair()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  contract_vehicle_id bigint;
  vehicle_ownership text;
  active_contract_count integer;
  active_contract_id bigint;
  allowed_deduction numeric;
  existing_deductions numeric := 0;
BEGIN
  IF NEW.kontrak_sewa_id IS NULL THEN
    SELECT count(*)::integer, min(id)
      INTO active_contract_count, active_contract_id
    FROM public.kontrak_sewa
    WHERE kendaraan_id=NEW.kendaraan_id AND status='AKTIF';

    IF active_contract_count=1 THEN
      NEW.kontrak_sewa_id := active_contract_id;
    ELSE
      RAISE EXCEPTION 'Kendaraan sewa belum memiliki tepat satu kontrak rental aktif.';
    END IF;
  END IF;

  SELECT kendaraan_id INTO contract_vehicle_id
  FROM public.kontrak_sewa WHERE id=NEW.kontrak_sewa_id;

  IF contract_vehicle_id IS NULL THEN
    RAISE EXCEPTION 'Kontrak rental untuk perbaikan tidak ditemukan.';
  END IF;
  IF NEW.kendaraan_id IS DISTINCT FROM contract_vehicle_id THEN
    RAISE EXCEPTION 'Kendaraan perbaikan harus sama dengan kendaraan pada kontrak rental.';
  END IF;

  SELECT kepemilikan INTO vehicle_ownership
  FROM public.kendaraan WHERE id=NEW.kendaraan_id;

  IF vehicle_ownership IS DISTINCT FROM 'SEWA' THEN
    RAISE EXCEPTION 'Perbaikan rental hanya boleh dicatat untuk kendaraan dengan kepemilikan SEWA.';
  END IF;
  IF NEW.dibayar_kantor AND NEW.tanggal_dibayar IS NULL THEN
    RAISE EXCEPTION 'Tanggal pembayaran perbaikan wajib diisi jika dibayar kantor.';
  END IF;
  IF NEW.dapat_dipotong AND NOT NEW.dibayar_kantor THEN
    RAISE EXCEPTION 'Perbaikan tidak boleh ditandai dapat dipotong sebelum dibayar kantor.';
  END IF;

  allowed_deduction := coalesce(NEW.biaya_aktual, NEW.estimasi_biaya, 0);
  IF NEW.dapat_dipotong AND coalesce(NEW.jumlah_dipotong,0) <= 0 THEN
    RAISE EXCEPTION 'Jumlah potongan wajib lebih dari 0 jika perbaikan dapat dipotong.';
  END IF;
  IF NEW.dapat_dipotong AND coalesce(NEW.jumlah_dipotong,0) > allowed_deduction THEN
    RAISE EXCEPTION 'Jumlah potongan tidak boleh melebihi biaya perbaikan.';
  END IF;
  IF NOT NEW.dapat_dipotong AND coalesce(NEW.jumlah_dipotong,0) <> 0 THEN
    RAISE EXCEPTION 'Jumlah potongan harus 0 jika perbaikan belum ditandai dapat dipotong.';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT coalesce(sum(jumlah_potongan),0)
      INTO existing_deductions
    FROM public.potongan_pembayaran_sewa
    WHERE perbaikan_sewa_id = NEW.id;

    IF existing_deductions > 0 AND (NOT NEW.dibayar_kantor OR NOT NEW.dapat_dipotong OR NEW.tanggal_dibayar IS NULL) THEN
      RAISE EXCEPTION 'Perbaikan sudah dipotong dari tagihan rental; syarat pembayaran dan potongan tidak boleh dibatalkan.';
    END IF;
    IF existing_deductions > coalesce(NEW.jumlah_dipotong,0) OR existing_deductions > allowed_deduction THEN
      RAISE EXCEPTION 'Nilai perbaikan tidak boleh diturunkan di bawah nominal yang sudah dipotong dari tagihan rental.';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
