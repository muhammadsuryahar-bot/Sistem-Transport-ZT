create policy "permintaan_service_update_requester_pending"
on public.permintaan_service
as permissive
for update
to authenticated
using (
  (pemohon_id = (select auth.uid()))
  and status = 'MENUNGGU_TRANSPORT'
)
with check (
  (pemohon_id = (select auth.uid()))
  and status = 'MENUNGGU_TRANSPORT'
);
