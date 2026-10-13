-- Normalize IEEE-754 monetary artifacts in imported line metadata.
-- Source cells such as 16.17 x 1000 should be 16170.00, not 16170.000000000002.
-- Keep source text fields (including ppn_source) and all normalized values to 2 decimals.
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
BEGIN
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
    END IF;
  END LOOP;
END;
$$;
