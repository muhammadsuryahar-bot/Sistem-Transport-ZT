-- Remove the retired KIR runtime path without breaking existing STNK/5-tahunan metadata.
-- Existing metadata is renamed so the monitoring page still recognizes previously
-- imported documents.

update public.dokumen_kendaraan
set keterangan = replace(keterangan, 'STNK_DAN_KIR', 'STNK_DAN_5_TAHUNAN')
where keterangan like '%STNK_DAN_KIR%';

create or replace function public.import_transport_documents(p_rows jsonb, p_sheet_name text)
returns jsonb
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  r jsonb;
  v_vehicle public.kendaraan%rowtype;
  v_plate text;
  v_due date;
  v_type text;
  v_inserted integer := 0;
  v_skipped integer := 0;
  v_unknown integer := 0;
  v_tax_updated integer := 0;
  v_meta text;
begin
  if auth.uid() is null then
    raise exception 'Sesi login tidak valid.';
  end if;

  if not public.has_any_role(array['ADMIN'::public.user_role,'TRANSPORT'::public.user_role]) then
    raise exception 'Role tidak memiliki izin import Dokumen Kendaraan.';
  end if;

  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Tidak ada data dokumen untuk diimport.';
  end if;

  for r in select value from jsonb_array_elements(p_rows)
  loop
    v_plate := upper(trim(coalesce(r->>'nomor_polisi','')));
    if v_plate = '' then
      continue;
    end if;

    select *
      into v_vehicle
      from public.kendaraan
     where upper(nomor_polisi) = v_plate
     for update;

    if v_vehicle.id is null then
      v_unknown := v_unknown + 1;
      continue;
    end if;

    v_meta := 'EXCEL_META:' ||
      jsonb_build_object(
        'source','STNK_DAN_5_TAHUNAN',
        'source_no',nullif(r->>'source_no',''),
        'nomor_polisi',v_plate,
        'merk',nullif(r->>'merk',''),
        'type',nullif(r->>'tipe',''),
        'tahun',nullif(r->>'tahun',''),
        'nomor_rangka',nullif(r->>'nomor_rangka',''),
        'pemilik',nullif(r->>'pemilik','')
      )::text ||
      ' | Import Excel: ' || coalesce(nullif(p_sheet_name,''),'STNK_DAN_5_TAHUNAN');

    for v_type,v_due in
      select 'STNK', nullif(r->>'stnk','')::date
      union all
      select '5_TAHUNAN', nullif(r->>'lima_tahun','')::date
    loop
      if v_due is null then
        continue;
      end if;

      if exists(
        select 1
          from public.dokumen_kendaraan d
         where d.kendaraan_id = v_vehicle.id
           and d.jenis_dokumen = v_type
           and d.tanggal_jatuh_tempo = v_due
      ) then
        v_skipped := v_skipped + 1;
      else
        insert into public.dokumen_kendaraan(
          kendaraan_id,jenis_dokumen,nomor_dokumen,tanggal_jatuh_tempo,keterangan
        )
        values(
          v_vehicle.id,
          v_type,
          nullif(trim(coalesce(r->>'nomor_dokumen','')),''),
          v_due,
          v_meta
        );

        v_inserted := v_inserted + 1;
      end if;
    end loop;

    if nullif(r->>'stnk','') is not null
       and (
         v_vehicle.masa_berlaku_pajak is null
         or (r->>'stnk')::date > v_vehicle.masa_berlaku_pajak
       )
    then
      update public.kendaraan
         set masa_berlaku_pajak = (r->>'stnk')::date,
             updated_at = now()
       where id = v_vehicle.id;

      v_tax_updated := v_tax_updated + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'inserted',v_inserted,
    'skipped',v_skipped,
    'unknownCount',v_unknown,
    'taxUpdated',v_tax_updated,
    'sourceRows',jsonb_array_length(p_rows)
  );
end;
$$;

revoke all on function public.import_transport_documents(jsonb,text) from public;
revoke execute on function public.import_transport_documents(jsonb,text) from anon;
grant execute on function public.import_transport_documents(jsonb,text) to authenticated;
notify pgrst,'reload schema';