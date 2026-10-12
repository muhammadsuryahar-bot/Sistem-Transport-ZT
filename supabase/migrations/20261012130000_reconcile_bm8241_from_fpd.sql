-- Reconcile a vehicle appearing in FPD OPS 01 September 2026.xlsx but missing
-- from the newer main vehicle master workbook. All populated values below are
-- explicitly sourced from sheet "STNK DAN KIR" row 16 and operational rental notes.
-- Do not synthesize STNK rows in the Documents module: that module is for company assets.
INSERT INTO public.kendaraan
  (kode_kendaraan, nomor_polisi, merk, tipe, jenis_kendaraan, tahun,
   kepemilikan, jenis_sewa, pemilik, lokasi, unit_kerja,
   masa_berlaku_pajak, keterangan)
SELECT
  'KND-BM8241TM', 'BM 8241 TM', 'Daihatsu', 'Grandmax/P.U', 'Pickup', 2012,
  'SEWA', 'SEWA_PERORANGAN', 'OM Nanang', 'Pasir Pangaraian',
  'Suppor Catu Daya', DATE '2026-02-01',
  'Rekonsiliasi dari FPD OPS 01 September 2026.xlsx, sheet STNK DAN KIR baris 16; nomor polisi juga muncul pada catatan operasional kendaraan sewa. Tidak ada pada master Data Kendaraan 07 Mei 2026; detail kontrak belum dikonfirmasi.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.kendaraan
  WHERE upper(regexp_replace(nomor_polisi, '[[:space:]]', '', 'g')) = 'BM8241TM'
)
ON CONFLICT (nomor_polisi) DO NOTHING;
