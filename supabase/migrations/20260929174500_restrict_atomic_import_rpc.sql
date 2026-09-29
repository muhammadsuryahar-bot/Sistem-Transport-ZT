-- Defense-in-depth: atomic import RPCs must not be executable by anonymous clients.
revoke all on function public.import_transport_vehicles(jsonb) from public;
revoke all on function public.import_transport_documents(jsonb,text) from public;
revoke all on function public.import_transport_rental_contracts(jsonb,uuid) from public;
revoke execute on function public.import_transport_vehicles(jsonb) from anon;
revoke execute on function public.import_transport_documents(jsonb,text) from anon;
revoke execute on function public.import_transport_rental_contracts(jsonb,uuid) from anon;
grant execute on function public.import_transport_vehicles(jsonb) to authenticated;
grant execute on function public.import_transport_documents(jsonb,text) to authenticated;
grant execute on function public.import_transport_rental_contracts(jsonb,uuid) to authenticated;
notify pgrst,'reload schema';