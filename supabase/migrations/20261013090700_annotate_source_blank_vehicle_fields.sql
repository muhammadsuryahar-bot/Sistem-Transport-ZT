-- Document source omissions instead of fabricating master vehicle fields.
WITH note_map(nomor_polisi,note) AS (
 VALUES
('BM 8091 QO','NO MESIN/RANGKA KOSONG DI SUMBER: Data Kendaraan 07 Mei 2026.xlsx rows 64-70 (No 59-65) leaves nomor mesin and nomor rangka blank for this asset. The FPD STNK DAN KIR sheet lists the shared STNK/5-year expiry dates but does not provide engine/chassis for these seven plates. Null fields match the source; do not fabricate identifiers without the physical vehicle documents.'),
('BM 8092 QO','NO MESIN/RANGKA KOSONG DI SUMBER: Data Kendaraan 07 Mei 2026.xlsx rows 64-70 (No 59-65) leaves nomor mesin and nomor rangka blank for this asset. The FPD STNK DAN KIR sheet lists the shared STNK/5-year expiry dates but does not provide engine/chassis for these seven plates. Null fields match the source; do not fabricate identifiers without the physical vehicle documents.'),
('BM 8093 QO','NO MESIN/RANGKA KOSONG DI SUMBER: Data Kendaraan 07 Mei 2026.xlsx rows 64-70 (No 59-65) leaves nomor mesin and nomor rangka blank for this asset. The FPD STNK DAN KIR sheet lists the shared STNK/5-year expiry dates but does not provide engine/chassis for these seven plates. Null fields match the source; do not fabricate identifiers without the physical vehicle documents.'),
('BM 8094 QO','NO MESIN/RANGKA KOSONG DI SUMBER: Data Kendaraan 07 Mei 2026.xlsx rows 64-70 (No 59-65) leaves nomor mesin and nomor rangka blank for this asset. The FPD STNK DAN KIR sheet lists the shared STNK/5-year expiry dates but does not provide engine/chassis for these seven plates. Null fields match the source; do not fabricate identifiers without the physical vehicle documents.'),
('BM 8095 QO','NO MESIN/RANGKA KOSONG DI SUMBER: Data Kendaraan 07 Mei 2026.xlsx rows 64-70 (No 59-65) leaves nomor mesin and nomor rangka blank for this asset. The FPD STNK DAN KIR sheet lists the shared STNK/5-year expiry dates but does not provide engine/chassis for these seven plates. Null fields match the source; do not fabricate identifiers without the physical vehicle documents.'),
('BM 8096 QO','NO MESIN/RANGKA KOSONG DI SUMBER: Data Kendaraan 07 Mei 2026.xlsx rows 64-70 (No 59-65) leaves nomor mesin and nomor rangka blank for this asset. The FPD STNK DAN KIR sheet lists the shared STNK/5-year expiry dates but does not provide engine/chassis for these seven plates. Null fields match the source; do not fabricate identifiers without the physical vehicle documents.'),
('BM 8097 QO','NO MESIN/RANGKA KOSONG DI SUMBER: Data Kendaraan 07 Mei 2026.xlsx rows 64-70 (No 59-65) leaves nomor mesin and nomor rangka blank for this asset. The FPD STNK DAN KIR sheet lists the shared STNK/5-year expiry dates but does not provide engine/chassis for these seven plates. Null fields match the source; do not fabricate identifiers without the physical vehicle documents.'),
('BM 8030 QN','TAHUN KOSONG DI SUMBER: the Tahun cell for BM 8030 QN is blank in Data Kendaraan 07 Mei 2026.xlsx. The master also has no engine/chassis identifiers for this row. The database preserves null rather than filling a guessed year.'),
('BM 8099 TW','TAHUN KOSONG DI SUMBER: the Tahun cell for BM 8099 TW is blank in Data Kendaraan 07 Mei 2026.xlsx. Existing model, engine/chassis, ownership and location values are preserved; year is not inferred from neighboring vehicles.'),
('BM 8662 DN','TAHUN KOSONG DI SUMBER: the Tahun cell for BM 8662 DN is blank in Data Kendaraan 07 Mei 2026.xlsx. Engine/chassis values are also not provided for this row. The database preserves null rather than filling guessed identifiers.')
)
UPDATE public.kendaraan k
SET keterangan=CASE
 WHEN coalesce(k.keterangan,'') LIKE '%' || split_part(nm.note,':',1) || '%'
  THEN k.keterangan
 ELSE concat_ws(' | ',NULLIF(btrim(k.keterangan),''),nm.note)
END,
updated_at=now()
FROM note_map nm
WHERE k.nomor_polisi=nm.nomor_polisi
  AND (
    (nm.nomor_polisi IN ('BM 8091 QO','BM 8092 QO','BM 8093 QO','BM 8094 QO','BM 8095 QO','BM 8096 QO','BM 8097 QO')
       AND k.nomor_mesin IS NULL AND k.nomor_rangka IS NULL)
    OR (nm.nomor_polisi='BM 8030 QN' AND k.tahun IS NULL)
    OR (nm.nomor_polisi='BM 8099 TW' AND k.tahun IS NULL)
    OR (nm.nomor_polisi='BM 8662 DN' AND k.tahun IS NULL AND k.nomor_mesin IS NULL AND k.nomor_rangka IS NULL)
  );
