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

### Permintaan Service
Bagian Operasional membuat permintaan dengan memilih kendaraan. Data kendaraan dan KM terakhir terisi otomatis. Pengajuan masuk ke antrean Transport.

Alur utama:
`Operasional → Permintaan Service → Transport → Approval → Service → Bukti → Selesai`

### Service & Perbaikan
Mencatat pekerjaan service, estimasi dan aktual biaya, approval, item service, bukti, penggantian ban, penggantian aki/baterai, serta riwayat kilometer.

Aturan approval:
- sampai dengan Rp5.000.000: Atasan Transport
- di atas Rp5.000.000: Direktur
- bila biaya aktual melampaui nilai yang sudah disetujui, service harus masuk kembali ke tahap approval sebelum dapat diselesaikan.

Status service dan status pengajuan dijaga tetap sinkron oleh database, termasuk saat approval, penolakan, pembatalan, dan penyelesaian. Saat service selesai, KM kendaraan tidak boleh mundur.

### Kendaraan Sewa
Mencatat pemilik perorangan/perusahaan, kontrak 6 bulan, pembayaran bulanan, perbaikan kendaraan sewa, bukti pembayaran, dokumentasi kerusakan/perbaikan, dan potongan biaya perbaikan dari pembayaran rental.

Perbaikan rental wajib terhubung ke kontrak dan kendaraan rental yang sama agar potongan pembayaran tidak salah sasaran.

Alur perbaikan rental:
`Kerusakan → Perbaikan → Kantor Membayar → Ditandai Dapat Dipotong → Potongan Diterapkan ke Pembayaran Rental`

### Dokumen
Menyimpan dokumen kendaraan dan masa berlaku. Bucket penyimpanan bersifat private dan file dibuka melalui signed URL.

### Laporan
Ringkasan armada, service, biaya, pembayaran sewa, potongan, dokumen expired/akan expired, dan transaksi yang perlu diperhatikan.

### Pengguna
ADMIN dapat mengatur role dan status akun. Sesi admin aktif dilindungi dari perubahan yang dapat mengunci dirinya sendiri.

## Role

| Role | Fungsi utama |
|---|---|
| ADMIN | Seluruh administrasi dan kontrol sistem |
| TRANSPORT | Armada, permintaan, service, sewa, dokumen, laporan |
| OPERASIONAL | Membuat dan memantau permintaan service |
| ATASAN_TRANSPORT | Approval service sesuai kewenangan |
| DIREKTUR | Approval service di atas Rp5.000.000 dan monitoring |
| AKUNTANSI | Pembayaran dan administrasi rental serta laporan |

## Supabase

Migration SQL berada di `supabase/migrations/`. Karena environment lokal dapat berjalan tanpa Docker, migration dapat diterapkan melalui **Supabase SQL Editor** secara berurutan.

Migration workflow dan integrity yang saat ini disiapkan:

1. `20260903000000_transport_workflow_rls.sql`
2. `20260903150000_vehicle_driver_rls.sql`
3. `20260903162000_permintaan_service_rls.sql`
4. `20260907000000_transport_storage_security.sql`
5. `20260907010000_transport_business_constraints.sql`
6. `20260907030000_transport_workflow_hardening.sql`
7. `20260907040000_transport_approval_permissions.sql`
8. `20260907050000_transport_data_integrity.sql`
9. `20260907060000_transport_kilometer_guard.sql`
10. `20260907070000_transport_service_insert_guard.sql`
11. `20260907120000_transport_integrity_guardrails.sql`
12. `20260907130000_profiles_admin_security.sql`
13. `20260907130000_transport_rental_integrity.sql`
14. `20260907130000_transport_unique_master.sql`
15. `20260907140000_transport_request_transition_guard.sql`
16. `20260907140000_transport_workflow_consistency.sql`
17. `20260907140000_transport_workflow_sync.sql`
18. `20260907141000_transport_request_transition_adjustment.sql`
19. `20260907150000_transport_request_completion_guard.sql`
20. `20260907151000_transport_request_completion_trigger_safe.sql`

Sistem menggunakan bucket private:

- `kendaraan`
- `service-bukti`
- `dokumen-kendaraan`
- `dokumen-sewa`

## Environment Frontend

Buat `frontend/.env.local`:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

Jangan masukkan service-role key ke frontend atau commit ke Git.

## Menjalankan lokal

```bash
git pull --ff-only origin main
npm ci
npm run lint
npm run build
npm run dev
```

## Deployment

Vercel diarahkan ke repository ini. Environment variable production harus menggunakan URL dan publishable key Supabase untuk project Transport, bukan project attendance.

## Verifikasi otomatis

GitHub Actions menjalankan lint, build, dan pemeriksaan file migration pada push/PR ke `main` melalui `.github/workflows/verify.yml`.
