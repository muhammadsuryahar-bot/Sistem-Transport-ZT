-- Keep the public RPC signature used by the frontend, but move the privileged implementation
-- out of the API-exposed public schema. The public wrapper runs as SECURITY INVOKER.
-- The implementation retains its existing auth.uid(), ADMIN/TRANSPORT, payload, lock and
-- financial consistency checks. The private schema is not exposed by Supabase Data API.
ALTER FUNCTION public.update_service_history_item(bigint,jsonb,jsonb) SET SCHEMA private;
ALTER FUNCTION private.update_service_history_item(bigint,jsonb,jsonb) RENAME TO update_service_history_item_impl;
ALTER FUNCTION private.update_service_history_item_impl(bigint,jsonb,jsonb) SECURITY DEFINER;
ALTER FUNCTION private.update_service_history_item_impl(bigint,jsonb,jsonb) SET search_path TO '';

GRANT USAGE ON SCHEMA private TO authenticated, service_role;
REVOKE ALL ON FUNCTION private.update_service_history_item_impl(bigint,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.update_service_history_item_impl(bigint,jsonb,jsonb) TO authenticated, service_role;

CREATE FUNCTION public.update_service_history_item(p_item_id bigint, p_payload jsonb, p_meta jsonb)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $function$
  SELECT private.update_service_history_item_impl(p_item_id, p_payload, p_meta);
$function$;

REVOKE ALL ON FUNCTION public.update_service_history_item(bigint,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_service_history_item(bigint,jsonb,jsonb) TO authenticated, service_role;
