-- Transport workflow hardening.
-- Server-side guards for approval, completion, rental deductions, and duplicate records.

-- One service header per request.
CREATE UNIQUE INDEX IF NOT EXISTS uq_service_permintaan_service
  ON public.service (permintaan_service_id);

-- One active rental contract per vehicle.
CREATE UNIQUE INDEX IF NOT EXISTS uq_kontrak_sewa_kendaraan_aktif
  ON public.kontrak_sewa (kendaraan_id)
  WHERE status = 'AKTIF';

-- One deduction record per repair/payment pair.
CREATE UNIQUE INDEX IF NOT EXISTS uq_potongan_payment_repair
  ON public.potongan_pembayaran_sewa (pembayaran_sewa_id, perbaikan_sewa_id);

-- Approval guard: validates approver role, approval order, and pending state.
CREATE OR REPLACE FUNCTION public.guard_service_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  svc public.service%ROWTYPE;
  actual_amount numeric;
  required_role public.user_role;
  approved_count integer;
BEGIN
  SELECT * INTO svc
  FROM public.service
  WHERE id = NEW.service_id
  FOR UPDATE;

  IF svc.id IS NULL THEN
    RAISE EXCEPTION 'Service tidak ditemukan.';
  END IF;

  IF svc.status <> 'MENUNGGU_APPROVAL' THEN
    RAISE EXCEPTION 'Service tidak sedang menunggu approval.';
  END IF;

  actual_amount := COALESCE(svc.biaya_aktual, svc.estimasi_biaya, 0);
  required_role := CASE WHEN actual_amount > 5000000 THEN 'DIREKTUR'::public.user_role ELSE 'ATASAN_TRANSPORT'::public.user_role END;

  IF NOT public.has_any_role(ARRAY['ADMIN'::public.user_role])
     AND NOT public.has_any_role(ARRAY[required_role]) THEN
    RAISE EXCEPTION 'Approval untuk nilai % harus diberikan oleh %.', actual_amount, required_role;
  END IF;

  SELECT count(*)::integer INTO approved_count
  FROM public.service_approval
  WHERE service_id = svc.id
    AND status = 'DISETUJUI';

  IF approved_count >= 1 AND actual_amount <= COALESCE(svc.estimasi_biaya, 0) THEN
    RAISE EXCEPTION 'Service sudah memiliki approval yang diperlukan.';
  END IF;

  IF approved_count >= 2 THEN
    RAISE EXCEPTION 'Jumlah approval service sudah terpenuhi.';
  END IF;

  NEW.urutan := approved_count + 1;
  NEW.jenis_approval := required_role;
  NEW.pemberi_approval := auth.uid();
  NEW.waktu_approval := COALESCE(NEW.waktu_approval, now());

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_service_approval ON public.service_approval;
CREATE TRIGGER trg_guard_service_approval
BEFORE INSERT ON public.service_approval
FOR EACH ROW EXECUTE FUNCTION public.guard_service_approval();

-- Approver update policy: approvers may only change service status.
DROP POLICY IF EXISTS service_update_approver_status_only ON public.service;
CREATE POLICY service_update_approver_status_only
ON public.service
FOR UPDATE TO authenticated
USING (
  public.has_any_role(ARRAY['ADMIN'::public.user_role,'ATASAN_TRANSPORT'::public.user_role,'DIREKTUR'::public.user_role])
)
WITH CHECK (
  public.has_any_role(ARRAY['ADMIN'::public.user_role,'ATASAN_TRANSPORT'::public.user_role,'DIREKTUR'::public.user_role])
);

