-- Trigger-only function must not be exposed as a client RPC.
revoke execute on function public.sync_transport_request_after_service_delete() from anon;
revoke execute on function public.sync_transport_request_after_service_delete() from authenticated;
revoke execute on function public.sync_transport_request_after_service_delete() from public;
notify pgrst,'reload schema';
