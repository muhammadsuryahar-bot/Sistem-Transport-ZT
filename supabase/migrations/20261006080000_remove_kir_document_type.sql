-- KIR no longer belongs in the transport document module.
-- Existing KIR rows are removed and the document type constraint prevents them from returning.

delete from public.dokumen_kendaraan
where jenis_dokumen = 'KIR';

alter table public.dokumen_kendaraan
drop constraint if exists dokumen_kendaraan_jenis_dokumen_check;

alter table public.dokumen_kendaraan
add constraint dokumen_kendaraan_jenis_dokumen_check
check (
  jenis_dokumen = any (
    array[
      'STNK'::text,
      'PAJAK'::text,
      '5_TAHUNAN'::text,
      'LAINNYA'::text
    ]
  )
);