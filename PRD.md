# PRD — Sistem Manajemen Transport & Kendaraan Operasional
## PT Zaman Teknindo

**Tanggal:** 29 September 2026  
**Repository:** `muhammadsuryahar-bot/Sistem-Transport-ZT`  
**Branch:** `main`

> Dokumen ini adalah **backup perubahan besar + source of truth pengembangan**. Sistem harus sederhana dan bersih di depan, tetapi data tetap lengkap, terhubung, aman, dapat ditelusuri, dan dapat diekspor kembali ke format kerja Excel.

---

## 1. Tujuan

PRD ini menjadi acuan untuk:

- fitur dan aturan bisnis yang sudah dibangun;
- standar UI/UX seluruh modul;
- mapping Import/Export Excel;
- checklist QA/UAT;
- backup perubahan besar;
- rollback jika perubahan berikutnya menyebabkan regresi.

Aturan bisnis terbaru dari Bagian Transport mengalahkan bentuk Excel lama bila terjadi konflik.

---

## 2. Referensi yang Sudah Diverifikasi

Sumber yang diperiksa:

- source code repository;
- database Supabase aktif;
- GitHub Actions;
- `Rekap_Fitur_Sistem_Transport_ZT.xlsx`;
- dokumen perancangan Transport 2026;
- aturan tambahan yang diberikan selama pengembangan.

### Excel acuan yang ditemukan

`Rekap_Fitur_Sistem_Transport_ZT.xlsx` memiliki 6 sheet:

1. Rekap Fitur
2. Role & Akses
3. Field & Aturan
4. Alur Sistem
5. Tambahan Transport
6. Checklist UAT

Dokumen perancangan juga menyebut workbook operasional seperti **Data Kendaraan 07 Mei 2026** dan **FPD OPS 01 September 2026**, termasuk area Data Service, Sewa Kendaraan, STNK/KIR, BBM, dan permintaan.

**Pembaruan audit 13 Oktober 2026:** workbook sumber operasional kini tersedia dan telah diperiksa untuk rekonsiliasi struktur/data: `Data Kendaraan 07 Mei 2026.xlsx` dan `FPD OPS 01 September 2026.xlsx`. Pemeriksaan mencakup jumlah baris sumber, nomor polisi, duplikasi identitas, Data Service, Genset, Summary Rental, dan dokumen. **Audit ini belum membuktikan semua ekspor UI cocok cell-per-cell dengan workbook referensi**; uji ekspor melalui browser masih harus dilakukan. Anomali workbook dan konflik identitas tetap dicatat, tidak ditutup dengan tebakan.

---

# 3. Arsitektur

## Frontend

- React
- Vite
- JavaScript
- Responsive desktop/mobile

## Backend/data

- Supabase PostgreSQL
- Supabase Auth
- Supabase Storage
- RLS + role guard

## Deployment

Target frontend: Vercel.

**Status aktual:** source Transport sudah mendapatkan deployment Vercel yang berstatus `SUCCESS` pada commit terbaru yang diverifikasi dari GitHub status. Connector Vercel yang tersedia di ChatGPT tidak dapat membaca detail project/deployment tersebut (mengembalikan 403/404), sehingga konfigurasi project/env tidak diklaim terverifikasi dari connector.

Production tetap harus diverifikasi dengan membuka URL production dan melakukan UAT browser sebelum release final.

---

# 4. Role

- ADMIN
- TRANSPORT
- OPERASIONAL
- ATASAN_TRANSPORT
- DIREKTUR
- AKUNTANSI

Akses menu mengikuti role.

---

# 5. Modul Kendaraan

## Data

- kode kendaraan
- nomor polisi
- merk
- tipe
- jenis kendaraan
- tahun
- nomor mesin
- nomor rangka
- kepemilikan
- jenis sewa
- harga perolehan
- pemilik
- driver/PIC
- unit kerja
- lokasi kerja
- masa berlaku pajak
- status pajak
- keterangan
- catatan hutang
- foto STNK

## Kepemilikan aktif

- ASET
- SEWA

Untuk SEWA:

- SEWA_PERORANGAN
- SEWA_PERUSAHAAN

Label UI:

- Sewa Perorangan
- Sewa Perusahaan

Legacy `SEWA_RENTAL` tidak digunakan lagi pada runtime baru.

## Aksi

- Detail
- Edit
- Hapus
- Kelola Sewa
- Search
- Filter
- Bulk select

