-- Preserve the operational fields present in the vehicle source workbook.
-- The source workbook's vehicle columns are:
-- No, Merk, Type, Jenis, Tahun, No. Pol, No. Mesin, No. Rangka,
-- Pemilik, Status, Masa Berlaku Pajak, Status Pajak, Unit Kerja, Driver,
-- Lokasi Kerja, Keterangan, Catatan Hutang.

ALTER TABLE public.kendaraan
  ADD COLUMN IF NOT EXISTS unit_kerja text,
  ADD COLUMN IF NOT EXISTS status_pajak text,
  ADD COLUMN IF NOT EXISTS catatan_hutang text;

CREATE INDEX IF NOT EXISTS idx_kendaraan_unit_kerja
  ON public.kendaraan(unit_kerja);

CREATE INDEX IF NOT EXISTS idx_kendaraan_status_pajak
  ON public.kendaraan(status_pajak);
