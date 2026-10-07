-- Backfill only rental-history rows with a provable current-vehicle mapping.
-- Generic supplier invoices and rental genset rows remain in rental_historis_excel.

alter table public.pembayaran_sewa
  alter column tanggal_jatuh_tempo drop not null;

alter table public.pembayaran_sewa
  drop constraint if exists pembayaran_sewa_status_check;

alter table public.pembayaran_sewa
  add constraint pembayaran_sewa_status_check
  check (
    status = any (array[
      'BELUM_DIBAYAR'::text,
      'SEBAGIAN_DIBAYAR'::text,
      'SUDAH_DIBAYAR'::text,
      'TERLAMBAT'::text,
      'DIBATALKAN'::text,
      'DATA_HISTORIS'::text
    ])
  );

insert into public.pemilik_sewa (jenis_pemilik,nama_pemilik,nama_perusahaan,keterangan,aktif)
select distinct
  case when upper(trim(k.pemilik)) like 'PT %' then 'PERUSAHAAN_RENTAL' else 'PERORANGAN' end,
  trim(k.pemilik),
  case when upper(trim(k.pemilik)) like 'PT %' then trim(k.pemilik) else null end,
  'Disinkronkan dari Master Kendaraan Sewa. Kontak/rekening hanya diisi bila tersedia pada sumber.',
  true
from public.kendaraan k
where k.kepemilikan='SEWA'
  and nullif(trim(k.pemilik),'') is not null
  and not exists (
    select 1 from public.pemilik_sewa p
    where lower(trim(p.nama_pemilik))=lower(trim(k.pemilik))
  );

with contract_seed(kontrak,plate,owner_name,start_date,monthly_value) as (
  values
  ('HIST-HARIADI-2022-01','BM 8238 TM','Bpk. Hariadi JS','2022-01-01'::date,3283000),
  ('HIST-HARIADI-2022-07','BM 8238 TM','Bpk. Hariadi JS','2022-07-01'::date,3136000),
  ('HIST-HARIADI-2023-01','BM 8238 TM','Bpk. Hariadi JS','2023-01-01'::date,3136000),
  ('HIST-HARIADI-2023-07','BM 8238 TM','Bpk. Hariadi JS','2023-07-01'::date,3136000),
  ('HIST-HARIADI-2024-01','BM 8238 TM','Bpk. Hariadi JS','2024-01-01'::date,3136000),
  ('HIST-HARIADI-2024-07','BM 8238 TM','Bpk. Hariadi JS','2024-07-01'::date,3136000),
  ('HIST-HARIADI-2025-01','BM 8238 TM','Bpk. Hariadi JS','2025-01-01'::date,2940000),
  ('HIST-HARIADI-2025-07','BM 8238 TM','Bpk. Hariadi JS','2025-07-01'::date,2940000),
  ('HIST-SETIYO-2025-04','BM 1377 OY','Bpk. Setiyo Widodo','2025-04-01'::date,3430000)
),
pt_gorent(plate) as (
  values ('B 2026 UKL'),('BM 1081 OR'),('B 2033 UKL'),
         ('B 2635 UKL'),('BM 1694 OK'),('BM 1692 OK')
),
pt_segments(kontrak,plate,start_date) as (
  select 'HIST-GORENT-2025-06-'||replace(replace(plate,' ',''),'-',''),plate,'2025-06-01'::date from pt_gorent
  union all
  select 'HIST-GORENT-2025-12-'||replace(replace(plate,' ',''),'-',''),plate,'2025-12-01'::date from pt_gorent
),
all_contracts as (
  select * from contract_seed
  union all
  select kontrak,plate,'PT Gorent',start_date,4469000 from pt_segments
)
insert into public.kontrak_sewa
(nomor_kontrak,kendaraan_id,pemilik_sewa_id,tanggal_mulai,tanggal_selesai,periode_bulan,
 nilai_sewa_bulanan,tanggal_jatuh_tempo_bulanan,status,catatan)
select
  c.kontrak,k.id,p.id,c.start_date,
  (c.start_date+interval '6 months'-interval '1 day')::date,
  6,c.monthly_value,null,'SELESAI',
  'Kontrak historis diturunkan dari Summary Rental Excel hanya untuk transaksi dengan pemetaan kendaraan yang dapat dibuktikan. Bukan dokumen kontrak fisik.'
