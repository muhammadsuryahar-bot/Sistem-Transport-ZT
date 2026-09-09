-- Finance fields matching Transport's service workbook.
-- DPP, VAT/PPN, and total are stored explicitly so historical Excel data
-- can be preserved without collapsing all costs into one amount.
ALTER TABLE public.service
  ADD COLUMN IF NOT EXISTS nilai_dpp numeric(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ppn numeric(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total numeric(15,2) NOT NULL DEFAULT 0;

UPDATE public.service
SET nilai_dpp = COALESCE(nilai_dpp, COALESCE(biaya_aktual, estimasi_biaya, 0)),
    ppn = COALESCE(ppn, 0),
    total = COALESCE(total, COALESCE(biaya_aktual, estimasi_biaya, 0) + COALESCE(ppn, 0));

ALTER TABLE public.service
  ADD CONSTRAINT service_finance_nonnegative
  CHECK (nilai_dpp >= 0 AND ppn >= 0 AND total >= 0);

CREATE INDEX IF NOT EXISTS idx_service_finance_total ON public.service (total);