Hapus harus memeriksa relasi histori/transaksi agar data tidak rusak.

---

# 6. Data Service

Nama menu final:

**Data Service**

## Ringkasan Kendaraan

Menampilkan:

- jumlah service;
- jumlah jasa;
- jumlah sparepart;
- total jasa;
- total sparepart;
- total pengeluaran;
- harga perolehan;
- KM;
- jarak terpantau;
- service terakhir;
- sparepart terakhir;
- patokan harga;
- flag biaya dibanding harga kendaraan.

## Pengajuan Service

- Detail
- Edit
- Surat Pengantar
- Hapus sesuai aturan

## Patokan Harga / Shopping List

- Item, kategori, dan satuan
- Jumlah transaksi, kendaraan berbeda, dan bengkel berbeda
- Harga minimum, median, rata-rata, dan maksimum historis
- Patokan Admin yang aktif beserta tanggal mulai berlaku dan dasar harga
- Selisih rata-rata historis terhadap patokan Admin aktif
- Search dan filter kategori
- Edit/hapus patokan; tambah/nonaktifkan hanya untuk ADMIN/TRANSPORT
- ATASAN_TRANSPORT, DIREKTUR, dan AKUNTANSI mendapat akses lihat sesuai policy database

**Aturan data:** harga historis menjadi pembanding, bukan harga resmi otomatis. Harga patokan resmi hanya diisi setelah invoice, satuan, bengkel, dan dasar persetujuan diperiksa. Patokan baru tidak disalin otomatis dari median historis.
- Edit
- Hapus

Flag biaya terhadap harga kendaraan hanya untuk **review**, bukan keputusan otomatis menjual/mengganti kendaraan.

---

# 7. Service & Perbaikan

CRUD:

- Service
- Item Service
- Bukti Service
- Ganti Ban
- Ganti Aki/Baterai
- Riwayat Kilometer

Data service:

- kendaraan
- pengajuan
- tanggal
- KM
- bengkel
- jenis service
- keluhan
- estimasi
- biaya aktual
- DPP
- PPN
- total
- catatan
- status

Approval baseline:

- sampai Rp5.000.000: kewenangan Atasan Transport sesuai workflow;
- di atas Rp5.000.000: approval tingkat berikutnya sesuai aturan perusahaan;
- biaya aktual > estimasi dapat memicu approval tambahan.

Urutan approval yang sangat spesifik harus tetap mengikuti rule perusahaan terakhir.

Storage bukti bersifat privat.

---

# 8. Administrasi Sewa

Tab:

- Daftar Kendaraan Sewa
- Kontrak
- Pemilik
- Pembayaran
- Summary Rental
- Perbaikan

## Kendaraan Sewa

Identitas kendaraan berasal dari Master Kendaraan.

Nomor rangka tidak diperlukan di modul Administrasi Sewa.

## Kontrak

- kendaraan
- pemilik
- tanggal mulai
- tanggal selesai
- periode 6 bulan
- nilai sewa bulanan
- jatuh tempo
- status
- dokumen
- catatan

## Pembayaran

- periode 1–6
- bulan
- jatuh tempo
- tanggal bayar
- tagihan
- dibayar
- status
- metode
- referensi
- bukti
- catatan

## Summary Rental

Fokus billing:

- No
- Tahun
- Supplier
- Uraian
- Periode Tagihan
- Nilai Invoice
- Detail
- Edit
- Hapus

Urutan histori mengikuti `excel_row`.

---

# 9. Dokumen Kendaraan

Monitoring STNK/KIR/5 tahunan dibatasi untuk **ASET**.

Fitur:

- STNK
- KIR
- 5 Tahunan
- Pajak
- Upload file
- Foto STNK
- Detail
- Edit
- Hapus
- Filter jenis
- Filter tahun
- Filter bulan
- Filter status
- Countdown
- Reminder

Format monitoring:

- NO
- MERK
- TYPE
- NO.POLISI
- TAHUN
- No Rangka
- STNK
- FOTO STNK
- KIR
- 5 TAHUN
- PEMILIK

---

# 10. Laporan

Memakai filter periode.

Menampilkan ringkasan:

- kendaraan
- pengajuan
- service
- approval
- kontrak
- pembayaran
- dokumen
- repair
- potongan

Export laporan dibuat sebagai workbook periodik.

---

# 11. UI/UX Global

## Font

Semua modul memakai:

`Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`

## Tabel

Standar terbaru:

