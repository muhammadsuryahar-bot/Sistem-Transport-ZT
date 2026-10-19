-- Scope rental import idempotency to the actual source workbook, worksheet and row.
-- Keeps all existing source data intact while allowing a newer/different workbook
-- to contain the same worksheet names and Excel row numbers without overwriting history.
ALTER TABLE public.rental_historis_excel
  DROP CONSTRAINT IF EXISTS rental_historis_excel_source_sheet_excel_row_key;

ALTER TABLE public.rental_historis_excel
  ALTER COLUMN source_file SET NOT NULL,
  ALTER COLUMN source_sheet SET NOT NULL,
  ALTER COLUMN excel_row SET NOT NULL;

ALTER TABLE public.rental_historis_excel
  ADD CONSTRAINT rental_historis_excel_source_file_sheet_row_key
  UNIQUE (source_file, source_sheet, excel_row);
