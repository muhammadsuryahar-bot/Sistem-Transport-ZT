-- Retain one row for duplicate plates in the May source; document how location values were selected.
WITH note_map(nomor_polisi,note) AS (
 VALUES
('BM 9765 TO','DUPLIKASI BARIS SUMBER: Data Kendaraan 07 Mei 2026.xlsx mencantumkan BM 9765 TO pada Excel rows 72 (No 67), 74 (No 69), dan 89 (No 84). Ketiganya cocok pada engine ME31716, chassis MHKP3BA1JEK081412, tahun 2014, pemilik Bpk. Johar Mawardi, lokasi Duri. Dipertahankan satu record kendaraan karena tiga baris sumber adalah duplikat identitas yang sama; jangan membuat kendaraan tambahan.'),
('BM 9681 TZ','DUPLIKASI SUMBER DENGAN KONFLIK LOKASI: Data Kendaraan 07 Mei 2026.xlsx mencatat BM 9681 TZ pada Excel row 73 (No 68) dengan lokasi Ujung Tanjung dan row 86 (No 81) dengan lokasi Duri; engine K3MH78985 dan chassis MHKP3BA1JLK158411 sama. Sistem mempertahankan lokasi dari baris sumber terakhir, Duri; pastikan lokasi lapangan masih benar bila kendaraan berpindah setelah Mei 2026.'),
('BM 9483 TS','DUPLIKASI SUMBER DENGAN LOKASI KOSONG: Data Kendaraan 07 Mei 2026.xlsx mencatat BM 9483 TS pada Excel row 80 (No 75) tanpa lokasi dan row 85 (No 80) dengan lokasi Talok Kuantan. Engine K3MG68631 dan chassis MHKP3BA1JGK117192 sama, sehingga satu record dipertahankan dengan lokasi dari baris lengkap.'),
('BM 9455 TS','DUPLIKASI SUMBER DENGAN LOKASI KOSONG: Data Kendaraan 07 Mei 2026.xlsx mencatat BM 9455 TS pada Excel row 81 (No 76) tanpa lokasi dan row 87 (No 82) dengan lokasi Pasir Pangarayan. Engine K3MG77654 dan chassis MHKP4BA2JGK179751 sama, sehingga satu record dipertahankan dengan lokasi dari baris lengkap.'),
('BM 9763 TO','DUPLIKASI SUMBER DENGAN LOKASI BERBEDA: Data Kendaraan 07 Mei 2026.xlsx mencatat BM 9763 TO pada Excel row 82 (No 77) tanpa lokasi dan row 88 (No 83) dengan lokasi Pakning; engine ME35374 dan chassis MHKP3BA1JEK081902 sama. Sistem menggunakan lokasi dari baris lengkap, Pakning. Identitas ini juga konflik nomor rangka dengan BM 9808 TO dan telah ditandai terpisah.')
)
UPDATE public.kendaraan k
SET keterangan=CASE
 WHEN coalesce(k.keterangan,'') LIKE '%' || split_part(nm.note,':',1) || '%'
   THEN k.keterangan
 ELSE concat_ws(' | ',NULLIF(btrim(k.keterangan),''),nm.note)
END,
updated_at=now()
FROM note_map nm
WHERE k.nomor_polisi=nm.nomor_polisi;
