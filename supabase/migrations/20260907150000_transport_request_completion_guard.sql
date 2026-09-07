-- Tighten request completion so Transport cannot close a request directly
-- from MENUNGGU_APPROVAL without a confirmed service approval.
-- Approved/completed service remains the intended completion path.

CREATE OR REPLACE FUNCTION public.guard_permintaan_service_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF public.has_any_role(ARRAY['ADMIN'::public.user_role]) THEN
    RETURN NEW;
  END IF;

  IF public.has_any_role(ARRAY['OPERASIONAL'::public.user_role]) THEN
    IF OLD.status = 'MENUNGGU_TRANSPORT'
       AND NEW.status = 'DIBATALKAN'
       AND NEW.pemohon_id = auth.uid() THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Operasional hanya dapat membatalkan pengajuan yang masih menunggu Transport.';
  END IF;

  IF public.has_any_role(ARRAY['TRANSPORT'::public.user_role]) THEN
    IF OLD.status = 'MENUNGGU_TRANSPORT'
       AND NEW.status IN ('DITERIMA_TRANSPORT','DALAM_PROSES','MENUNGGU_APPROVAL','DIBATALKAN') THEN
      RETURN NEW;
    END IF;

    IF OLD.status = 'DITERIMA_TRANSPORT'
       AND NEW.status IN ('DALAM_PROSES','MENUNGGU_APPROVAL','DIBATALKAN') THEN
      RETURN NEW;
    END IF;

    IF OLD.status = 'DALAM_PROSES'
       AND NEW.status IN ('MENUNGGU_APPROVAL') THEN
      RETURN NEW;
    END IF;

    IF OLD.status = 'MENUNGGU_APPROVAL'
       AND NEW.status = 'DALAM_PROSES' THEN
      RETURN NEW;
    END IF;

    IF OLD.status = 'DISETUJUI' AND NEW.status = 'SELESAI' THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Perubahan status pengajuan tidak mengikuti alur Transport yang diizinkan.';
  END IF;

  IF public.has_any_role(ARRAY['ATASAN_TRANSPORT'::public.user_role,'DIREKTUR'::public.user_role]) THEN
    RAISE EXCEPTION 'Atasan/Direktur mengubah status melalui workflow approval service, bukan pengajuan.';
  END IF;

  RAISE EXCEPTION 'Anda tidak memiliki kewenangan mengubah status pengajuan.';
END;
$$;
