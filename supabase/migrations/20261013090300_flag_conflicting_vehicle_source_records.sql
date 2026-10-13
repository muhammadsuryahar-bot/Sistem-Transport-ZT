-- Preserve source conflicts and anomalies without changing ownership, identity or document dates.
UPDATE public.kendaraan
SET keterangan = CASE
 WHEN coalesce(keterangan,'') LIKE '%KONFLIK SUMBER KEPEMILIKAN: Data Kendaraan 07 Mei 2026.xlsx%'
   THEN keterangan
 ELSE concat_ws(' | ',NULLIF(btrim(keterangan),''),'KONFLIK SUMBER KEPEMILIKAN: Data Kendaraan 07 Mei 2026.xlsx dan kontrak sistem memperlakukan BM 8238 TM sebagai SEWA (pemilik Bpk. Hariadi JS; ada 8 kontrak sewa), dan sheet Sewa KEndaraan pada FPD OPS 01 September 2026.xlsx juga mencatat pembayaran rental untuk BM 8238 TM. Namun FPD September sheet LIST KENDARAAN dan STNK DAN KIR menempatkannya dalam daftar aset/PT Zaman Teknindo (tahun 2012, engine MA39206, chassis MHKP3BA1JCK049883). Status SEWA dipertahankan karena kontrak aktif/terkait; jangan masukkan dokumen pada modul aset sampai kepemilikan fisik/kontrak dikonfirmasi.')
 END,
 updated_at=now()
WHERE nomor_polisi='BM 8238 TM'
  AND kepemilikan='SEWA'
  AND nomor_mesin='MA39206'
  AND nomor_rangka='MHKP3BA1JCK049883';

UPDATE public.kendaraan
SET keterangan = CASE
 WHEN coalesce(keterangan,'') LIKE '%PERLU VERIFIKASI IDENTITAS/KEPEMILIKAN: Data Kendaraan 07 Mei 2026.xlsx%'
   THEN keterangan
 ELSE concat_ws(' | ',NULLIF(btrim(keterangan),''),'PERLU VERIFIKASI IDENTITAS/KEPEMILIKAN: Data Kendaraan 07 Mei 2026.xlsx mencatat BM 8003 LN sebagai SEWA, tahun 2011, engine DCJ5444, chassis MHKP3CA1JBK018871, dan pajak 14 Mar 2024. Namun sheet STNK pada workbook yang sama mencatat BM 8003 LN tahun 2015, STNK 10 Feb 2027, dan kolom 5 TAHUN berisi numeric 10999 dengan format tanggal (yang jika serial Excel dibaca sebagai 1930, bukan masa berlaku modern). Data ini tidak cukup untuk mengubah identitas/kepemilikan atau membuat dokumen; cocokkan STNK fisik dan kontrak terlebih dahulu.')
 END,
 updated_at=now()
WHERE nomor_polisi='BM 8003 LN'
  AND kepemilikan='SEWA'
  AND nomor_mesin='DCJ5444'
  AND nomor_rangka='MHKP3CA1JBK018871';

UPDATE public.rental_historis_excel
SET catatan = CASE
 WHEN coalesce(catatan,'') LIKE '%ANOMALI SUMBER NOMOR BARIS: Excel row 346%'
   THEN catatan
 ELSE concat_ws(' | ',NULLIF(btrim(catatan), ''),
   'ANOMALI SUMBER NOMOR BARIS: Excel row 346 pada FPD OPS 01 September 2026.xlsx, sheet SUMMERY RENTAL, kolom No literal berisi "341+A346:F349" (bukan angka urut). Nilai invoice dan kolom lainnya tetap dicocokkan ke baris sumber; source_no asli dipertahankan untuk audit, gunakan excel_row=346 sebagai penunjuk pasti.')
 END,
 updated_at=now()
WHERE excel_row=346
  AND source_no='341+A346:F349';
