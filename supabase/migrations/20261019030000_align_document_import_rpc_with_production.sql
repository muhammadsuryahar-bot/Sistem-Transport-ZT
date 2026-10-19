-- Keep repository migrations aligned with the verified production document-import RPC.
-- Tax expiry is read only from the explicit PAJAK source column; STNK and 5-year
-- dates must never be copied into masa_berlaku_pajak. Only ASET vehicles receive
-- imported vehicle documents; rental plates are reported as unknown/skipped.

CREATE OR REPLACE FUNCTION public.import_transport_documents(p_rows jsonb, p_sheet_name text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
DECLARE
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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesi login tidak valid.';
  END IF;

  IF NOT public.has_any_role(ARRAY['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role]) THEN
    RAISE EXCEPTION 'Role tidak memiliki izin import Dokumen Kendaraan.';
  END IF;

  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'Tidak ada data dokumen untuk diimport.';
  END IF;

  FOR r IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_plate := upper(trim(coalesce(r->>'nomor_polisi', '')));
    IF v_plate = '' THEN
      CONTINUE;
    END IF;

    SELECT *
      INTO v_vehicle
      FROM public.kendaraan
     WHERE upper(nomor_polisi) = v_plate
       AND upper(coalesce(kepemilikan, '')) = 'ASET'
     FOR UPDATE;

    IF v_vehicle.id IS NULL THEN
      v_unknown := v_unknown + 1;
      CONTINUE;
    END IF;

    v_meta := 'EXCEL_META:' ||
      jsonb_build_object(
        'source', 'STNK_DAN_5_TAHUNAN',
        'source_no', nullif(r->>'source_no', ''),
        'nomor_polisi', v_plate,
        'merk', nullif(r->>'merk', ''),
        'type', nullif(r->>'tipe', ''),
        'tahun', nullif(r->>'tahun', ''),
        'nomor_rangka', nullif(r->>'nomor_rangka', ''),
        'pemilik', nullif(r->>'pemilik', '')
      )::text || ' | Import Excel: ' || coalesce(nullif(p_sheet_name, ''), 'STNK_DAN_5_TAHUNAN');

    FOR v_type, v_due IN
      SELECT 'STNK', nullif(r->>'stnk', '')::date
      UNION ALL
      SELECT 'PAJAK', nullif(r->>'pajak', '')::date
      UNION ALL
      SELECT '5_TAHUNAN', nullif(r->>'lima_tahun', '')::date
    LOOP
      IF v_due IS NULL THEN
        CONTINUE;
      END IF;

      IF EXISTS (
        SELECT 1
          FROM public.dokumen_kendaraan d
         WHERE d.kendaraan_id = v_vehicle.id
           AND d.jenis_dokumen = v_type
           AND d.tanggal_jatuh_tempo = v_due
      ) THEN
        v_skipped := v_skipped + 1;
      ELSE
        INSERT INTO public.dokumen_kendaraan(
          kendaraan_id, jenis_dokumen, nomor_dokumen, tanggal_jatuh_tempo, keterangan
        )
        VALUES (
          v_vehicle.id,
          v_type,
          nullif(trim(coalesce(r->>'nomor_dokumen', '')), ''),
          v_due,
          v_meta
        );

        v_inserted := v_inserted + 1;
      END IF;

      IF v_type = 'PAJAK' THEN
        UPDATE public.kendaraan
           SET masa_berlaku_pajak = v_due,
               updated_at = now()
         WHERE id = v_vehicle.id
           AND masa_berlaku_pajak IS DISTINCT FROM v_due;

        IF FOUND THEN
          v_tax_updated := v_tax_updated + 1;
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'inserted', v_inserted,
    'skipped', v_skipped,
    'unknownCount', v_unknown,
    'taxUpdated', v_tax_updated,
    'sourceRows', jsonb_array_length(p_rows)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.import_transport_documents(jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.import_transport_documents(jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.import_transport_documents(jsonb, text) TO authenticated;
NOTIFY pgrst, 'reload schema';
