-- Security policies for service requests.
-- Operational users create their own requests. ADMIN may create administrative entries.
-- Transport/approval roles can read the processing queue.
-- Only ADMIN/TRANSPORT can modify request workflow fields.
-- The requester may cancel while the request is still at the initial transport queue.

DROP POLICY IF EXISTS "permintaan_service_select_active_users" ON public.permintaan_service;
DROP POLICY IF EXISTS "permintaan_service_insert_operasional_admin" ON public.permintaan_service;
DROP POLICY IF EXISTS "permintaan_service_update_transport_admin" ON public.permintaan_service;
DROP POLICY IF EXISTS "permintaan_service_cancel_owner" ON public.permintaan_service;

create policy "permintaan_service_select_active_users"
on public.permintaan_service
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.aktif = true
  )
  and (
    pemohon_id = auth.uid()
    or public.has_any_role(array[
      'ADMIN'::public.user_role,
      'TRANSPORT'::public.user_role,
      'ATASAN_TRANSPORT'::public.user_role,
      'DIREKTUR'::public.user_role
    ])
  )
);

create policy "permintaan_service_insert_operasional_admin"
on public.permintaan_service
for insert
to authenticated
with check (
  pemohon_id = auth.uid()
  and public.has_any_role(array[
    'ADMIN'::public.user_role,
    'OPERASIONAL'::public.user_role
  ])
);

create policy "permintaan_service_update_transport_admin"
on public.permintaan_service
for update
to authenticated
using (
  public.has_any_role(array[
    'ADMIN'::public.user_role,
    'TRANSPORT'::public.user_role
  ])
)
with check (
  public.has_any_role(array[
    'ADMIN'::public.user_role,
    'TRANSPORT'::public.user_role
  ])
);

create policy "permintaan_service_cancel_owner"
on public.permintaan_service
for update
to authenticated
using (
  pemohon_id = auth.uid()
  and status in ('MENUNGGU_TRANSPORT'::text, 'DITERIMA_TRANSPORT'::text)
)
with check (
  pemohon_id = auth.uid()
  and status = 'DIBATALKAN'::text
);