- isi tabel sekitar 13px;
- secondary text sekitar 11px;
- header sekitar 10px;
- line-height lebih lega;
- padding konsisten;
- horizontal scroll lokal pada tabel;
- halaman tidak ikut melebar.

## Aksi

Detail/Edit/Hapus/Kelola memakai gaya tombol yang konsisten.

## Mode bersih seperti Excel

Ada menu **Kolom**.

Pengguna dapat:

- menampilkan kolom;
- menyembunyikan kolom;
- menampilkan semua;
- memakai **Mode Excel**.

### Mode Excel

Secara cepat menyembunyikan:

- Penanda
- Aksi

Tujuannya agar tabel menjadi **full data, bersih, dan lebih mudah dibaca seperti Excel**.

Preferensi kolom disimpan per modul di localStorage.

---

# 12. Import Excel

Import harus:

1. membaca header;
2. mapping field;
3. validasi;
4. normalisasi;
5. deteksi duplikat;
6. simpan;
7. tampilkan baris valid;
8. tampilkan data baru;
9. tampilkan data update;
10. tampilkan skip/error;
11. menyediakan refresh data setelah import.

Master kendaraan menjadi sumber identitas utama untuk mencegah duplikasi.

---

# 13. Kontrak Export Excel

## Kendaraan

1. KENDARAAN
2. DRIVER / PIC

## Pengajuan

1. REKAPAN PERMINTAAN
2. PENGAJUAN SERVICE

## Service

1. DATA SERVICE
2. SERVICE
3. ITEM SERVICE
4. APPROVAL
5. BUKTI SERVICE
6. RIWAYAT BAN
7. RIWAYAT AKI
8. RIWAYAT KILOMETER
9. PATOKAN HARGA SERVICE

## Administrasi Sewa

1. DAFTAR SEWA
2. PEMILIK SEWA
3. KONTRAK SEWA
4. PEMBAYARAN SEWA
5. SUMMARY RENTAL
6. PERBAIKAN KENDARAAN SEWA
7. POTONGAN PEMBAYARAN SEWA

## Dokumen

1. STNK DAN KIR
2. DOKUMEN KENDARAAN

## Aturan Export

- Nomor urut konsisten.
- Histori rental mengikuti `excel_row`.
- Export STNK/KIR hanya memakai kendaraan ASET.
- Header harus jelas.
- Jangan ada typo seperti `No Ranka` atau `Jenis Pekerjan`.
- Jenis sewa menggunakan Sewa Perorangan / Sewa Perusahaan.

---

# 14. Snapshot Database QA

Snapshot pemeriksaan terakhir:

| Data | Jumlah |
|---|---:|
| Kendaraan | 75 |
| Pengajuan Service | 18 |
| Service | 18 |
| Item Service | 388 |
| Genset | 33 (7 ASET, 26 SEWA) |
| Dokumen | 86 (31 STNK, 31 5 tahunan, 24 pajak) |
| Histori Rental | 358 |
| Sewa Perorangan | 18 |
| Sewa Perusahaan | 26 |
| Rental invalid | 0 |
| Dokumen non-ASET | 0 |

Angka tersebut adalah snapshot QA, bukan angka statis sistem.

---

# 15. Security

Sudah diverifikasi:

- RLS/role guard;
- bucket privat;
- signed URL;
- guard penghapusan service;
- pengecekan relasi kendaraan;
- dokumen STNK/KIR/5 tahunan dibatasi ke ASET.

### Warning yang masih ada

Supabase Security Advisor masih menampilkan:

`auth_leaked_password_protection`

Status: disabled.

Ini perlu diaktifkan sebelum production final.

Warning fungsi `SECURITY DEFINER` sudah ditangani melalui migrasi `20261013031523_harden_service_history_rpc_schema`: implementasi berhak istimewa kini berada di schema internal `private`; nama/signature RPC publik dipertahankan dengan wrapper `SECURITY INVOKER`. Hak EXECUTE di fungsi publik hanya untuk `authenticated` dan `service_role`; `anon` dan `PUBLIC` ditolak. Uji simulasi RPC dengan role `authenticated` lulus dan ditutup dengan `ROLLBACK`. Security Advisor setelah migrasi tidak lagi menampilkan warning fungsi tersebut.

### Performance

Advisor menemukan index yang belum pernah digunakan dengan level **INFO**.

Jangan menghapus index massal tanpa analisis query.

---

# 16. Verifikasi Source