from all_contracts c
join public.kendaraan k
  on upper(trim(k.nomor_polisi))=upper(trim(c.plate))
 and k.kepemilikan='SEWA'
join public.pemilik_sewa p
  on lower(trim(p.nama_pemilik))=lower(trim(c.owner_name))
where not exists (
  select 1 from public.kontrak_sewa old where old.nomor_kontrak=c.kontrak
);

with month_map(nama_bulan,nomor_bulan) as (
  values ('Januari',1),('Februari',2),('Maret',3),('April',4),('Mei',5),('Juni',6),
         ('Juli',7),('Agustus',8),('September',9),('Oktober',10),('November',11),('Desember',12)
),
source_rows as (
  select r.excel_row,r.supplier,r.uraian,r.nilai_invoice,
         make_date(r.tahun,m.nomor_bulan,1) billing_month,
         case
           when r.supplier='PAK HARIADI JAYA' and r.uraian='Rental Mobil' then 'BM 8238 TM'
           when r.supplier='Setiyo Widodo' and r.uraian='Rental Mobil' then 'BM 1377 OY'
           when r.supplier='PT GO RENTAL' and r.uraian='Rental Mobil (1 Unit - B 2026 UKL)' then 'B 2026 UKL'
           when r.supplier='PT GO RENTAL' and r.uraian='Rental Mobil (1 Unit - BM 1081 OR)' then 'BM 1081 OR'
           when r.supplier='PT GO RENTAL' and r.uraian='Rental Mobil (2 Unit - B 2033 UKL & B 2635 UKL)' then 'B 2033 UKL|B 2635 UKL'
           when r.supplier='PT GO RENTAL' and r.uraian='Rental Mobil (2 Unit - BM 1694 OK & BM 1692 OK)' then 'BM 1694 OK|BM 1692 OK'
           else null
         end target_plates
  from public.rental_historis_excel r
  join month_map m on lower(trim(r.periode_tagihan))=lower(m.nama_bulan)
),
expanded_rows as (
  select sr.excel_row,sr.billing_month,
         trim(s.plate) plate,
         case when sr.target_plates like '%|%' then sr.nilai_invoice/2 else sr.nilai_invoice end bill_value
  from source_rows sr
  cross join lateral regexp_split_to_table(sr.target_plates,'\|') as s(plate)
  where sr.target_plates is not null
),
mapped as (
  select e.*,c.id contract_id,
         extract(year from age(e.billing_month,c.tanggal_mulai))::int*12
         + extract(month from age(e.billing_month,c.tanggal_mulai))::int + 1 as periode_ke
  from expanded_rows e
  join public.kendaraan k on upper(trim(k.nomor_polisi))=upper(trim(e.plate))
  join public.kontrak_sewa c
    on c.kendaraan_id=k.id
   and c.status='SELESAI'
   and e.billing_month between c.tanggal_mulai and c.tanggal_selesai
)
insert into public.pembayaran_sewa
(kontrak_sewa_id,periode_ke,bulan_pembayaran,tanggal_jatuh_tempo,tanggal_pembayaran,
 jumlah_tagihan,jumlah_dibayar,status,metode_pembayaran,nomor_referensi,catatan)
select
  m.contract_id,m.periode_ke,m.billing_month,null,null,m.bill_value,0,'DATA_HISTORIS',
  null,
  'HIST-EXCEL-'||m.excel_row||'-'||regexp_replace(m.plate,'[^A-Za-z0-9]+','','g'),
  'Sumber Summary Rental Excel baris '||m.excel_row||
  '. Nilai invoice dipindahkan sebagai tagihan historis. Status pembayaran dan tanggal jatuh tempo tidak tersedia pada sumber.'
from mapped m
where m.periode_ke between 1 and 6
  and not exists (
    select 1 from public.pembayaran_sewa p
    where p.kontrak_sewa_id=m.contract_id and p.periode_ke=m.periode_ke
  );

create index if not exists idx_pembayaran_sewa_historical_status
on public.pembayaran_sewa(status,bulan_pembayaran)
where status='DATA_HISTORIS';
