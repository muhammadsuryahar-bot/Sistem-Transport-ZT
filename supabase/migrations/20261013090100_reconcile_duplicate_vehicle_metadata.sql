-- Reconcile repeated vehicle rows only when engine + chassis prove the same vehicle.
-- Preserve and flag genuine identity conflicts; do not fabricate a second plate record.
UPDATE public.kendaraan
SET lokasi = 'Dumai',
    keterangan = CASE
      WHEN COALESCE(keterangan, '') LIKE '%duplikasi sumber BM 8417 TW%'
        THEN keterangan
      ELSE concat_ws(' | ', NULLIF(btrim(keterangan), ''),
        'Rekonsiliasi duplikasi sumber BM 8417 TW: Data Kendaraan 07 Mei 2026.xlsx row 78 (No 73) lists lokasi Pekanbaru; row 83 (No 78) has the same engine 3SZDGL3324 and chassis MHKP3CA1JHK155863 but lists Dumai. The later repeated row is retained for location; verify against current field assignment if the vehicle moved afterwards.')
    END,
    updated_at = now()
WHERE nomor_polisi='BM 8417 TW'
  AND nomor_mesin='3SZDGL3324'
  AND nomor_rangka='MHKP3CA1JHK155863'
  AND lokasi='Pekanbaru';

UPDATE public.kendaraan
SET lokasi = 'Duri',
    keterangan = CASE
      WHEN COALESCE(keterangan, '') LIKE '%duplikasi sumber BE 9228 CV%'
        THEN keterangan
      ELSE concat_ws(' | ', NULLIF(btrim(keterangan), ''),
        'Rekonsiliasi duplikasi sumber BE 9228 CV: Data Kendaraan 07 Mei 2026.xlsx row 79 (No 74) lists lokasi Pekanbaru; row 84 (No 79) has the same engine K3MG67568 and chassis MHKP3BA1JGK116590 but lists Duri. The later repeated row is retained for location; verify against current field assignment if the vehicle moved afterwards.')
    END,
    updated_at = now()
WHERE nomor_polisi='BE 9228 CV'
  AND nomor_mesin='K3MG67568'
  AND nomor_rangka='MHKP3BA1JGK116590'
  AND lokasi='Pekanbaru';

UPDATE public.kendaraan
SET keterangan = CASE
  WHEN COALESCE(keterangan, '') LIKE '%dua identitas kendaraan yang berbeda%'
    THEN keterangan
  ELSE concat_ws(' | ', NULLIF(btrim(keterangan), ''),
    'PERLU VERIFIKASI IDENTITAS: Data Kendaraan 07 Mei 2026.xlsx memuat BM 9672 TZ pada row 19 (No 14: tahun 2011, engine DCK4885, chassis MHKP3CMJB019734, pajak 2022-07-05, lokasi Pekanbaru) dan row 71 (No 66: tahun 2014, engine K3MH79043, chassis MHKP3BA1JLK158426, pajak 2025-06-18, lokasi Dumai). Ini dua identitas kendaraan yang berbeda dengan satu nomor polisi; record aktif dipertahankan tanpa mengganti mesin/rangka. Perlu cocokkan STNK fisik sebelum mengubah identitas atau menambah record kedua.')
  END,
  updated_at = now()
WHERE nomor_polisi='BM 9672 TZ'
  AND nomor_mesin='DCK4885'
  AND nomor_rangka='MHKP3CMJB019734';

UPDATE public.dokumen_kendaraan
SET keterangan = CASE
  WHEN COALESCE(keterangan, '') LIKE '%nilai serial 11429%'
    THEN keterangan
  ELSE concat_ws(' | ', NULLIF(btrim(keterangan), ''),
    'ANOMALI SUMBER EXCEL: Data Kendaraan 07 Mei 2026.xlsx, sheet STNK row 15 stores 5 TAHUN as numeric 11429 with date format d-mmm-yy; row 16 for BM 9085 TS stores the same. Interpreted as Excel serial, this is 1931-04-16, which is implausible for a current registration. The displayed/system value 2031-04-16 is not proven by that source cell; verify the original STNK before treating as confirmed.')
  END,
  updated_at = now()
WHERE jenis_dokumen='5_TAHUNAN'
  AND kendaraan_id IN (SELECT id FROM public.kendaraan WHERE nomor_polisi IN ('BM 9084 TS','BM 9085 TS'));
