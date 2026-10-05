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

**Batas verifikasi:** workbook mentah operasional yang berisi seluruh baris data lama tidak ditemukan sebagai file yang dapat dibaca langsung saat PRD ini dibuat. Karena itu tidak boleh diklaim ada kecocokan cell-per-cell terhadap workbook mentah tersebut. Struktur, field, aturan, mapping export, dan database aktif sudah diaudit dari sumber yang tersedia.

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

- Item
- Kategori
- Satuan
- Transaksi
- Harga terendah
- Harga tertinggi
- Median
- Patokan Admin
- Selisih rata-rata
- Keterangan
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
| Kendaraan | 74 |
| Pengajuan Service | 18 |
| Service | 18 |
| Item Service | 388 |
| Dokumen | 62 |
| Histori Rental | 358 |
| Sewa Perorangan | 17 |
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

### Performance

Advisor menemukan index yang belum pernah digunakan dengan level **INFO**.

Jangan menghapus index massal tanpa analisis query.

---

# 16. Verifikasi Source

Workflow terbaru yang telah berhasil:

- Verify Transport Build — SUCCESS
- Verify Transport System — SUCCESS
- npm lint — SUCCESS
- npm build — SUCCESS

Build/lint bukan pengganti UAT browser.

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

- isi Patokan Harga Admin;
- audit export dengan workbook operasional mentah asli;
- verifikasi seluruh sheet dan jumlah baris.

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

# 24. Status Saat Dokumen Dibuat

**Code:** build/lint/verification terakhir PASS.

**Database:** integrity check terakhir PASS.

**UI:** standardisasi global sudah diterapkan.

**Export:** beberapa mismatch yang ditemukan saat audit sudah diperbaiki.

**Exact raw Excel:** belum bisa diklaim cell-per-cell karena workbook mentah operasional asli belum tersedia dalam file yang dapat diverifikasi.

**Vercel:** belum terhubung ke repo Transport yang benar.

**Production final:** belum dinyatakan release sampai deployment + UAT + audit Excel selesai.

---

## Riwayat PRD

| Versi | Tanggal | Keterangan |
|---|---|---|
| 1.0 | 29-09-2026 | Backup perubahan besar sistem, UI/UX, CRUD, service, rental, dokumen, import/export, security, QA/UAT, backup, dan backlog |