- Commit main saat audit terbaru: `860118f56db3cbc610277192b2954a639b454d62`.
- File migrasi `20261013023245_round_legacy_service_money_metadata.sql` cocok dengan versi yang sudah diterapkan di Supabase.
- Migrasi `20261013031523_harden_service_history_rpc_schema` tercatat di Supabase dan file sumber sudah masuk ke repository.
- `Verify Transport Build`, `Verify Transport System`, dan status Vercel lulus pada commit keamanan tersebut.
- `Production browser smoke test` lulus di halaman produksi pada viewport HP 375px dan desktop 1365px: kontrol form login, logo, toggle password, tidak ada error JavaScript/console yang terdeteksi, tidak ada request same-origin gagal, dan tidak ada overflow horizontal.
- Batas smoke test: hanya halaman login/root dan UI responsif; bukan tes login sungguhan, role setelah login, transaksi, upload, export, atau backup.
- Build/lint/CI bukan pengganti UAT transaksi dan role secara langsung.

---

# 17. Checklist Konsistensi

## UI

- [x] Font global sama
- [x] Font tabel diperbesar
- [x] Tombol aksi konsisten
- [x] Table spacing konsisten
- [x] Search/filter konsisten
- [x] Scroll tabel lokal
- [x] Penanda dapat hide/show
- [x] Kolom dapat hide/show
- [x] Mode Excel
- [x] Preference kolom tersimpan

## Kendaraan

- [x] Aset/Sewa
- [x] Sewa Perorangan/Sewa Perusahaan
- [x] Detail/Edit/Hapus
- [x] Search/Filter
- [x] Kelola Sewa

## Data Service

- [x] Ringkasan kendaraan
- [x] Jasa/sparepart
- [x] Total pengeluaran
- [x] KM/jarak
- [x] Service terakhir
- [x] Patokan harga
- [x] Pengajuan
- [x] Surat Pengantar
- [x] Detail/Edit/Hapus

## Service & Perbaikan

- [x] Service
- [x] Item
- [x] Bukti
- [x] Ban
- [x] Aki
- [x] KM
- [x] Approval
- [x] CRUD

## Rental

- [x] Daftar sewa
- [x] Pemilik
- [x] Kontrak
- [x] Pembayaran
- [x] Summary Rental
- [x] Repair
- [x] CRUD
- [x] Urutan Excel row

## Dokumen

- [x] STNK
- [x] KIR
- [x] 5 Tahunan
- [x] Pajak
- [x] Reminder
- [x] Countdown
- [x] Filter
- [x] Upload
- [x] Detail/Edit/Hapus
- [x] ASET-only monitoring

---

# 18. UAT Wajib Sebelum Release

### Auth/Role

- login aktif
- login nonaktif
- logout
- menu sesuai role

### Kendaraan

- tambah
- edit
- detail
- hapus tanpa relasi
- blokir hapus bila memiliki histori
- rental tanpa data teknis yang memang tidak tersedia

### Service

- pengajuan
- service <= Rp5 juta
- service > Rp5 juta
- aktual > estimasi
- approval
- item
- bukti
- ban
- aki
- KM
- selesai service

### Rental

- pemilik
- kontrak 6 bulan
- pembayaran
- terlambat
- repair
- potongan
- Summary Rental

### Dokumen

- STNK/KIR/5 tahunan ASET
- reminder
- pajak
- upload
- detail/edit/hapus

### Export/Import

- export setiap modul
- buka workbook hasil export
- cek sheet
- cek header
- cek urutan
- cek jumlah baris
- cek angka
- cek tanggal
- import test
- rekonsiliasi hasil import

### UI

- Mode Excel
- hide/show Penanda
- hide/show Aksi
- hide/show kolom data
- refresh mempertahankan preference
- desktop
- mobile 320/375/430px

---

# 19. Backup & Recovery

Sebelum perubahan besar:

1. backup database;
2. simpan Excel mentah;
3. commit Git;
4. update PRD;
5. catat hash commit;
6. run lint/build;
7. run UAT modul terdampak.

Rollback:

- kembali ke commit Git terakhir yang sudah terverifikasi;
- jangan memperbaiki UI dengan query database manual;
- perubahan schema/data harus terdokumentasi.

---

# 20. Backlog

## P0 — sebelum production

- pastikan deployment Vercel mengambil source `Sistem-Transport-ZT` terbaru;
- verifikasi environment production;
- UAT end-to-end di browser;
- aktifkan leaked password protection.

