-- Normalize IEEE-754 monetary artifacts in imported service-item metadata.
-- Currency cells such as 16.17 x 1000 should persist as 16170.00, not 16170.000000000002.
-- A narrow, transaction-local trigger exception permits only this controlled metadata change.
-- The original trigger definition is restored below in the same migration.

CREATE OR REPLACE FUNCTION public.guard_service_detail_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_status text;
  v_service_number text;
  v_old_meta jsonb;
  v_new_meta jsonb;
BEGIN
  SELECT s.status, s.nomor_service
    INTO v_status, v_service_number
  FROM public.service s
  WHERE s.id = COALESCE(NEW.service_id, OLD.service_id);

  IF v_status IN ('SELESAI', 'DITOLAK', 'DIBATALKAN') THEN
    -- Migration-only exception: this transaction changes only rounded currency fields
    -- in EXCEL_META for imported DATA_SERVICE rows; no other row/metadata fields may change.
    IF current_setting('app.allow_service_money_precision_migration', true) = 'on'
       AND TG_OP = 'UPDATE'
       AND COALESCE(v_service_number, '') LIKE 'IMP-SRV-%'
       AND (to_jsonb(NEW) - 'keterangan') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'keterangan')
    THEN
      v_old_meta := private.extract_excel_meta(OLD.keterangan);
      v_new_meta := private.extract_excel_meta(NEW.keterangan);

      IF v_old_meta->>'source' = 'DATA_SERVICE'
         AND v_new_meta->>'source' = 'DATA_SERVICE'
         AND (v_new_meta - ARRAY['harga_satuan','nilai_dpp','ppn','total'])
             IS NOT DISTINCT FROM
             (v_old_meta - ARRAY['harga_satuan','nilai_dpp','ppn','total'])
         AND (
           CASE WHEN jsonb_typeof(v_old_meta->'harga_satuan') = 'number'
             THEN jsonb_typeof(v_new_meta->'harga_satuan') = 'number'
               AND (v_new_meta->>'harga_satuan')::numeric = round((v_old_meta->>'harga_satuan')::numeric, 2)
             ELSE v_new_meta->'harga_satuan' IS NOT DISTINCT FROM v_old_meta->'harga_satuan' END
         )
         AND (
           CASE WHEN jsonb_typeof(v_old_meta->'nilai_dpp') = 'number'
             THEN jsonb_typeof(v_new_meta->'nilai_dpp') = 'number'
               AND (v_new_meta->>'nilai_dpp')::numeric = round((v_old_meta->>'nilai_dpp')::numeric, 2)
             ELSE v_new_meta->'nilai_dpp' IS NOT DISTINCT FROM v_old_meta->'nilai_dpp' END
         )
         AND (
           CASE WHEN jsonb_typeof(v_old_meta->'ppn') = 'number'
             THEN jsonb_typeof(v_new_meta->'ppn') = 'number'
               AND (v_new_meta->>'ppn')::numeric = round((v_old_meta->>'ppn')::numeric, 2)
             ELSE v_new_meta->'ppn' IS NOT DISTINCT FROM v_old_meta->'ppn' END
         )
         AND (
           CASE WHEN jsonb_typeof(v_old_meta->'total') = 'number'
             THEN jsonb_typeof(v_new_meta->'total') = 'number'
               AND (v_new_meta->>'total')::numeric = round((v_old_meta->>'total')::numeric, 2)
             ELSE v_new_meta->'total' IS NOT DISTINCT FROM v_old_meta->'total' END
         )
      THEN
        RETURN NEW;
      END IF;
    END IF;

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

DO $$
DECLARE
  rec record;
  v_start integer;
  v_depth integer;
  v_inside_string boolean;
  v_escape boolean;
  v_char text;
  v_i integer;
  v_end integer;
  v_meta jsonb;
  v_tail text;
  v_key text;
  v_value numeric;
  v_changed boolean;
  v_updated_count integer := 0;
BEGIN
  PERFORM set_config('app.allow_service_money_precision_migration', 'on', true);

  FOR rec IN
    SELECT id, keterangan
    FROM public.service_item
    WHERE keterangan LIKE 'EXCEL_META:%'
  LOOP
    v_start := length('EXCEL_META:') + 1;
    v_depth := 0;
    v_inside_string := false;
    v_escape := false;
    v_end := 0;

    FOR v_i IN v_start..length(rec.keterangan) LOOP
      v_char := substr(rec.keterangan, v_i, 1);
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
            v_end := v_i;
            EXIT;
          END IF;
        END IF;
      END IF;
    END LOOP;

    IF v_end = 0 THEN
      RAISE EXCEPTION 'Cannot parse EXCEL_META monetary payload for service_item id %', rec.id;
    END IF;

    v_meta := substring(rec.keterangan FROM v_start FOR v_end-v_start+1)::jsonb;
    IF v_meta->>'source' IS DISTINCT FROM 'DATA_SERVICE' THEN
      CONTINUE;
    END IF;
    v_tail := substring(rec.keterangan FROM v_end+1);
    v_changed := false;

    FOREACH v_key IN ARRAY ARRAY['harga_satuan','nilai_dpp','ppn','total'] LOOP
      IF jsonb_typeof(v_meta->v_key) = 'number' THEN
        v_value := (v_meta->>v_key)::numeric;
        IF v_value <> round(v_value, 2) THEN
          v_meta := jsonb_set(v_meta, ARRAY[v_key], to_jsonb(round(v_value,2)), true);
          v_changed := true;
        END IF;
      END IF;
    END LOOP;

    IF v_changed THEN
      UPDATE public.service_item
      SET keterangan = 'EXCEL_META:' || v_meta::text || v_tail
      WHERE id = rec.id;
      v_updated_count := v_updated_count + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Normalized currency precision for % imported service detail row(s).', v_updated_count;
END;
$$;

-- Restore the original status/authorization guard after the one-time normalization.
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
