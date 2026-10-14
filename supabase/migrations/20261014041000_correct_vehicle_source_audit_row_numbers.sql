-- Correct off-by-one Excel row references in the existing reconciliation notes.
-- This changes audit annotations only. No vehicle identity, plate, ownership, location,
-- document date, service, rental or financial values are changed.
UPDATE public.kendaraan
SET keterangan = replace(replace(keterangan, 'row 79 (No 74)', 'row 78 (No 74)'), 'row 84 (No 79)', 'row 83 (No 79)'),
    updated_at = now()
WHERE nomor_polisi = 'BE 9228 CV'
  AND keterangan LIKE '%Data Kendaraan 07 Mei 2026.xlsx%';

UPDATE public.kendaraan
SET keterangan = replace(replace(keterangan, 'row 78 (No 73)', 'row 77 (No 73)'), 'row 83 (No 78)', 'row 82 (No 78)'),
    updated_at = now()
WHERE nomor_polisi = 'BM 8417 TW'
  AND keterangan LIKE '%Data Kendaraan 07 Mei 2026.xlsx%';

UPDATE public.kendaraan
SET keterangan = replace(replace(keterangan, 'Excel row 81 (No 76)', 'Excel row 80 (No 76)'), 'row 87 (No 82)', 'row 86 (No 82)'),
    updated_at = now()
WHERE nomor_polisi = 'BM 9455 TS'
  AND keterangan LIKE '%Data Kendaraan 07 Mei 2026.xlsx%';

UPDATE public.kendaraan
SET keterangan = replace(replace(keterangan, 'Excel row 80 (No 75)', 'Excel row 79 (No 75)'), 'row 85 (No 80)', 'row 84 (No 80)'),
    updated_at = now()
WHERE nomor_polisi = 'BM 9483 TS'
  AND keterangan LIKE '%Data Kendaraan 07 Mei 2026.xlsx%';

UPDATE public.kendaraan
SET keterangan = replace(replace(keterangan, 'Excel row 73 (No 68)', 'Excel row 72 (No 68)'), 'row 86 (No 81)', 'row 85 (No 81)'),
    updated_at = now()
WHERE nomor_polisi = 'BM 9681 TZ'
  AND keterangan LIKE '%Data Kendaraan 07 Mei 2026.xlsx%';

UPDATE public.kendaraan
SET keterangan = replace(replace(replace(keterangan, 'Excel row 82 (No 77)', 'Excel row 81 (No 77)'), 'row 88 (No 83)', 'row 87 (No 83)'),
                         'row 82 (No 77)', 'row 81 (No 77)'),
    updated_at = now()
WHERE nomor_polisi = 'BM 9763 TO'
  AND keterangan LIKE '%Data Kendaraan 07 Mei 2026.xlsx%';

UPDATE public.kendaraan
SET keterangan = replace(replace(replace(keterangan, 'Excel rows 72 (No 67)', 'Excel rows 71 (No 67)'), '74 (No 69)', '73 (No 69)'),
                         '89 (No 84)', '88 (No 84)'),
    updated_at = now()
WHERE nomor_polisi = 'BM 9765 TO'
  AND keterangan LIKE '%Data Kendaraan 07 Mei 2026.xlsx%';

UPDATE public.kendaraan
SET keterangan = replace(keterangan, 'row 71 (No 66', 'row 70 (No 66'),
    updated_at = now()
WHERE nomor_polisi = 'BM 9672 TZ'
  AND keterangan LIKE '%Data Kendaraan 07 Mei 2026.xlsx%'
  AND keterangan LIKE '%row 71 (No 66%';
