# Final Verification Checklist — Sistem Transport PT Zaman Teknindo

Dokumen ini menjadi checklist pengujian manual sebelum sistem Transport dipakai untuk operasional kantor.

## 1. Login & session

- [ ] Login dengan email + password yang benar.
- [ ] Login gagal menampilkan pesan umum dan tidak membocorkan detail autentikasi.
- [ ] Opsi ingat email hanya menyimpan email, bukan password.
- [ ] Akun nonaktif tidak dapat masuk.
- [ ] Logout menghapus session aplikasi.
- [ ] Refresh halaman setelah login tetap mempertahankan session yang valid.

## 2. Role & authorization

| Role | Dashboard | Kendaraan | Pengajuan | Service | Sewa | Dokumen | Laporan | Pengguna |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| ADMIN | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| TRANSPORT | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | - |
| OPERASIONAL | ✓ | - | ✓ | - | - | - | - | - |
| ATASAN_TRANSPORT | ✓ | - | ✓ | ✓ | - | - | ✓ | - |
| DIREKTUR | ✓ | - | - | ✓ | - | - | ✓ | - |
| AKUNTANSI | ✓ | - | - | - | ✓ | - | ✓ | - |

- [ ] Menu yang tidak berwenang tidak tampil.
- [ ] Aksi yang tidak berwenang tetap ditolak oleh database/RLS.
- [ ] ADMIN tidak dapat mengunci akun sendiri secara tidak sengaja.

## 3. Master kendaraan & driver

### Kendaraan

- [ ] Tambah kendaraan aset kantor.
- [ ] Tambah kendaraan sewa perorangan.
- [ ] Tambah kendaraan sewa rental.
- [ ] Kepemilikan `SEWA` wajib memiliki jenis sewa.
- [ ] Mengubah kepemilikan menjadi `ASET_KANTOR` membersihkan jenis sewa.
- [ ] Edit seluruh identitas kendaraan bekerja.
- [ ] Filter status dan kepemilikan bekerja.
- [ ] Pencarian plat/kode/merk/driver/lokasi bekerja.
- [ ] KM tidak dapat dimundurkan.

### Driver

- [ ] Tambah driver.
- [ ] Edit driver.
- [ ] Driver yang masih dipakai kendaraan tidak dapat dihapus.
- [ ] Driver dapat dinonaktifkan tanpa menghapus histori kendaraan.

## 4. Permintaan service

Alur wajib:

`OPERASIONAL → PERMINTAAN SERVICE → TRANSPORT`

- [ ] Operasional dapat memilih kendaraan.
- [ ] Data kendaraan terisi otomatis.
- [ ] KM terakhir terisi otomatis.
- [ ] Keluhan dan jenis permintaan tersimpan.
- [ ] Pengajuan muncul di antrean Transport.
- [ ] Pemohon dapat melihat pengajuannya sendiri.
- [ ] Pengajuan tidak bisa diubah secara ilegal oleh role lain.
- [ ] Pengajuan yang sudah memiliki service tidak dapat dibuatkan service kedua.

## 5. Service & approval

Alur wajib:

`TRANSPORT → APPROVAL → SERVICE → BUKTI → SELESAI`

### Batas approval

- [ ] Estimasi sampai Rp5.000.000 membutuhkan Atasan Transport.
- [ ] Estimasi di atas Rp5.000.000 membutuhkan Direktur.
- [ ] Biaya aktual yang melampaui nilai yang sudah disetujui meminta approval tambahan.
- [ ] Service tidak dapat diselesaikan ketika approval wajib belum lengkap.
- [ ] Service tidak dapat diselesaikan tanpa minimal satu bukti service.
- [ ] Penolakan approval mengubah status service secara konsisten.
- [ ] Status service dan pengajuan tetap sinkron.

### Data service

- [ ] Nomor service unik dan terbentuk otomatis.
- [ ] Kendaraan service harus sama dengan kendaraan pada pengajuan.
- [ ] Estimasi tidak boleh negatif.
- [ ] Biaya aktual tidak boleh negatif.
- [ ] Item service menyimpan jumlah, harga satuan, dan subtotal.
- [ ] Bukti service dapat diunggah ke bucket private.
- [ ] File bukti yang diunggah tidak dapat dibuka oleh user tanpa hak akses.

## 6. Ban, aki/baterai, dan kilometer

### Ban

- [ ] Sebelum mengganti ban, foto kondisi sebelum wajib tersedia.
- [ ] Jumlah, posisi, merek, ukuran, alasan, dan biaya tersimpan.
- [ ] Bukti/foto sesudah dapat ditambahkan kemudian.

### Aki/baterai

