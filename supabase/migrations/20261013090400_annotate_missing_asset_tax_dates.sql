-- The master workbook explicitly leaves tax expiry blank for these seven assets.
-- Preserve those blanks: STNK expiry from a different sheet is not a substitute tax expiry.
UPDATE public.kendaraan
SET keterangan = CASE
  WHEN COALESCE(keterangan,'') LIKE '%MASTER PAJAK KOSONG DI SUMBER%'
    THEN keterangan
  ELSE concat_ws(' | ', NULLIF(btrim(keterangan),''),
    'MASTER PAJAK KOSONG DI SUMBER: Data Kendaraan 07 Mei 2026.xlsx rows 64-70 (No 59-65) leaves Masa Berlaku Pajak blank for this asset while Status Pajak is Hidup. The STNK sheet has a separate STNK expiry (2027-06-06) and 5-year expiry (2029-06-06), not a sourced tax expiry. Do not fill PAJAK from STNK date without the actual tax document.')
  END,
  updated_at=now()
WHERE nomor_polisi IN ('BM 8091 QO','BM 8092 QO','BM 8093 QO','BM 8094 QO','BM 8095 QO','BM 8096 QO','BM 8097 QO')
  AND kepemilikan='ASET'
  AND masa_berlaku_pajak IS NULL
  AND status_pajak='HIDUP';
