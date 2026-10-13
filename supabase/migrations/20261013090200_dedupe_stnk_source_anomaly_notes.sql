-- Deduplicate repeated provenance notes for the unresolved 5-year expiry source cells.
-- Re-run safely: only rows with a second anomaly marker are rewritten.
WITH targets AS (
  SELECT d.id,d.keterangan,
         position(' | ANOMALI SUMBER EXCEL:' in d.keterangan) AS marker_pos
  FROM public.dokumen_kendaraan d
  JOIN public.kendaraan k ON k.id=d.kendaraan_id
  WHERE d.jenis_dokumen='5_TAHUNAN'
    AND k.nomor_polisi IN ('BM 9084 TS','BM 9085 TS')
), duplicates AS (
  SELECT id,keterangan,marker_pos,
    position(' | ANOMALI SUMBER EXCEL:' in substring(keterangan from marker_pos + length(' | ANOMALI SUMBER EXCEL:'))) AS later_marker
  FROM targets
)
UPDATE public.dokumen_kendaraan d
SET keterangan = left(dups.keterangan,dups.marker_pos-1)||' | ANOMALI SUMBER EXCEL: Data Kendaraan 07 Mei 2026.xlsx, sheet STNK row 15 stores 5 TAHUN as numeric 11429 with date format d-mmm-yy; row 16 for BM 9085 TS stores the same. Interpreted as Excel serial, this is 1931-04-16, which is implausible for a current registration. The displayed/system value 2031-04-16 is not proven by that source cell; verify the original STNK before treating as confirmed.',
    updated_at = now()
FROM duplicates dups
WHERE d.id=dups.id AND dups.marker_pos>0 AND dups.later_marker>0;
