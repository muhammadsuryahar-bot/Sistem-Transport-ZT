# Vehicle import source columns

Primary workbook `Data Kendaraan 07 Mei 2026` / sheet `Data Kendaraan` columns:
- No
- Merk
- Type
- Jenis
- Tahun
- No. Pol
- No. Mesin
- No. Rangka
- Pemilik
- Status (Aset/Sewa = ownership)
- Masa Berlaku Pajak
- Status Pajak
- Unit Kerja
- Driver
- Lokasi Kerja
- Keterangan
- Catatan Hutang

The importer preserves these fields without asking the user to choose a sheet. `No` is treated as source numbering only; it is not stored as the vehicle primary identifier.
