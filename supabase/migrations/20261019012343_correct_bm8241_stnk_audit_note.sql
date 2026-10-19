-- Correct the audit annotation for BM 8241 TM.
-- Source: FPD OPS 01 September 2026.xlsx, sheet "STNK DAN KIR", row 16.
-- Column G is STNK (2026-02-01), column H (KIR) is blank, and column I
-- (5 TAHUN) is 2028-02-01. No separate tax-expiry field is present in this row.
-- Keep masa_berlaku_pajak NULL; do not infer tax expiry from STNK/KIR/5-year dates.

DO $$
DECLARE affected_rows integer;
BEGIN
  UPDATE public.kendaraan
  SET keterangan = replace(
        keterangan,
        'Koreksi audit sumber tanggal: FPD OPS 01 September 2026.xlsx, sheet STNK DAN KIR baris 16, memuat tanggal KIR 01 Feb 2026 dan 5 Tahun 28 Des 2027; tidak memuat tanggal pajak/STNK. Oleh sebab itu masa_berlaku_pajak dikosongkan, bukan menggunakan tanggal KIR sebagai pajak.',
        'Koreksi audit sumber tanggal (diverifikasi ulang 19 Okt 2026): FPD OPS 01 September 2026.xlsx, sheet STNK DAN KIR baris 16. Header kolom G=STNK berisi tanggal 01 Feb 2026; kolom H=KIR kosong; kolom I=5 TAHUN berisi tanggal 01 Feb 2028; kolom J=Pemilik memuat OM Nanang. Sheet ini tidak memuat tanggal pajak atau masa berlaku pajak yang terpisah, sehingga masa_berlaku_pajak tetap NULL. Jangan memakai tanggal STNK atau 5 tahunan sebagai tanggal pajak tanpa bukti dokumen pajak.'
      ),
      updated_at = now()
  WHERE nomor_polisi = 'BM 8241 TM'
    AND keterangan LIKE '%Koreksi audit sumber tanggal:%tanggal KIR 01 Feb 2026 dan 5 Tahun 28 Des 2027%';

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  IF affected_rows <> 1 THEN
    RAISE EXCEPTION 'Expected to correct exactly one BM 8241 TM audit note, updated % rows', affected_rows;
  END IF;
END $$;