- [ ] Foto kondisi sebelum wajib tersedia.
- [ ] Merek, tipe, nomor aki, alasan, dan biaya tersimpan.
- [ ] Bukti/foto sesudah dapat ditambahkan kemudian.

### Kilometer

- [ ] KM baru harus >= KM terakhir kendaraan.
- [ ] Riwayat KM tersimpan.
- [ ] KM kendaraan diperbarui setelah pencatatan yang valid.
- [ ] Penyelesaian service tidak boleh menurunkan KM kendaraan.

## 7. Kendaraan sewa

- [ ] Pemilik perorangan dapat dicatat.
- [ ] Pemilik perusahaan/rental dapat dicatat.
- [ ] Kontrak sewa dibuat tepat 6 bulan.
- [ ] Kontrak aktif ganda untuk kendaraan yang sama ditolak.
- [ ] Pembayaran periode hanya 1–6.
- [ ] Nilai pembayaran tidak boleh negatif.
- [ ] Status pembayaran dapat mencerminkan belum bayar/terlambat/lunas sesuai data aktual.
- [ ] Bukti pembayaran masuk bucket `dokumen-sewa` private.

### Perbaikan rental

- [ ] Perbaikan terkait kontrak dan kendaraan rental yang sama.
- [ ] Foto kerusakan dapat disimpan.
- [ ] Kantor dapat ditandai membayar terlebih dahulu.
- [ ] Perbaikan yang eligible dapat ditandai untuk dipotong.
- [ ] Potongan hanya diterapkan pada pembayaran kontrak yang sama.
- [ ] Total potongan tidak boleh melebihi nilai yang diperbolehkan.

## 8. Dokumen

- [ ] Tambah dokumen kendaraan.
- [ ] Edit metadata dokumen.
- [ ] Ganti file dokumen.
- [ ] Hapus dokumen sesuai hak akses.
- [ ] File dibuka melalui signed URL.
- [ ] Dokumen expired ditandai.
- [ ] Dokumen yang jatuh tempo <=30 hari terlihat pada laporan/peringatan.

## 9. Laporan

- [ ] Total kendaraan konsisten dengan master kendaraan.
- [ ] Kendaraan aktif konsisten dengan status kendaraan.
- [ ] Kendaraan sedang service konsisten dengan status kendaraan.
- [ ] Pengajuan menunggu konsisten dengan data workflow.
- [ ] Total biaya service sesuai data service.
- [ ] Rekap pembayaran rental sesuai tabel pembayaran.
- [ ] Potongan rental tidak terhitung ganda.
- [ ] Dokumen expired/akan expired terdeteksi.
- [ ] Service selesai terbaru tampil benar.
- [ ] Pembayaran rental bermasalah/overdue dapat ditemukan.

## 10. Negative test wajib

Setiap skenario berikut harus menghasilkan penolakan yang aman, bukan data setengah tersimpan:

- [ ] Submit form dua kali dengan cepat.
- [ ] Upload file lalu insert metadata gagal.
- [ ] Submit service dengan kendaraan yang tidak sama dengan pengajuan.
- [ ] Submit service >Rp5 juta tanpa approval.
- [ ] Selesaikan service tanpa bukti.
- [ ] Ubah KM ke nilai lebih kecil.
- [ ] Tambahkan pembayaran rental di luar periode 1–6.
- [ ] Tambahkan potongan melebihi nilai eligible.
- [ ] Hubungkan perbaikan rental ke kendaraan yang bukan bagian kontrak.
- [ ] User mencoba membuka file private tanpa izin.

## 11. Responsive UI

- [ ] Login nyaman digunakan pada layar HP.
- [ ] Sidebar dapat dibuka/tutup pada HP.
- [ ] Tidak ada horizontal overflow pada halaman utama.
- [ ] Modal dapat discroll pada HP.
- [ ] Tabel tetap dapat digunakan pada layar kecil.
- [ ] Tombol aksi tidak terlalu kecil untuk disentuh.
- [ ] Empty/loading/error state terbaca jelas.

## 12. Production readiness

- [ ] `VITE_SUPABASE_URL` menunjuk ke project Transport.
- [ ] `VITE_SUPABASE_PUBLISHABLE_KEY` menunjuk ke project Transport.
- [ ] Tidak ada service-role key di frontend.
- [ ] Bucket storage sesuai nama yang digunakan aplikasi.
- [ ] Seluruh migration diterapkan pada Supabase production sesuai urutan repository.
- [ ] Vercel build berhasil.
- [ ] Login, database read/write, storage upload, signed URL, dan role access telah diuji pada production.

## Kriteria selesai

Sistem dianggap siap untuk uji kantor setelah semua checklist kritis pada bagian 1–10 lulus, tidak ada error console yang berulang, dan tidak ada data yang tersimpan setengah ketika sebuah transaksi gagal di tengah proses.
