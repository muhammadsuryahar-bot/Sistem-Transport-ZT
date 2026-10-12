-- FPD September 2026 gives the more recent operating base for BM 9383 TI.
-- The May workbook has two conflicting locations (Taluk Kuantan / Lipat Kain).
-- Update only when the existing location is one of those known older values.
UPDATE public.kendaraan
SET lokasi = 'Kandis',
    keterangan = concat_ws(' | ',
      NULLIF(btrim(keterangan), ''),
      'Lokasi direkonsiliasi ke Kandis berdasarkan FPD OPS 01 September 2026.xlsx: LIST KENDARAAN baris 18, STNK DAN KIR baris 30, dan catatan operasional. Master Mei memuat lokasi berbeda.'
    ),
    updated_at = now()
WHERE upper(regexp_replace(nomor_polisi, '[[:space:]]', '', 'g')) = 'BM9383TI'
  AND upper(btrim(coalesce(lokasi, ''))) IN ('TALUK KUANTAN', 'LIPAT KAIN');