## P1

- isi Patokan Harga Admin hanya setelah harga disahkan dari invoice/sumber yang benar; UI mendukung pengelolaan, tetapi tabel patokan masih kosong;
- selesaikan audit ekspor setiap modul dengan workbook operasional yang kini tersedia;
- verifikasi sheet/header/urutan/jumlah baris/angka/tanggal melalui browser dan buka workbook hasil export.

Catatan: Patokan Admin aktif saat snapshot = **0**.

## P2

- versioning perubahan master;
- global search;
- E2E browser automation;
- preference column berbasis akun jika diperlukan.

---

# 21. Source of Truth

Urutan acuan:

1. Aturan bisnis terbaru yang disetujui Transport.
2. Database/schema aktif.
3. PRD ini.
4. UI/UX contract.
5. Excel untuk format operasional/import/export.
6. Source code.

Jangan mengubah rule bisnis hanya karena bentuk Excel lama berbeda.

---

# 22. Definition of Done

Release final harus memenuhi:

- [ ] Vercel benar-benar terhubung ke repo Transport
- [ ] Build PASS
- [ ] Lint PASS
- [ ] Security review PASS
- [ ] Database integrity PASS
- [ ] Import PASS
- [ ] Export PASS
- [ ] UAT semua modul PASS
- [ ] Role permission PASS
- [ ] Storage private PASS
- [ ] Mode Excel PASS
- [ ] UI consistency PASS
- [ ] Data hasil export cocok dengan workbook referensi
- [ ] Backup database tersedia
- [ ] PRD diperbarui dengan commit release

---

# 23. Perubahan Besar yang Sudah Dicatat

- Standardisasi font/tabel seluruh modul.
- Font tabel diperbesar agar lebih mudah dibaca.
- Detail/Edit/Hapus/Kelola diseragamkan.
- Penanda dapat disembunyikan.
- Column visibility ditambahkan.
- Mode Excel ditambahkan untuk menyembunyikan Penanda + Aksi.
- Preference kolom disimpan per modul.
- Summary Rental dinormalisasi.
- Histori rental export mengikuti `excel_row`.
- Export Dokumen/STNK-KIR dibatasi ke ASET.
- Header export diperbaiki menjadi `No Rangka` dan `Jenis Pekerjaan`.
- Jenis sewa runtime menjadi Sewa Perorangan/Sewa Perusahaan.
- PRD ini menjadi backup perubahan besar.

---

# 24. Status Audit Terbaru — 13 Oktober 2026

**Rilis aplikasi terbaru yang diverifikasi:** fitur Patokan Harga/Shopping List digabung melalui PR #36 pada commit aplikasi `4c59aa93f72050f576ee96be247a67fe98bbd2bb`. Vercel `SUCCESS`; `Verify Transport Build` dan `Verify Transport System` lulus. Regresi otomatis lulus **44/44 tes** (0 gagal), dengan build dan lint lulus.
**Production browser smoke test:** PASS pada halaman root/login produksi menggunakan viewport HP 375×812 dan desktop 1365×900. Logo, field login, tombol tampil/sembunyikan password, rendering, error JavaScript/console, same-origin request failures, dan overflow horizontal diperiksa. Test ini tidak mengirim kredensial sehingga tidak membuktikan login sungguhan, UAT role, transaksi, upload/export, atau backup.

**Snapshot database yang diverifikasi langsung:**
- 75 kendaraan: 31 ASET, 18 SEWA_PERORANGAN, 26 SEWA_PERUSAHAAN; 0 nomor polisi ganda setelah normalisasi.
- 18 pengajuan service; 18 transaksi service; 388 rincian Data Service dengan 388 nomor sumber unik dari 1–388.
- 33 genset: 7 ASET dan 26 SEWA.
- 358 baris Summary Rental; total invoice Rp3.285.788.572,00 sama dengan Grand Total sumber.
- 86 dokumen: 31 STNK, 31 5 tahunan, 24 pajak. Tidak ditemukan dokumen terhubung ke kendaraan SEWA atau foreign key dokumen tanpa kendaraan.
- 22 dari 22 tabel `public` mengaktifkan RLS; seluruh 32 foreign key pada schema `public` tervalidasi.
- Tabel Patokan Harga Service masih memiliki 0 baris. Perubahan Patokan Harga/Shopping List pada PR #36 menambahkan agregasi histori, filter kategori, tampilan min/median/rata-rata/maksimum dan CRUD patokan dengan role ADMIN/TRANSPORT; ATASAN_TRANSPORT/DIREKTUR/AKUNTANSI hanya lihat. Tidak ada harga patokan yang di-seed otomatis.
- Database produksi saat dicek memiliki 1 akun Auth dan 1 profile aktif, keduanya ADMIN. UAT nyata kelima role lainnya belum mungkin dilakukan sampai akun resmi dibuat/diundang.
- Seluruh 86 record dokumen kendaraan memiliki `file_path` kosong. Workbook menyediakan metadata/tanggal, bukan lampiran fisik; jika operasional membutuhkan file STNK/5 tahunan/pajak di sistem, file asli perlu diunggah dan alur upload/akses privat diuji.
- Organisasi Supabase terdeteksi di Free plan; leaked-password protection bawaan memerlukan Pro atau lebih tinggi. Warning Auth harus ditutup setelah pemilik memutuskan upgrade dan mengaktifkannya di Supabase Auth.

