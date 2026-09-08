-- Keep approval authority consistent between the application and PostgreSQL.
-- Initial approval is based on the approved estimate. A later approval is only
-- needed when the actual cost exceeds that estimate or crosses the Rp5m tier.

CREATE OR REPLACE FUNCTION public.guard_service_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  svc public.service%ROWTYPE;
  approval_count integer;
  approval_amount numeric;
  required_role public.user_role;
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

  SELECT count(*)::integer INTO approval_count
  FROM public.service_approval
  WHERE service_id = svc.id
    AND status = 'DISETUJUI';

  -- The first approval evaluates the estimate. After an initial approval,
  -- only an actual cost above the estimate is evaluated for the next tier.
  IF approval_count = 0 THEN
    approval_amount := COALESCE(svc.estimasi_biaya, svc.biaya_aktual, 0);
  ELSE
    approval_amount := COALESCE(svc.biaya_aktual, svc.estimasi_biaya, 0);
    IF approval_amount <= COALESCE(svc.estimasi_biaya, 0) THEN
      RAISE EXCEPTION 'Service sudah memiliki approval yang diperlukan.';
    END IF;
  END IF;

  required_role := CASE
    WHEN approval_amount > 5000000 THEN 'DIREKTUR'::public.user_role
    ELSE 'ATASAN_TRANSPORT'::public.user_role
  END;

  IF NOT public.has_any_role(ARRAY['ADMIN'::public.user_role])
     AND NOT public.has_any_role(ARRAY[required_role]) THEN
    RAISE EXCEPTION 'Approval untuk nilai % harus diberikan oleh %.', approval_amount, required_role;
  END IF;

  IF approval_count >= 2 THEN
    RAISE EXCEPTION 'Jumlah approval service sudah terpenuhi.';
  END IF;

  NEW.urutan := approval_count + 1;
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
