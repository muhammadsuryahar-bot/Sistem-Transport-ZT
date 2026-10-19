-- This function is intended to run only through existing table triggers.
-- The private schema is not exposed by the Data API, but its default PUBLIC execute
-- grant is unnecessary and weakens least-privilege controls.
REVOKE ALL ON FUNCTION private.write_transport_audit() FROM PUBLIC, anon, authenticated;

DO $verify$
DECLARE
  trigger_count bigint;
BEGIN
  IF has_function_privilege('anon', 'private.write_transport_audit()'::regprocedure, 'EXECUTE')
     OR has_function_privilege('authenticated', 'private.write_transport_audit()'::regprocedure, 'EXECUTE')
     OR has_function_privilege('public', 'private.write_transport_audit()'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'Audit trigger function still has direct execute privileges for an API role or PUBLIC.';
  END IF;

  SELECT count(*)
    INTO trigger_count
    FROM pg_trigger
   WHERE tgfoid = 'private.write_transport_audit()'::regprocedure
     AND NOT tgisinternal;

  IF trigger_count = 0 THEN
    RAISE EXCEPTION 'No audit triggers reference private.write_transport_audit(); refusing to declare hardening complete.';
  END IF;
END;
$verify$;
