# Sistem Transport PT Zaman Teknindo

Sistem internal untuk pengelolaan armada, permintaan service, maintenance, kendaraan sewa, dokumen, laporan, dan pengguna.

## Arsitektur

- Frontend: React + Vite + JavaScript
- Database/Auth/Storage: Supabase
- Hosting frontend: Vercel
- API production: Supabase client + Row Level Security
- Repository: `muhammadsuryahar-bot/Sistem-Transport-ZT`

## Modul

### Dashboard
Monitoring jumlah kendaraan, kendaraan aktif, kendaraan yang sedang service, dan pengajuan yang masih berjalan.

### Kendaraan
Master armada dan driver. Kepemilikan hanya `ASET_KANTOR` atau `SEWA`. Kendaraan sewa memakai `SEWA_PERORANGAN` atau `SEWA_RENTAL` dan menyimpan identitas pemilik.

### Import Excel
Import kendaraan memakai struktur aktual `Data Kendaraan 07 Mei 2026`, termasuk Merk, Type, Jenis, Tahun, No. Pol, No. Mesin, No. Rangka, Pemilik, Status/Kepemilikan, Masa Berlaku Pajak, Status Pajak, Unit Kerja, Driver, Lokasi Kerja, Keterangan, dan Catatan Hutang. Import menggunakan konteks halaman dan memilih data yang sesuai secara otomatis.