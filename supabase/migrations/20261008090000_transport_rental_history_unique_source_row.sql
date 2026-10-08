-- Prevent duplicate rental history rows for the same source sheet + Excel row.
-- Existing data was audited before adding this constraint; no duplicate pairs were found.
alter table public.rental_historis_excel
  add constraint rental_historis_excel_source_sheet_excel_row_key
  unique (source_sheet, excel_row);
