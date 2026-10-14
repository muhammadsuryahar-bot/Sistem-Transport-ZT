# Rekonsiliasi Sumber Kendaraan — 14 Oktober 2026

Dokumen ini mencatat hasil perbandingan sumber Excel dengan master Kendaraan di Supabase. Tujuannya menjaga asal-usul data, mencegah duplikasi baru, dan tidak menebak identitas saat dua sumber saling bertentangan.

## Sumber dan jumlah

- `Data Kendaraan 07 Mei 2026(1).xlsx`, sheet `Data Kendaraan`: **83 baris dengan nomor polisi, 73 nomor polisi unik**, dengan 9 grup plat berulang (10 baris lebih dari satu kemunculan).
- Master database: **75 kendaraan, 75 nomor polisi unik**, tanpa plat yang sama tersimpan dua kali.
- Plat yang hanya ada pada master Excel Mei: `BM 9960 TM`.
- Plat yang ada di database tetapi tidak sebagai plat unik di sheet master Mei: `BM 8241 TM`, `BM 9808 TO`, dan `BM 9960 TW`. Dua pertama memiliki catatan sumber FPD September/riwayat sewa. Pasangan `TM/TW` adalah konflik antar-sheet, bukan dasar untuk membuat kendaraan ke-76.
- `Data Genset`: 33 sumber/record.
- Detail `Data Service`: 388 item pada database dan tidak ditemukan mismatch hitungan subtotal (jumlah × harga satuan) pada database.
- `SUMMERY RENTAL`: 358 catatan historis di database, total `Rp3.285.788.572,00`, cocok dengan Grand Total workbook.

## Duplikasi yang memang ada pada sumber

Sheet `Data Kendaraan` mengandung 9 grup plat berulang:

| Plat | Baris Excel yang relevan | Hasil |
|---|---|---|
| BM 9672 TZ | 19 dan 70 | **Konflik identitas**: tahun, nomor mesin/rangka, pajak dan lokasi berbeda. Harus diperiksa dengan STNK fisik. |
| BM 9383 TI | 31 dan 75 | Mesin/rangka sama, lokasi Taluk Kuantan vs Lipat Kain; FPD September mendukung lokasi Kandis untuk record database. |
| BM 9765 TO | 71, 73, 88 | Identitas dan lokasi Duri sama; satu kendaraan saja yang dipertahankan. |
| BM 9681 TZ | 72 dan 85 | Mesin/rangka sama, lokasi Ujung Tanjung vs Duri. |
| BM 8417 TW | 77 dan 82 | Mesin/rangka sama, lokasi Pekanbaru vs Dumai. |
| BE 9228 CV | 78 dan 83 | Mesin/rangka sama, lokasi Pekanbaru vs Duri. |
| BM 9483 TS | 79 dan 84 | Mesin/rangka sama; satu lokasi kosong, satunya Talok Kuantan. |
| BM 9455 TS | 80 dan 86 | Mesin/rangka sama; satu lokasi kosong, satunya Pasir Pangarayan. |
| BM 9763 TO | 81 dan 87 | Mesin/rangka sama; satu lokasi kosong, satunya Pakning. |

Catatan yang sebelumnya menyebut nomor baris Excel duplikat tertentu dengan selisih satu baris dikoreksi oleh migration `20261014034757_correct_vehicle_source_audit_row_numbers`, yang tercatat dan diterapkan pada Supabase production tanggal 14 Oktober 2026. Query sesudah migrasi mengonfirmasi semua delapan catatan nomor baris yang diaudit sudah cocok. Perubahan hanya membetulkan teks audit, bukan nilai kendaraan.

## Konflik nomor mesin/rangka lintas kendaraan

Lima pasangan lintas plat pada workbook master Mei menggunakan nomor mesin/rangka yang sama. File sumber tidak cukup untuk menentukan nomor mana yang salah:

1. `BM 1533 OA ↔ BM 1533 VP` — `2NRF754840` / `MHKE8FA3JJK016543`.
2. `BM 1713 OX ↔ BM 9084 TS` — `4G15L88671` / `MHMU5TU2EFK172154`.
3. `BM 1694 OK ↔ BM 1827 JD` — `4N15UKB2434` / `MMBJJKL10PH065322`.
4. `BM 8005 LN ↔ BM 9383 TI` — `DJ35383` / `MHKP3BA1JBK027565`.
5. `BM 8263 TI ↔ BM 9764 TO` — `ME30906` / `MHKP3BA1JEK081391`.

Database juga memiliki konflik lintas-sumber antara `BM 9763 TO` dan `BM 9808 TO` (`ME35374` / `MHKP3BA1JEK081902`); kedua plat tetap terpisah karena FPD berisi transaksi terpisah. Nomor mesin/rangka tidak diganti.

## Konflik BM 9960 TM / BM 9960 TW

- Sheet master Mei, baris 36, menulis `BM 9960 TM` dan model Daihatsu, tetapi nomor mesin/rangkanya `4G15S76333` / `MK2U5TU2EJK011885`.
- Sheet STNK di workbook Mei, baris 29, menulis `BM 9960 TW`, Mitsubishi Colt.120 S/P.U, tahun 2018.
- FPD September sheet `STNK DAN KIR`, baris 35, juga menulis `BM 9960 TW`; banyak baris operasional FPD memakai nomor TW.
- Database mempertahankan satu record `BM 9960 TW` dengan model Mitsubishi dan nomor mesin/rangka tersebut. Ini adalah pilihan yang lebih didukung oleh lembar STNK dan riwayat, **namun tetap perlu konfirmasi STNK fisik**. Import master Mei yang belum direkonsiliasi harus ditahan agar tidak menambahkan `BM 9960 TM` sebagai kendaraan kedua.

## Pengamanan import

- PR #38 menambahkan validasi konflik sumber sebelum import dan penanda kendaraan perlu verifikasi pada halaman Kendaraan.
- PR #39 memperluas validasi ke kolom operasional yang saling bertentangan pada baris berulang dan membandingkan nomor mesin/rangka file dengan master database saat ini. Bila sumber konflik, import ditahan sebelum RPC; tidak ada perubahan parsial.
- Tidak ada identitas kendaraan, status kepemilikan atau nomor mesin/rangka yang dikoreksi otomatis.

## Item yang tetap memerlukan bukti perusahaan

- Konfirmasi STNK/BPKB untuk lima pasangan nomor mesin/rangka di atas dan pasangan `BM 9763 TO/BM 9808 TO`.
- Konfirmasi identitas `BM 9672 TZ` serta nomor polisi `BM 9960 TM/TW`.
- Kontrak/pembuktian kepemilikan untuk kendaraan yang sumber FPD catat sebagai Aset tetapi masih memiliki kontrak sewa terkait.
- Selesaikan angka Service 327/328 berdasarkan invoice.
- Berkas dokumen fisik: 86 metadata dokumen masih belum memiliki `file_path`.
- Harga patokan resmi tetap kosong sampai disahkan.
- UAT login dan alur kerja untuk setiap role, ekspor, akses file privat, dan backup/recovery belum lulus. Hanya satu akun ADMIN aktif tersedia saat audit.
