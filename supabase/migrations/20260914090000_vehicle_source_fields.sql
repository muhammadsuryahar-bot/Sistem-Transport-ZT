-- Preserve the operational vehicle columns that exist in the PT Zaman Teknindo workbook.
-- Source workbook: Data Kendaraan 07 Mei 2026 / LIST KENDARAAN.
alter table if exists public.kendaraan
  add column if not exists unit_kerja text,
  add column if not exists masa_berlaku_pajak date,
  add column if not exists status_pajak text,
  add column if not exists catatan_hutang text;

create index if not exists idx_kendaraan_unit_kerja on public.kendaraan(unit_kerja);
create index if not exists idx_kendaraan_masa_pajak on public.kendaraan(masa_berlaku_pajak);
