-- Merge requester + transport update access into one policy.
-- This preserves the workflow while removing duplicate permissive UPDATE policies.

drop policy if exists "permintaan_service_update_requester_pending" on public.permintaan_service;
drop policy if exists "permintaan_service_update_transport" on public.permintaan_service;

create policy "permintaan_service_update"
on public.permintaan_service
as permissive
for update
to authenticated
using (
  private.has_any_role(array['ADMIN'::public.user_role,'TRANSPORT'::public.user_role])
  or (
    pemohon_id = (select auth.uid())
    and status = 'MENUNGGU_TRANSPORT'
  )
)
with check (
  private.has_any_role(array['ADMIN'::public.user_role,'TRANSPORT'::public.user_role])
  or (
    pemohon_id = (select auth.uid())
    and status = 'MENUNGGU_TRANSPORT'
  )
);