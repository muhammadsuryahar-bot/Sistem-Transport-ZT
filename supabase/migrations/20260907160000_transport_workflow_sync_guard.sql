-- Allow service-driven request synchronization for approval/rejection/cancellation.
-- Approval actors must not be able to edit request status directly, but the
-- service workflow trigger needs to propagate the already-finalized service
-- state back to its linked request.

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

  -- Service workflow synchronization is authoritative for these request states.
  -- The linked service must already be in the corresponding state, so a client
  -- cannot use this exception to manufacture an approval/rejection on its own.
  IF NEW.status = 'DALAM_PROSES'
     AND OLD.status = 'MENUNGGU_APPROVAL'
     AND EXISTS (
       SELECT 1 FROM public.service s
       WHERE s.permintaan_service_id = NEW.id
         AND s.status = 'DISETUJUI'
     ) THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'DITOLAK'
     AND OLD.status IN ('MENUNGGU_APPROVAL','DALAM_PROSES','DITERIMA_TRANSPORT')
     AND EXISTS (
       SELECT 1 FROM public.service s
       WHERE s.permintaan_service_id = NEW.id
         AND s.status = 'DITOLAK'
     ) THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'DIBATALKAN'
     AND OLD.status IN ('MENUNGGU_TRANSPORT','DITERIMA_TRANSPORT','DALAM_PROSES','MENUNGGU_APPROVAL')
     AND EXISTS (
       SELECT 1 FROM public.service s
       WHERE s.permintaan_service_id = NEW.id
         AND s.status = 'DIBATALKAN'
     ) THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'SELESAI'
     AND OLD.status = 'DALAM_PROSES'
     AND EXISTS (
       SELECT 1 FROM public.service s
       WHERE s.permintaan_service_id = NEW.id
         AND s.status = 'SELESAI'
     ) THEN
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
       AND NEW.status = 'MENUNGGU_APPROVAL' THEN
      RETURN NEW;
    END IF;

    IF OLD.status = 'DALAM_PROSES'
       AND NEW.status = 'SELESAI'
       AND EXISTS (
         SELECT 1 FROM public.service s
         WHERE s.permintaan_service_id = NEW.id
           AND s.status = 'SELESAI'
       ) THEN
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
