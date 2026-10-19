-- Correct kmUpdated summary for import_service_history.
-- Completion triggers can update kilometer_terakhir before the RPC's old counter ran,
-- which made the response report zero even when an imported reading advanced master KM.
CREATE OR REPLACE FUNCTION public.import_service_history(p_payload jsonb, p_source_sheet text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
declare
  actor uuid := auth.uid();
  grp jsonb;
  item jsonb;
  vehicle_id bigint;
  request_id bigint;
  service_id bigint;
  transaction_no integer := 0;
  item_count integer := 0;
  imported_count integer := 0;
  km_updated_count integer := 0;
  km_history_count integer := 0;
  current_km numeric;
  imported_max_km numeric;
  rows_inserted integer := 0;
  source_note text;
  vehicle_km_before jsonb := '{}'::jsonb;
begin
  if actor is null then
    raise exception 'Sesi login tidak valid.';
  end if;

  if not private.has_any_role(ARRAY[
    'ADMIN'::public.user_role,
    'TRANSPORT'::public.user_role
  ]) then
    raise exception 'Akun tidak memiliki hak import histori service.';
  end if;

  if jsonb_typeof(p_payload) <> 'array' then
    raise exception 'Payload import histori service harus berupa array.';
  end if;

  -- Capture and lock each master odometer before any Service completion trigger can
  -- advance it. The returned kmUpdated count will compare the post-import result
  -- against this original value rather than against the already-updated value.
  for vehicle_id in
    select distinct (value->>'kendaraan_id')::bigint
    from jsonb_array_elements(p_payload)
    where coalesce(value->>'kendaraan_id', '') <> ''
    order by (value->>'kendaraan_id')::bigint
  loop
    select coalesce(kilometer_terakhir, 0)
      into current_km
      from public.kendaraan
     where id = vehicle_id
     for update;

    if not found then
      raise exception 'Kendaraan % tidak ditemukan sebelum import KM.', vehicle_id;
    end if;

    vehicle_km_before := vehicle_km_before || jsonb_build_object(vehicle_id::text, current_km);
  end loop;

  for grp in select value from jsonb_array_elements(p_payload)
  loop
    transaction_no := transaction_no + 1;
    vehicle_id := (grp->>'kendaraan_id')::bigint;

    insert into public.permintaan_service (
      pemohon_id, kendaraan_id, tanggal_pengajuan, kilometer_pengajuan,
      jenis_permintaan, keluhan, prioritas, status
    )
    values (
      actor,
      vehicle_id,
      (grp->>'tanggal')::date,
      nullif(grp->>'kilometer', '')::numeric,
      coalesce(nullif(grp->>'jenis_service', ''), 'SERVICE'),
      coalesce(nullif(grp->>'keluhan', ''), 'Riwayat Service'),
      'NORMAL',
      'MENUNGGU_TRANSPORT'
    )
    returning id into request_id;

    insert into public.service (
      nomor_service, permintaan_service_id, kendaraan_id, tanggal_service,
      kilometer, bengkel, jenis_service, keluhan, estimasi_biaya,
      biaya_aktual, status, diproses_oleh, nilai_dpp, ppn, total, catatan
    )
    values (
      concat('IMP-SRV-', to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS'), '-', transaction_no),
      request_id,
      vehicle_id,
      (grp->>'tanggal')::date,
      nullif(grp->>'kilometer', '')::numeric,
      nullif(grp->>'bengkel', ''),
      coalesce(nullif(grp->>'jenis_service', ''), 'SERVICE'),
      nullif(grp->>'keluhan', ''),
      coalesce((grp->>'total')::numeric, 0),
      coalesce((grp->>'total')::numeric, 0),
      'DALAM_PENGERJAAN',
      actor,
      coalesce((grp->>'nilai_dpp')::numeric, 0),
      coalesce((grp->>'ppn')::numeric, 0),
      coalesce((grp->>'total')::numeric, 0),
      concat('Import histori Excel: ', coalesce(nullif(p_source_sheet, ''), 'Data Service'))
    )
    returning id into service_id;

    for item in select value from jsonb_array_elements(coalesce(grp->'items', '[]'::jsonb))
    loop
      insert into public.service_item (
        service_id, nama_item, kategori, jumlah, satuan, harga_satuan, subtotal, keterangan
      )
      values (
        service_id,
        coalesce(nullif(item->>'nama_item', ''), 'Item Excel'),
        nullif(item->>'kategori', ''),
        coalesce((item->>'jumlah')::numeric, 1),
        nullif(item->>'satuan', ''),
        coalesce((item->>'harga_satuan')::numeric, 0),
        coalesce((item->>'subtotal')::numeric, 0),
        nullif(item->>'keterangan', '')
      );
      item_count := item_count + 1;
    end loop;

    update public.service
       set status = 'SELESAI', selesai_at = now()
     where id = service_id;

    update public.permintaan_service
       set status = 'SELESAI'
     where id = request_id;

    imported_count := imported_count + 1;
  end loop;

  -- Lock vehicles in a deterministic order. Record every positive source reading,
  -- not only readings greater than the current master odometer: these are historical
  -- observations, and a higher current value must not erase their timeline.
  for vehicle_id in
    select distinct (value->>'kendaraan_id')::bigint
    from jsonb_array_elements(p_payload)
    where coalesce(value->>'kendaraan_id', '') <> ''
    order by (value->>'kendaraan_id')::bigint
  loop
    select coalesce(kilometer_terakhir, 0)
      into current_km
      from public.kendaraan
     where id = vehicle_id
     for update;

    if not found then
      raise exception 'Kendaraan % tidak ditemukan saat memperbarui KM.', vehicle_id;
    end if;

    for grp in
      select value
      from jsonb_array_elements(p_payload)
      where (value->>'kendaraan_id')::bigint = vehicle_id
        and coalesce((value->>'kilometer')::numeric, 0) > 0
      order by (value->>'tanggal')::date, coalesce((value->>'kilometer')::numeric, 0)
    loop
      source_note := concat(
        'Import histori Excel: ',
        coalesce(nullif(p_source_sheet, ''), 'Data Service')
      );

      insert into public.riwayat_kilometer (
        kendaraan_id, tanggal, kilometer, sumber, keterangan, dicatat_oleh
      )
      select
        vehicle_id,
        (grp->>'tanggal')::date,
        (grp->>'kilometer')::numeric,
        'IMPORT_SERVICE',
        source_note,
        actor
      where not exists (
        select 1
        from public.riwayat_kilometer rk
        where rk.kendaraan_id = vehicle_id
          and rk.tanggal = (grp->>'tanggal')::date
          and rk.kilometer = (grp->>'kilometer')::numeric
          and rk.sumber = 'IMPORT_SERVICE'
      )
      on conflict (kendaraan_id, tanggal, kilometer)
        where (sumber = 'IMPORT_SERVICE')
      do nothing;

      get diagnostics rows_inserted = row_count;
      km_history_count := km_history_count + rows_inserted;
    end loop;

    select max(coalesce((value->>'kilometer')::numeric, 0))
      into imported_max_km
      from jsonb_array_elements(p_payload)
     where (value->>'kendaraan_id')::bigint = vehicle_id;

    -- Current odometer is never reduced to a historical reading.
    if imported_max_km > current_km then
      update public.kendaraan
         set kilometer_terakhir = imported_max_km
       where id = vehicle_id;
      current_km := imported_max_km;
    end if;

    if imported_max_km > coalesce((vehicle_km_before ->> vehicle_id::text)::numeric, 0)
       and current_km >= imported_max_km then
      km_updated_count := km_updated_count + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'imported', imported_count,
    'items', item_count,
    'kmUpdated', km_updated_count,
    'kmHistorySaved', km_history_count
  );
end;
$function$;
