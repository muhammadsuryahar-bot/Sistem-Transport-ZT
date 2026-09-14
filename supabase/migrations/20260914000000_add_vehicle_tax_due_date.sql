-- Backfill the vehicle master schema used by the current Transport UI/importer.
-- The frontend already reads and imports the vehicle tax due date as a DATE.
-- IF NOT EXISTS keeps this migration safe on databases that already have the column.

ALTER TABLE public.kendaraan
  ADD COLUMN IF NOT EXISTS masa_berlaku_pajak date;

-- Ask PostgREST/Supabase API to reload its schema cache after the DDL change.
NOTIFY pgrst, 'reload schema';