CREATE OR REPLACE FUNCTION public.guard_service_update_by_approver()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_any_role(ARRAY['ADMIN'::public.user_role]) THEN
    RETURN NEW;
  END IF;

  IF public.has_any_role(ARRAY['ATASAN_TRANSPORT'::public.user_role,'DIREKTUR'::public.user_role]) THEN
    IF NEW.nomor_service IS DISTINCT FROM OLD.nomor_service
       OR NEW.permintaan_service_id IS DISTINCT FROM OLD.permintaan_service_id
       OR NEW.kendaraan_id IS DISTINCT FROM OLD.kendaraan_id
       OR NEW.tanggal_service IS DISTINCT FROM OLD.tanggal_service
       OR NEW.kilometer IS DISTINCT FROM OLD.kilometer
       OR NEW.bengkel IS DISTINCT FROM OLD.bengkel
       OR NEW.jenis_service IS DISTINCT FROM OLD.jenis_service
       OR NEW.keluhan IS DISTINCT FROM OLD.keluhan
       OR NEW.estimasi_biaya IS DISTINCT FROM OLD.estimasi_biaya
       OR NEW.biaya_aktual IS DISTINCT FROM OLD.biaya_aktual
       OR NEW.diproses_oleh IS DISTINCT FROM OLD.diproses_oleh
       OR NEW.selesai_at IS DISTINCT FROM OLD.selesai_at
       OR NEW.catatan IS DISTINCT FROM OLD.catatan
    THEN
      RAISE EXCEPTION 'Approver hanya boleh mengubah status service melalui workflow approval.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_service_update_by_approver ON public.service;
CREATE TRIGGER trg_guard_service_update_by_approver
BEFORE UPDATE ON public.service
FOR EACH ROW EXECUTE FUNCTION public.guard_service_update_by_approver();

-- When actual cost rises above the estimate after approval, force the service back to approval.
CREATE OR REPLACE FUNCTION public.guard_service_cost_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  prior_approved integer;
BEGIN
  IF NEW.biaya_aktual IS DISTINCT FROM OLD.biaya_aktual THEN
    SELECT count(*)::integer INTO prior_approved
    FROM public.service_approval
    WHERE service_id = NEW.id
      AND status = 'DISETUJUI';

    IF NEW.biaya_aktual IS NOT NULL
       AND NEW.biaya_aktual > COALESCE(NEW.estimasi_biaya, 0)
       AND prior_approved > 0 THEN
      NEW.status := 'MENUNGGU_APPROVAL';
    ELSIF NEW.biaya_aktual IS NOT NULL
       AND NEW.biaya_aktual > 5000000
       AND prior_approved = 0 THEN
      NEW.status := 'MENUNGGU_APPROVAL';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_service_cost_change ON public.service;
CREATE TRIGGER trg_guard_service_cost_change
BEFORE UPDATE OF biaya_aktual ON public.service
FOR EACH ROW EXECUTE FUNCTION public.guard_service_cost_change();

-- Completion requires the necessary approval and at least one uploaded service proof.
CREATE OR REPLACE FUNCTION public.guard_service_completion()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  approval_count integer;
  actual_amount numeric;
  proof_count integer;
BEGIN
  IF NEW.status = 'SELESAI' AND OLD.status IS DISTINCT FROM 'SELESAI' THEN
    actual_amount := COALESCE(NEW.biaya_aktual, NEW.estimasi_biaya, 0);

    SELECT count(*)::integer INTO approval_count
    FROM public.service_approval
    WHERE service_id = NEW.id
      AND status = 'DISETUJUI';

    IF actual_amount > 5000000 AND NOT EXISTS (
      SELECT 1 FROM public.service_approval
      WHERE service_id = NEW.id AND status = 'DISETUJUI' AND jenis_approval = 'DIREKTUR'
    ) THEN
      RAISE EXCEPTION 'Service di atas Rp5.000.000 wajib memiliki approval Direktur.';
    END IF;

    IF actual_amount > COALESCE(NEW.estimasi_biaya, 0) AND approval_count < 2 THEN
      RAISE EXCEPTION 'Biaya aktual melebihi estimasi; approval tambahan wajib dipenuhi.';
    END IF;

    IF COALESCE(NEW.estimasi_biaya, 0) > 5000000 AND approval_count < 1 THEN
      RAISE EXCEPTION 'Service di atas Rp5.000.000 belum memiliki approval.';
    END IF;

    SELECT count(*)::integer INTO proof_count
    FROM public.service_bukti
    WHERE service_id = NEW.id;

    IF proof_count = 0 THEN
      RAISE EXCEPTION 'Bukti service wajib diunggah sebelum service dinyatakan selesai.';
    END IF;

    NEW.selesai_at := COALESCE(NEW.selesai_at, now());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_service_completion ON public.service;
