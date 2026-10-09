-- Keep only one unique index for the rental source-row key.
-- The named constraint remains the source of truth for ON CONFLICT(source_sheet, excel_row).
drop index if exists public.rental_historis_excel_source_idx;
