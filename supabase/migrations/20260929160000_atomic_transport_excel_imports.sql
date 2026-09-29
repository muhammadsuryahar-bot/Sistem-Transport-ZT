-- Atomic Excel imports for Transport master data.
-- Each RPC is one PostgreSQL statement/transaction. If any unexpected write error
-- occurs, the whole import rolls back instead of leaving partially imported rows.
-- Functions are SECURITY INVOKER so caller RLS remains in force.

create or replace function public.import_transport_vehicles(p_rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  r jsonb;
  v_existing public.kendaraan%rowtype;
  v_plate text;
  v_driver_name text;
  v_driver_id bigint;
  v_code text;
  v_owner text;
  v_year integer;
  v_tax date;
  v_count_added integer := 0;
  v_count_updated integer := 0;
  v_drivers_created integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Sesi login tidak valid.';
  end if;
  if not public.has_any_role(array['ADMIN'::public.user_role,'TRANSPORT'::public.user_role]) then
    raise exception 'Role tidak memiliki izin import Kendaraan.';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Tidak ada data Kendaraan untuk diimport.';
  end if;

  for r in select value from jsonb_array_elements(p_rows)
  loop
    v_plate := upper(trim(coalesce(r->>'nomor_polisi','')));
    if v_plate = '' then raise exception 'Nomor Polisi wajib diisi pada data import Kendaraan.'; end if;
    if trim(coalesce(r->>'merk','')) = '' then raise exception 'Merk wajib diisi untuk kendaraan %.', v_plate; end if;

    v_owner := upper(trim(coalesce(r->>'kepemilikan','')));
    if v_owner not in ('ASET','SEWA') then raise exception 'Kepemilikan kendaraan % tidak valid: %.', v_plate, v_owner; end if;
    if v_owner = 'SEWA' and trim(coalesce(r->>'pemilik','')) = '' then raise exception 'Pemilik wajib diisi untuk kendaraan Sewa %.', v_plate; end if;

    if nullif(trim(coalesce(r->>'tahun','')), '') is not null then v_year := (r->>'tahun')::integer; else v_year := null; end if;
    if nullif(trim(coalesce(r->>'masa_pajak','')), '') is not null then v_tax := (r->>'masa_pajak')::date; else v_tax := null; end if;

    select * into v_existing
    from public.kendaraan
    where upper(nomor_polisi)=v_plate
    for update;

    v_driver_name := trim(coalesce(r->>'driver',''));
    v_driver_id := v_existing.driver_id;
    if v_driver_name <> ''
       and upper(v_driver_name) not in ('DRIVER','STANDBY','-','N/A','NA','NONE','TIDAK ADA','TIDAK ADA DRIVER')
    then
      select d.id into v_driver_id
      from public.driver d
      where upper(trim(d.nama_lengkap))=upper(v_driver_name)
      order by d.id limit 1;

      if v_driver_id is null then
        insert into public.driver(nama_lengkap,lokasi,status,keterangan)
        values(v_driver_name,nullif(trim(coalesce(r->>'lokasi','')),''),
               'AKTIF','Dibuat dari import Excel Kendaraan.')
        returning id into v_driver_id;
        v_drivers_created := v_drivers_created + 1;
      end if;
    end if;

    if v_existing.id is not null then
      update public.kendaraan
      set merk=coalesce(nullif(trim(coalesce(r->>'merk','')),''),v_existing.merk),
          tipe=coalesce(nullif(trim(coalesce(r->>'tipe','')),''),v_existing.tipe),
          jenis_kendaraan=coalesce(nullif(trim(coalesce(r->>'jenis','')),''),v_existing.jenis_kendaraan),
          tahun=coalesce(v_year,v_existing.tahun),
          nomor_rangka=coalesce(nullif(trim(coalesce(r->>'nomor_rangka','')),''),v_existing.nomor_rangka),
          nomor_mesin=coalesce(nullif(trim(coalesce(r->>'nomor_mesin','')),''),v_existing.nomor_mesin),
          kepemilikan=v_owner,
          jenis_sewa=case
            when v_owner='SEWA' then coalesce(nullif(trim(coalesce(r->>'jenis_sewa','')),''),v_existing.jenis_sewa)
            else null
          end,
          pemilik=coalesce(nullif(trim(coalesce(r->>'pemilik','')),''),v_existing.pemilik),
          driver_id=v_driver_id,
          lokasi=coalesce(nullif(trim(coalesce(r->>'lokasi','')),''),v_existing.lokasi),
          unit_kerja=coalesce(nullif(trim(coalesce(r->>'unit_kerja','')),''),v_existing.unit_kerja),
          keterangan=coalesce(nullif(trim(coalesce(r->>'keterangan','')),''),v_existing.keterangan),
          masa_berlaku_pajak=coalesce(v_tax,v_existing.masa_berlaku_pajak),
          status_pajak=coalesce(nullif(trim(coalesce(r->>'status_pajak','')),''),v_existing.status_pajak),
          catatan_hutang=coalesce(nullif(trim(coalesce(r->>'catatan_hutang','')),''),v_existing.catatan_hutang),
          updated_at=now()
      where id=v_existing.id;
      v_count_updated := v_count_updated + 1;
    else
      v_code := upper(coalesce(nullif(trim(coalesce(r->>'kode_kendaraan','')),''),
                   'KND-'||regexp_replace(v_plate,'[^A-Z0-9]+','','g')));
      while exists(select 1 from public.kendaraan where upper(kode_kendaraan)=v_code)
      loop
        v_code := v_code||'-'||substr(md5(v_plate||clock_timestamp()::text),1,6);
      end loop;

      insert into public.kendaraan(
        kode_kendaraan,nomor_polisi,merk,tipe,jenis_kendaraan,tahun,
        nomor_rangka,nomor_mesin,kepemilikan,jenis_sewa,pemilik,
        driver_id,lokasi,kilometer_terakhir,status,kondisi,keterangan,
        masa_berlaku_pajak,status_pajak,unit_kerja,catatan_hutang)
      values(
        v_code,v_plate,
        nullif(trim(coalesce(r->>'merk','')),''),
        nullif(trim(coalesce(r->>'tipe','')),''),
        nullif(trim(coalesce(r->>'jenis','')),''),
        v_year,
        nullif(trim(coalesce(r->>'nomor_rangka','')),''),
        nullif(trim(coalesce(r->>'nomor_mesin','')),''),
        v_owner,
        case when v_owner='SEWA' then nullif(trim(coalesce(r->>'jenis_sewa','')),'') else null end,
        nullif(trim(coalesce(r->>'pemilik','')),''),
        v_driver_id,
        nullif(trim(coalesce(r->>'lokasi','')),''),
        0,'ACTIVE',null,
        nullif(trim(coalesce(r->>'keterangan','')),''),
        v_tax,
        nullif(trim(coalesce(r->>'status_pajak','')),''),
        nullif(trim(coalesce(r->>'unit_kerja','')),''),
        nullif(trim(coalesce(r->>'catatan_hutang','')),''));
      v_count_added := v_count_added + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'added',v_count_added,
    'updated',v_count_updated,
    'driversCreated',v_drivers_created,
    'sourceRows',jsonb_array_length(p_rows));
