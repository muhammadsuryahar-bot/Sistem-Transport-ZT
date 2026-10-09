-- This is a trigger-only function; clients should never invoke it as an RPC.
-- PostgreSQL triggers do not require callers to have EXECUTE on their trigger function.
revoke execute on function public.validate_vehicle_document_ownership() from anon, authenticated;
