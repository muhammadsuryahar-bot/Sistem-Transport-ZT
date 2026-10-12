-- Allow controlled edits to imported Excel service-history rows while preserving
-- the completion guard for every other completed service.

CREATE OR REPLACE FUNCTION private.extract_excel_meta(p_value text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $function$
DECLARE
  v_start integer := length('EXCEL_META:') + 1;
  v_depth integer := 0;
  v_inside_string boolean := false;
  v_escape boolean := false;
  v_char text;
BEGIN
  IF p_value IS NULL OR left(p_value, length('EXCEL_META:')) <> 'EXCEL_META:' THEN
    RETURN '{}'::jsonb;
  END IF;

  FOR i IN v_start..length(p_value) LOOP
    v_char := substr(p_value, i, 1);
    IF v_inside_string THEN
      IF v_escape THEN
        v_escape := false;
      ELSIF v_char = chr(92) THEN
        v_escape := true;
      ELSIF v_char = '"' THEN
        v_inside_string := false;
      END IF;
    ELSE
      IF v_char = '"' THEN
        v_inside_string := true;
      ELSIF v_char = '{' THEN
        v_depth := v_depth + 1;
      ELSIF v_char = '}' THEN
        v_depth := v_depth - 1;
        IF v_depth = 0 THEN
          RETURN substring(p_value FROM v_start FOR i - v_start + 1)::jsonb;
        END IF;
      END IF;
    END IF;
  END LOOP;

  RETURN '{}'::jsonb;
EXCEPTION WHEN OTHERS THEN
  RETURN '{}'::jsonb;
END;
$function$;

CREATE OR REPLACE FUNCTION private.extract_excel_note(p_value text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $function$
DECLARE
  v_start integer := length('EXCEL_META:') + 1;
  v_depth integer := 0;
  v_inside_string boolean := false;
  v_escape boolean := false;
  v_char text;
  v_suffix text;
BEGIN
  IF p_value IS NULL THEN
    RETURN '';
  END IF;
  IF left(p_value, length('EXCEL_META:')) <> 'EXCEL_META:' THEN
    RETURN p_value;
  END IF;

  FOR i IN v_start..length(p_value) LOOP
    v_char := substr(p_value, i, 1);
    IF v_inside_string THEN
      IF v_escape THEN
        v_escape := false;
      ELSIF v_char = chr(92) THEN
        v_escape := true;
      ELSIF v_char = '"' THEN
        v_inside_string := false;
      END IF;
    ELSE
      IF v_char = '"' THEN
        v_inside_string := true;
      ELSIF v_char = '{' THEN
        v_depth := v_depth + 1;
      ELSIF v_char = '}' THEN
        v_depth := v_depth - 1;
        IF v_depth = 0 THEN
          v_suffix := substring(p_value FROM i + 1);
          IF left(v_suffix, 3) = ' | ' THEN
            RETURN substring(v_suffix FROM 4);
          END IF;
          RETURN '';
        END IF;
      END IF;
    END IF;
  END LOOP;

  RETURN '';
END;
$function$;

CREATE OR REPLACE FUNCTION private.encode_excel_meta(p_meta jsonb, p_note text DEFAULT '')
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT 'EXCEL_META:' || COALESCE(p_meta, '{}'::jsonb)::text
    || CASE WHEN COALESCE(p_note, '') <> '' THEN ' | ' || p_note ELSE '' END;
$function$;

REVOKE ALL ON FUNCTION private.extract_excel_meta(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.extract_excel_note(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.encode_excel_meta(jsonb, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_service_detail_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_status text;
  v_service_number text;
BEGIN
  SELECT s.status, s.nomor_service
    INTO v_status, v_service_number
  FROM public.service s
  WHERE s.id = COALESCE(NEW.service_id, OLD.service_id);

  IF v_status IN ('SELESAI', 'DITOLAK', 'DIBATALKAN') THEN
    IF current_setting('app.allow_imported_service_history_edit', true) = 'on'
       AND COALESCE(v_service_number, '') LIKE 'IMP-SRV-%'
       AND private.has_any_role(ARRAY[
         'ADMIN'::public.user_role,
         'TRANSPORT'::public.user_role
       ]) THEN
      RETURN COALESCE(NEW, OLD);
    END IF;

    RAISE EXCEPTION 'Detail service tidak dapat diubah setelah service berstatus %.', v_status;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_service_history_item(
  p_item_id bigint,
  p_payload jsonb,
  p_meta jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_item public.service_item%ROWTYPE;
  v_updated_item public.service_item%ROWTYPE;
  v_service public.service%ROWTYPE;
  v_updated_service public.service%ROWTYPE;
  v_updated_request public.permintaan_service%ROWTYPE;
  v_meta_from_payload jsonb;
  v_old_meta jsonb;
  v_qty numeric;
  v_price numeric;
  v_subtotal numeric;
  v_old_dpp numeric;
  v_old_ppn numeric;
  v_old_total numeric;
  v_new_dpp numeric;
  v_new_ppn numeric;
  v_new_total numeric;
  v_target_date date;
  v_new_bengkel text;
  v_total_dpp numeric;
  v_total_ppn numeric;
  v_total_all numeric;
  v_max_km numeric;
  v_complaint text;
  v_work_text text;
  v_service_type text;
  v_items jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Sesi login tidak valid.';
  END IF;
  IF NOT private.has_any_role(ARRAY[
    'ADMIN'::public.user_role,
    'TRANSPORT'::public.user_role
  ]) THEN
    RAISE EXCEPTION 'Hanya ADMIN dan TRANSPORT yang dapat mengubah riwayat service.';
  END IF;
  IF jsonb_typeof(p_payload) <> 'object' OR jsonb_typeof(p_meta) <> 'object' THEN
    RAISE EXCEPTION 'Data perubahan riwayat service tidak valid.';
  END IF;
  IF p_meta->>'source' IS DISTINCT FROM 'DATA_SERVICE' THEN
    RAISE EXCEPTION 'Sumber baris tidak dikenali sebagai riwayat Data Service.';
  END IF;
  v_meta_from_payload := private.extract_excel_meta(p_payload->>'keterangan');
  IF v_meta_from_payload IS DISTINCT FROM p_meta THEN
    RAISE EXCEPTION 'Metadata riwayat dan data yang akan disimpan tidak cocok.';
  END IF;

  SELECT * INTO v_item
  FROM public.service_item
  WHERE id = p_item_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Baris rincian service tidak ditemukan.';
  END IF;

  SELECT * INTO v_service
  FROM public.service
  WHERE id = v_item.service_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaksi service terkait tidak ditemukan.';
  END IF;
  IF COALESCE(v_service.nomor_service, '') NOT LIKE 'IMP-SRV-%' THEN
    RAISE EXCEPTION 'Baris ini bukan transaksi impor riwayat Excel. Gunakan editor service/item standar.';
  END IF;
  IF private.extract_excel_meta(v_item.keterangan)->>'source' IS DISTINCT FROM 'DATA_SERVICE' THEN
    RAISE EXCEPTION 'Rincian ini tidak memiliki metadata riwayat Data Service yang valid.';
  END IF;

  v_qty := NULLIF(p_payload->>'jumlah', '')::numeric;
  v_price := NULLIF(p_payload->>'harga_satuan', '')::numeric;
  v_subtotal := NULLIF(p_payload->>'subtotal', '')::numeric;
  v_new_dpp := NULLIF(p_meta->>'nilai_dpp', '')::numeric;
  v_new_ppn := COALESCE(NULLIF(p_meta->>'ppn', '')::numeric, 0);
  v_new_total := NULLIF(p_meta->>'total', '')::numeric;
  IF v_qty IS NULL OR v_qty <= 0
     OR v_price IS NULL OR v_price < 0
     OR v_subtotal IS NULL OR v_subtotal < 0
     OR v_new_dpp IS NULL OR v_new_dpp < 0
     OR v_new_total IS NULL OR v_new_total < 0
     OR v_new_ppn < 0 THEN
    RAISE EXCEPTION 'Qty dan nominal riwayat service harus bernilai valid dan tidak negatif.';
  END IF;
  IF abs(v_subtotal - v_new_dpp) > greatest(1, v_new_dpp * 0.001) THEN
    RAISE EXCEPTION 'Subtotal rincian harus sama dengan Nilai DPP.';
  END IF;
  IF abs(v_new_total - (v_new_dpp + v_new_ppn)) > greatest(1, (v_new_dpp + v_new_ppn) * 0.001) THEN
    RAISE EXCEPTION 'Total harus sama dengan Nilai DPP ditambah PPn.';
  END IF;
  IF NULLIF(p_meta->>'tanggal', '') IS NULL THEN
    RAISE EXCEPTION 'Tanggal riwayat service wajib diisi.';
  END IF;

  v_target_date := (p_meta->>'tanggal')::date;
  v_new_bengkel := NULLIF(btrim(COALESCE(p_meta->>'bengkel', '')), '');
  IF v_target_date IS DISTINCT FROM v_service.tanggal_service
     OR v_new_bengkel IS DISTINCT FROM v_service.bengkel THEN
    IF EXISTS (
      SELECT 1
      FROM public.service s2
      WHERE s2.id <> v_service.id
        AND s2.kendaraan_id = v_service.kendaraan_id
        AND s2.tanggal_service = v_target_date
        AND upper(COALESCE(s2.bengkel, '')) = upper(COALESCE(v_new_bengkel, ''))
    ) THEN
      RAISE EXCEPTION 'Tanggal dan bengkel tersebut sudah digunakan oleh transaksi service lain untuk kendaraan ini.';
    END IF;
  END IF;

  v_old_meta := private.extract_excel_meta(v_item.keterangan);
  v_old_dpp := CASE
    WHEN COALESCE(v_old_meta->>'nilai_dpp', '') ~ '^-?[0-9]+([.][0-9]+)?$'
      THEN (v_old_meta->>'nilai_dpp')::numeric
    ELSE v_item.subtotal
  END;
  v_old_ppn := CASE
    WHEN COALESCE(v_old_meta->>'ppn', '') ~ '^-?[0-9]+([.][0-9]+)?$'
      THEN (v_old_meta->>'ppn')::numeric
    ELSE 0
  END;
  v_old_total := CASE
    WHEN COALESCE(v_old_meta->>'total', '') ~ '^-?[0-9]+([.][0-9]+)?$'
      THEN (v_old_meta->>'total')::numeric
    ELSE v_old_dpp + v_old_ppn
  END;

  PERFORM set_config('app.allow_imported_service_history_edit', 'on', true);

  UPDATE public.service_item
  SET nama_item = NULLIF(btrim(p_payload->>'nama_item'), ''),
      kategori = NULLIF(btrim(p_payload->>'kategori'), ''),
      jumlah = v_qty,
      satuan = NULLIF(btrim(p_payload->>'satuan'), ''),
      harga_satuan = v_price,
      subtotal = v_subtotal,
      keterangan = p_payload->>'keterangan'
  WHERE id = v_item.id
  RETURNING * INTO v_updated_item;

  IF v_target_date IS DISTINCT FROM v_service.tanggal_service
     OR v_new_bengkel IS DISTINCT FROM v_service.bengkel THEN
    UPDATE public.service_item sibling
    SET keterangan = private.encode_excel_meta(
      jsonb_set(
        jsonb_set(
          private.extract_excel_meta(sibling.keterangan),
          '{tanggal}',
          to_jsonb(to_char(v_target_date, 'YYYY-MM-DD')),
          true
        ),
        '{bengkel}',
        to_jsonb(COALESCE(v_new_bengkel, '')),
        true
      ),
      private.extract_excel_note(sibling.keterangan)
    )
    WHERE sibling.service_id = v_service.id
      AND sibling.id <> v_item.id
      AND private.extract_excel_meta(sibling.keterangan)->>'source' = 'DATA_SERVICE';
  END IF;

  SELECT
    COALESCE(SUM(
      CASE WHEN COALESCE(meta.data->>'nilai_dpp', '') ~ '^-?[0-9]+([.][0-9]+)?$'
        THEN (meta.data->>'nilai_dpp')::numeric ELSE si.subtotal END
    ), 0),
    COALESCE(SUM(
      CASE WHEN COALESCE(meta.data->>'ppn', '') ~ '^-?[0-9]+([.][0-9]+)?$'
        THEN (meta.data->>'ppn')::numeric ELSE 0 END
    ), 0),
    COALESCE(SUM(
      CASE WHEN COALESCE(meta.data->>'total', '') ~ '^-?[0-9]+([.][0-9]+)?$'
        THEN (meta.data->>'total')::numeric
        ELSE
          (CASE WHEN COALESCE(meta.data->>'nilai_dpp', '') ~ '^-?[0-9]+([.][0-9]+)?$'
             THEN (meta.data->>'nilai_dpp')::numeric ELSE si.subtotal END)
          + (CASE WHEN COALESCE(meta.data->>'ppn', '') ~ '^-?[0-9]+([.][0-9]+)?$'
             THEN (meta.data->>'ppn')::numeric ELSE 0 END)
      END
    ), 0),
    MAX(CASE WHEN COALESCE(meta.data->>'kilometer', '') ~ '^[0-9]+([.][0-9]+)?$'
      THEN (meta.data->>'kilometer')::numeric ELSE NULL END),
    string_agg(COALESCE(meta.data->>'jenis_pekerjaan', ''), ' '),
    (array_agg(
      COALESCE(NULLIF(meta.data->>'uraian', ''), NULLIF(meta.data->>'jenis_pekerjaan', ''), 'Riwayat Service')
      ORDER BY
        CASE WHEN COALESCE(meta.data->>'source_no', '') ~ '^[0-9]+([.][0-9]+)?$'
          THEN (meta.data->>'source_no')::numeric ELSE si.id::numeric END,
        si.id
    ))[1]
  INTO v_total_dpp, v_total_ppn, v_total_all, v_max_km, v_work_text, v_complaint
  FROM public.service_item si
  CROSS JOIN LATERAL (SELECT private.extract_excel_meta(si.keterangan) AS data) meta
  WHERE si.service_id = v_service.id;

  IF COALESCE(v_work_text, '') ~* 'GANTI[[:space:]]+BAN|PENGGANTIAN[[:space:]]+BAN' THEN
    v_service_type := 'GANTI_BAN';
  ELSIF COALESCE(v_work_text, '') ~* 'GANTI[[:space:]]+(AKI|BATERAI)|PENGGANTIAN[[:space:]]+(AKI|BATERAI)' THEN
    v_service_type := 'GANTI_AKI';
  ELSIF COALESCE(v_work_text, '') ~* 'PEMERIKSAAN' THEN
    v_service_type := 'PEMERIKSAAN';
  ELSE
    v_service_type := 'SERVICE';
  END IF;

  UPDATE public.service
  SET tanggal_service = v_target_date,
      kilometer = COALESCE(v_max_km, v_service.kilometer),
      bengkel = v_new_bengkel,
      jenis_service = v_service_type,
      keluhan = v_complaint,
      nilai_dpp = v_total_dpp,
      ppn = v_total_ppn,
      total = v_total_all,
      estimasi_biaya = v_total_all,
      biaya_aktual = v_total_all
  WHERE id = v_service.id
  RETURNING * INTO v_updated_service;

  IF v_service.permintaan_service_id IS NOT NULL THEN
    UPDATE public.permintaan_service
    SET tanggal_pengajuan = v_target_date,
        kilometer_pengajuan = COALESCE(v_max_km, v_service.kilometer),
        jenis_permintaan = v_service_type,
        keluhan = v_complaint
    WHERE id = v_service.permintaan_service_id
    RETURNING * INTO v_updated_request;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(si) ORDER BY si.id), '[]'::jsonb)
    INTO v_items
  FROM public.service_item si
  WHERE si.service_id = v_service.id;

  RETURN jsonb_build_object(
    'item', to_jsonb(v_updated_item),
    'items', v_items,
    'service', to_jsonb(v_updated_service),
    'request', to_jsonb(v_updated_request)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.update_service_history_item(bigint, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_service_history_item(bigint, jsonb, jsonb) TO authenticated;