exception when unique_violation then
  raise exception 'Import Kendaraan dibatalkan sepenuhnya karena data duplikat bertabrakan dengan data yang sudah ada.';
end;
$$;

create or replace function public.import_transport_documents(p_rows jsonb,p_sheet_name text)
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
  if auth.uid() is null then raise exception 'Sesi login tidak valid.'; end if;
  if not public.has_any_role(array['ADMIN'::public.user_role,'TRANSPORT'::public.user_role]) then
    raise exception 'Role tidak memiliki izin import Dokumen Kendaraan.';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows)=0 then
    raise exception 'Tidak ada data dokumen untuk diimport.';
  end if;

  for r in select value from jsonb_array_elements(p_rows)
  loop
    v_plate := upper(trim(coalesce(r->>'nomor_polisi','')));
    if v_plate='' then continue; end if;

    select * into v_vehicle
    from public.kendaraan
    where upper(nomor_polisi)=v_plate
    for update;

    if v_vehicle.id is null then
      v_unknown := v_unknown + 1;
      continue;
    end if;

    v_meta := 'EXCEL_META:' ||
      jsonb_build_object(
        'source','STNK_DAN_KIR',
        'source_no',nullif(r->>'source_no',''),
        'nomor_polisi',v_plate,
        'merk',nullif(r->>'merk',''),
        'type',nullif(r->>'tipe',''),
        'tahun',nullif(r->>'tahun',''),
        'nomor_rangka',nullif(r->>'nomor_rangka',''),
        'pemilik',nullif(r->>'pemilik','')
      )::text ||
      ' | Import Excel: ' || coalesce(nullif(p_sheet_name,''),'STNK_DAN_KIR');

    for v_type,v_due in
      select 'STNK',nullif(r->>'stnk','')::date
      union all
      select 'KIR',nullif(r->>'kir','')::date
      union all
      select '5_TAHUNAN',nullif(r->>'lima_tahun','')::date
    loop
      if v_due is null then continue; end if;

      if exists(
        select 1 from public.dokumen_kendaraan d
        where d.kendaraan_id=v_vehicle.id
          and d.jenis_dokumen=v_type
          and d.tanggal_jatuh_tempo=v_due
      ) then
        v_skipped := v_skipped + 1;
      else
        insert into public.dokumen_kendaraan(
          kendaraan_id,jenis_dokumen,nomor_dokumen,tanggal_jatuh_tempo,keterangan)
        values(
          v_vehicle.id,v_type,
          nullif(trim(coalesce(r->>'nomor_dokumen','')),''),
          v_due,v_meta);
        v_inserted := v_inserted + 1;
      end if;
    end loop;

    if nullif(r->>'stnk','') is not null and
       (v_vehicle.masa_berlaku_pajak is null or (r->>'stnk')::date>v_vehicle.masa_berlaku_pajak)
    then
      update public.kendaraan
      set masa_berlaku_pajak=(r->>'stnk')::date,updated_at=now()
      where id=v_vehicle.id;
      v_tax_updated := v_tax_updated + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'inserted',v_inserted,
    'skipped',v_skipped,
    'unknownCount',v_unknown,
    'taxUpdated',v_tax_updated,
    'sourceRows',jsonb_array_length(p_rows));
