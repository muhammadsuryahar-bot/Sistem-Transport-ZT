-- Exact operational fields from Data Kendaraan 07 Mei 2026.
-- Source columns: No, Merk, Type, Jenis, Tahun, No. Pol, No. Mesin,
-- No. Rangka, Pemilik, Status, Masa Berlaku Pajak, Status Pajak,
-- Unit Kerja, Driver, Lokasi Kerja, Keterangan, Catatan Hutang.
-- 'No' is a source row number and is intentionally not stored.

ALTER TABLE public.kendaraan
  ADD COLUMN IF NOT EXISTS status_pajak text,
  ADD COLUMN IF NOT EXISTS unit_kerja text,
  ADD COLUMN IF NOT EXISTS catatan_hutang text;

CREATE INDEX IF NOT EXISTS idx_kendaraan_status_pajak
  ON public.kendaraan(status_pajak);

CREATE INDEX IF NOT EXISTS idx_kendaraan_unit_kerja
  ON public.kendaraan(unit_kerja);