CREATE TRIGGER trg_guard_service_completion
BEFORE UPDATE OF status ON public.service
FOR EACH ROW EXECUTE FUNCTION public.guard_service_completion();

-- Rental deduction guard: every deduction must be tied to an eligible office-paid repair
-- from the same contract, and cumulative deductions cannot exceed the allowed amount.
CREATE OR REPLACE FUNCTION public.guard_rental_deduction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pay public.pembayaran_sewa%ROWTYPE;
  rep public.perbaikan_sewa%ROWTYPE;
  prior_total numeric;
BEGIN
  SELECT * INTO pay FROM public.pembayaran_sewa WHERE id = NEW.pembayaran_sewa_id;
  SELECT * INTO rep FROM public.perbaikan_sewa WHERE id = NEW.perbaikan_sewa_id;

  IF pay.id IS NULL OR rep.id IS NULL THEN
    RAISE EXCEPTION 'Pembayaran atau perbaikan untuk potongan tidak ditemukan.';
  END IF;

  IF NOT rep.dibayar_kantor OR NOT rep.dapat_dipotong THEN
    RAISE EXCEPTION 'Perbaikan belum memenuhi syarat untuk dipotong dari rental.';
  END IF;

  IF rep.kontrak_sewa_id IS NOT NULL AND rep.kontrak_sewa_id <> pay.kontrak_sewa_id THEN
    RAISE EXCEPTION 'Potongan dan pembayaran harus berada pada kontrak rental yang sama.';
  END IF;

  SELECT COALESCE(sum(jumlah_potongan), 0) INTO prior_total
  FROM public.potongan_pembayaran_sewa
  WHERE perbaikan_sewa_id = NEW.perbaikan_sewa_id
    AND id <> COALESCE(NEW.id, -1);

  IF prior_total + NEW.jumlah_potongan > COALESCE(rep.jumlah_dipotong, 0) THEN
    RAISE EXCEPTION 'Total potongan melebihi nilai potongan yang diizinkan untuk perbaikan.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_rental_deduction ON public.potongan_pembayaran_sewa;
CREATE TRIGGER trg_guard_rental_deduction
BEFORE INSERT OR UPDATE ON public.potongan_pembayaran_sewa
FOR EACH ROW EXECUTE FUNCTION public.guard_rental_deduction();

-- Payment amount must not exceed net bill.
CREATE OR REPLACE FUNCTION public.guard_rental_payment_amount()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  deduction_total numeric;
  expected_net numeric;
BEGIN
  SELECT COALESCE(sum(jumlah_potongan), 0) INTO deduction_total
  FROM public.potongan_pembayaran_sewa
  WHERE pembayaran_sewa_id = NEW.id;

  expected_net := GREATEST(0, COALESCE(NEW.jumlah_tagihan, 0) - deduction_total);

  IF NEW.jumlah_dibayar > expected_net THEN
    RAISE EXCEPTION 'Jumlah dibayar tidak boleh melebihi tagihan bersih setelah potongan.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_rental_payment_amount ON public.pembayaran_sewa;
CREATE TRIGGER trg_guard_rental_payment_amount
BEFORE INSERT OR UPDATE OF jumlah_tagihan, jumlah_dibayar ON public.pembayaran_sewa
FOR EACH ROW EXECUTE FUNCTION public.guard_rental_payment_amount();