end;
$$;

create or replace function public.import_transport_rental_contracts(p_rows jsonb,p_actor uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  r jsonb;
  v_vehicle public.kendaraan%rowtype;
  v_owner public.pemilik_sewa%rowtype;
  v_plate text;
  v_contract text;
  v_owner_name text;
  v_owner_type text;
  v_company text;
  v_start date;
  v_end date;
  v_monthly numeric;
  v_due_day integer;
  v_added integer := 0;
  v_duplicate integer := 0;
  v_unknown integer := 0;
begin
  if auth.uid() is null or p_actor is null or p_actor<>auth.uid() then
    raise exception 'Aktor import Kontrak Sewa tidak valid.';
  end if;
  if not public.has_any_role(array['ADMIN'::public.user_role,'TRANSPORT'::public.user_role,'AKUNTANSI'::public.user_role]) then
    raise exception 'Role tidak memiliki izin import Kontrak Sewa.';
  end if;
  if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)=0 then
    raise exception 'Tidak ada Kontrak Sewa untuk diimport.';
  end if;

  for r in select value from jsonb_array_elements(p_rows)
  loop
    v_plate:=upper(trim(coalesce(r->>'nomor_polisi','')));
    v_contract:=trim(coalesce(r->>'nomor_kontrak',''));
    v_owner_name:=trim(coalesce(r->>'pemilik',''));
    v_start:=nullif(trim(coalesce(r->>'tanggal_mulai','')), '')::date;
    v_end:=nullif(trim(coalesce(r->>'tanggal_selesai','')), '')::date;
    v_monthly:=nullif(trim(coalesce(r->>'nilai_sewa_bulanan','')), '')::numeric;

    if v_plate='' or v_contract='' or v_owner_name='' or v_start is null or v_end is null or v_monthly is null or v_monthly<=0 then
      raise exception 'Data Kontrak Sewa % tidak lengkap.',coalesce(v_contract,v_plate);
    end if;
    if v_end<>(v_start+interval '6 months'-interval '1 day')::date then
      raise exception 'Kontrak % tidak tepat 6 bulan.',v_contract;
    end if;

    select * into v_vehicle
    from public.kendaraan
    where upper(nomor_polisi)=v_plate and kepemilikan='SEWA'
    for update;

    if v_vehicle.id is null then v_unknown:=v_unknown+1; continue; end if;
    if exists(select 1 from public.kontrak_sewa where nomor_kontrak=v_contract) then
      v_duplicate:=v_duplicate+1;
      continue;
    end if;

    select * into v_owner
    from public.pemilik_sewa
    where upper(trim(nama_pemilik))=upper(v_owner_name)
    order by id limit 1
    for update;

    if v_owner.id is null then
      v_owner_type:=upper(replace(trim(coalesce(r->>'jenis_pemilik','')),' ','_'));
      if v_owner_type in ('SEWA_PERORANGAN','PERORANGAN','') then
        v_owner_type:='PERORANGAN';
      elsif v_owner_type in ('SEWA_RENTAL','PERUSAHAAN_RENTAL','SEWA_PERUSAHAAN','PERUSAHAAN') then
        v_owner_type:='PERUSAHAAN_RENTAL';
      else
        raise exception 'Jenis pemilik % pada kontrak % tidak valid.',v_owner_type,v_contract;
      end if;

      v_company:=nullif(trim(coalesce(r->>'nama_perusahaan','')),'');
      if v_owner_type='PERUSAHAAN_RENTAL' and v_company is null then
        raise exception 'Nama perusahaan wajib diisi untuk kontrak %.',v_contract;
      end if;

      insert into public.pemilik_sewa(jenis_pemilik,nama_pemilik,nama_perusahaan,aktif)
      values(v_owner_type,v_owner_name,v_company,true)
      returning * into v_owner;
    end if;

    if nullif(trim(coalesce(r->>'tanggal_jatuh_tempo_bulanan','')), '') is not null then
      if regexp_replace(trim(r->>'tanggal_jatuh_tempo_bulanan'),'\\D','','g')<>'' 
         and (regexp_replace(trim(r->>'tanggal_jatuh_tempo_bulanan'),'\\D','','g'))::integer between 1 and 31
         and trim(r->>'tanggal_jatuh_tempo_bulanan') !~ '^\\d{4}-\\d{2}-\\d{2}$'
      then
        v_due_day:=(regexp_replace(trim(r->>'tanggal_jatuh_tempo_bulanan'),'\\D','','g'))::integer;
      else
        v_due_day:=extract(day from (r->>'tanggal_jatuh_tempo_bulanan')::date)::integer;
      end if;
    else
      v_due_day:=null;
    end if;

    insert into public.kontrak_sewa(
      nomor_kontrak,kendaraan_id,pemilik_sewa_id,
      tanggal_mulai,tanggal_selesai,periode_bulan,
      nilai_sewa_bulanan,tanggal_jatuh_tempo_bulanan,
      status,catatan,dibuat_oleh)
    values(
      v_contract,v_vehicle.id,v_owner.id,
      v_start,v_end,6,v_monthly,v_due_day,
      'AKTIF','Import Excel: SUMMERY RENTAL',p_actor);
    v_added:=v_added+1;
  end loop;

  return jsonb_build_object(
    'imported',v_added,
    'duplicate',v_duplicate,
    'unknownCount',v_unknown,
    'skipped',v_duplicate+v_unknown,
    'sourceRows',jsonb_array_length(p_rows));
exception when unique_violation then
  raise exception 'Import Kontrak Sewa dibatalkan sepenuhnya karena ada nomor kontrak yang bertabrakan.';
end;
$$;

revoke all on function public.import_transport_vehicles(jsonb) from public;
revoke all on function public.import_transport_documents(jsonb,text) from public;
revoke all on function public.import_transport_rental_contracts(jsonb,uuid) from public;

grant execute on function public.import_transport_vehicles(jsonb) to authenticated;
grant execute on function public.import_transport_documents(jsonb,text) to authenticated;
grant execute on function public.import_transport_rental_contracts(jsonb,uuid) to authenticated;

notify pgrst,'reload schema';
