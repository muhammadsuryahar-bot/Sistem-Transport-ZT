-- Align the vehicle status constraint with the values used by the Transport application.
-- The Excel source uses "Aset/Sewa" in its Status column, but that field represents
-- ownership, not the operational vehicle status. The application status values are:
-- ACTIVE, SERVICE, TIDAK_AKTIF.

DO $$
DECLARE
  constraint_exists boolean;
  col_type text;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.kendaraan'::regclass
      AND conname = 'kendaraan_status_check'
  ) INTO constraint_exists;

  IF constraint_exists THEN
    ALTER TABLE public.kendaraan DROP CONSTRAINT kendaraan_status_check;
  END IF;

  -- Normalize older status spellings before adding the canonical constraint.
  ALTER TABLE public.kendaraan
    ALTER COLUMN status DROP DEFAULT;

  UPDATE public.kendaraan
  SET status = CASE
    WHEN upper(trim(status::text)) IN ('ACTIVE', 'AKTIF', 'AKTIVE') THEN 'ACTIVE'
    WHEN upper(trim(status::text)) IN ('SERVICE', 'SERVIS', 'DALAM_SERVICE') THEN 'SERVICE'
    WHEN upper(trim(status::text)) IN ('TIDAK_AKTIF', 'NONAKTIF', 'NON_AKTIF', 'INACTIVE') THEN 'TIDAK_AKTIF'
    ELSE 'ACTIVE'
  END;

  ALTER TABLE public.kendaraan
    ADD CONSTRAINT kendaraan_status_check
    CHECK (status IN ('ACTIVE', 'SERVICE', 'TIDAK_AKTIF'));
END $$;

CREATE INDEX IF NOT EXISTS idx_kendaraan_status ON public.kendaraan(status);
CREATE INDEX IF NOT EXISTS idx_kendaraan_kepemilikan ON public.kendaraan(kepemilikan);