**Anomali dan batasan yang masih harus dikelola:**
- Summary Rental pada Excel row 346 memiliki kolom No berisi teks `341+A346:F349`, bukan nomor urut. Nilai invoice dan baris sumber dipertahankan agar dapat ditelusuri.
- Nomor mesin/rangka masih konflik pada enam pasangan kendaraan (12 record): BM 1533 OA/VP; BM 1713 OX/9084 TS; BM 1694 OK/1827 JD; BM 8005 LN/9383 TI; BM 8263 TI/9764 TO; BM 9763 TO/9808 TO. BM 9672 TZ juga memiliki dua identitas berbeda di baris sumber. Dokumen fisik harus menjadi dasar perubahan.
- BM 8238 TM dan BM 8003 LN mempunyai perbedaan sumber kepemilikan ASET/SEWA; BM 8241 TM juga belum selesai dicocokkan statusnya. Dokumen di modul ASET tidak dibuat untuk record yang masih SEWA.
- Service sumber 327 dan 328 mempunyai Total yang tidak konsisten dengan DPP + PPn. Header transaksi tetap konsisten pada rumus DPP + PPn, tetapi nilai sumber belum dikoreksi tanpa invoice/workbook yang disahkan.
- Tanggal 5 tahunan BM 9084 TS dan BM 9085 TS memakai tanggal 16 April 2031 dari FPD September, sedangkan workbook Mei menyimpan serial tanggal lama 11429 (16 April 1931). Sistem memakai 16 April 2031 dan mencatat anomali; verifikasi fisik tetap direkomendasikan.
- Supabase Security Advisor sekarang hanya menampilkan warning `auth_leaked_password_protection` (disabled); warning fungsi SECURITY DEFINER publik selesai setelah migrasi RPC.
- UAT login/logout, keenam role, transaksi Service/approval, upload dan akses file privat, import/export semua modul, tampilan setelah login, dan backup/recovery belum dites menyeluruh.

**Kesimpulan rilis:** integritas database dan pemeriksaan otomatis lulus pada area yang telah diuji, tetapi production-final menunggu UAT end-to-end dengan akun resmi seluruh role, upload lampiran yang diperlukan, pengaturan leaked-password protection (upgrade Pro+ diperlukan pada project Free), audit ekspor tiap modul, bukti fisik untuk konflik identitas, pengisian harga patokan yang disahkan, dan konfirmasi backup/recovery.

---

## Riwayat PRD

| Versi | Tanggal | Keterangan |
|---|---|---|
| 1.0 | 29-09-2026 | Backup perubahan besar sistem, UI/UX, CRUD, service, rental, dokumen, import/export, security, QA/UAT, backup, dan backlog |
| 1.1 | 13-10-2026 | Audit database dan workbook operasional; update snapshot, anomali sumber, migrasi, warning keamanan, serta status UAT |
| 1.2 | 13-10-2026 | Status deployment/browser smoke terbaru, hardening RPC Service ke private schema, warning keamanan tersisa, dan blocker release diperbarui |
| 1.3 | 13-10-2026 | Patokan Harga/Shopping List ditambahkan ke Service & Perbaikan; status akun role, file dokumen kosong, dan batas plan Auth dicatat |
| 1.4 | 13-10-2026 | Commit fitur Shopping List yang benar-benar rilis, 44/44 tes regresi, build/lint dan production smoke login dicatat; UAT transaksi tetap pending |
