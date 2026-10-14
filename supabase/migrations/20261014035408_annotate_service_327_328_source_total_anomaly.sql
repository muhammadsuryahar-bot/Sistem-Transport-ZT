-- Preserve source trace and surface the unresolved invoice discrepancy for Data Service rows 327/328.
-- This adds audit text only; it does not modify DPP, PPn, Total, quantities, prices, or item metadata.
UPDATE public.service s
SET catatan = concat_ws(
  ' | ',
  nullif(s.catatan, ''),
  'ANOMALI SUMBER DATA SERVICE (No. 327-328): Pada workbook Data Kendaraan 07 Mei 2026.xlsx, sheet Data Service, No. 327 memiliki DPP Rp10.000 + PPn Rp10.000 tetapi kolom Total berisi Rp1.665.000 (DPP+PPn = Rp20.000). No. 328 memiliki DPP Rp275.000 + PPn Rp275.000 tetapi kolom Total berisi Rp1.665.000 (DPP+PPn = Rp550.000). Header kelompok impor memiliki DPP Rp309.000 + PPn Rp287.640 = Rp596.640, yang konsisten secara aritmetika untuk kelompok 4 baris. Angka final No. 327/328 jangan diubah sebelum invoice diperiksa.'
),
    updated_at = now()
WHERE s.catatan LIKE 'Import histori Excel: Data Service%'
  AND s.catatan NOT LIKE '%ANOMALI SUMBER DATA SERVICE (No. 327-328)%'
  AND EXISTS (
    SELECT 1 FROM public.service_item si
    WHERE si.service_id = s.id
      AND si.keterangan LIKE '%"source_no":"327.0"%'
  )
  AND EXISTS (
    SELECT 1 FROM public.service_item si
    WHERE si.service_id = s.id
      AND si.keterangan LIKE '%"source_no":"328.0"%'
  )
  AND EXISTS (
    SELECT 1 FROM public.service_item si
    WHERE si.service_id = s.id
      AND si.keterangan LIKE '%"source_no":"325.0"%'
  )
  AND EXISTS (
    SELECT 1 FROM public.service_item si
    WHERE si.service_id = s.id
      AND si.keterangan LIKE '%"source_no":"326.0"%'
  );