-- Prevent duplicate rental history rows for the same source sheet + Excel row.
-- This migration version is already recorded in the linked database; this file restores source migration history.
alter table public.rental_historis_excel
  add constraint rental_historis_excel_source_sheet_excel_row_key
  unique (source_sheet, excel_row);
