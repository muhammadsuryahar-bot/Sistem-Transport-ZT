-- Enforce required replacement evidence for GANTI_BAN / GANTI_AKI services.
-- The replacement history must exist for the same vehicle and carry the mandatory
-- before-condition photo before the service can be marked complete.

CREATE OR REPLACE FUNCTION public.guard_service_completion()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  approval_count integer;
  actual_amount numeric;
  proof_count integer;
  replacement_evidence_count integer;
BEGIN
  IF NEW.status = 'SELESAI' AND OLD.status IS DISTINCT FROM 'SELESAI' THEN
    actual_amount := COALESCE(NEW.biaya_aktual, NEW.estimasi_biaya, 0);

    SELECT count(*)::integer INTO approval_count
    FROM public.service_approval
    WHERE service_id = NEW.id
      AND status = 'DISETUJUI';

    IF actual_amount > 5000000 AND NOT EXISTS (
      SELECT 1 FROM public.service_approval
      WHERE service_id = NEW.id
        AND status = 'DISETUJUI'
        AND jenis_approval = 'DIREKTUR'
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

    IF NEW.jenis_service = 'GANTI_BAN' THEN
      SELECT count(*)::integer INTO replacement_evidence_count
      FROM public.riwayat_ban rb
      WHERE rb.kendaraan_id = NEW.kendaraan_id
        AND rb.tanggal_penggantian = NEW.tanggal_service
        AND rb.foto_sebelum_path IS NOT NULL
        AND trim(rb.foto_sebelum_path) <> '';

      IF replacement_evidence_count = 0 THEN
        RAISE EXCEPTION 'Penggantian ban wajib memiliki riwayat penggantian dengan foto kondisi sebelum.';
      END IF;
    ELSIF NEW.jenis_service = 'GANTI_AKI' THEN
      SELECT count(*)::integer INTO replacement_evidence_count
      FROM public.riwayat_aki ra
      WHERE ra.kendaraan_id = NEW.kendaraan_id
        AND ra.tanggal_penggantian = NEW.tanggal_service
        AND ra.foto_sebelum_path IS NOT NULL
        AND trim(ra.foto_sebelum_path) <> '';

      IF replacement_evidence_count = 0 THEN
        RAISE EXCEPTION 'Penggantian aki/baterai wajib memiliki riwayat penggantian dengan foto kondisi sebelum.';
      END IF;
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
