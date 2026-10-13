-- BM 8241 TM's FPD row supplies KIR and 5-year dates, not tax/STNK expiry.
-- Do not treat the KIR due date as the vehicle tax expiration.
UPDATE public.kendaraan
SET masa_berlaku_pajak = NULL,
    keterangan = CASE
      WHEN coalesce(keterangan, '') LIKE '%tidak memuat tanggal pajak/STNK%'
        THEN keterangan
      ELSE concat_ws(' | ',
        NULLIF(btrim(keterangan), ''),
        'Koreksi audit sumber tanggal: FPD OPS 01 September 2026.xlsx, sheet STNK DAN KIR baris 16, memuat tanggal KIR 01 Feb 2026 dan 5 Tahun 28 Des 2027; tidak memuat tanggal pajak/STNK. Oleh sebab itu masa_berlaku_pajak dikosongkan, bukan menggunakan tanggal KIR sebagai pajak.'
      )
    END,
    updated_at = now()
WHERE nomor_polisi='BM 8241 TM';
