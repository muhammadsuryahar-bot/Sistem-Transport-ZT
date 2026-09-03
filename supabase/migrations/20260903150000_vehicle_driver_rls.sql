-- Vehicle master data security policy.
-- Read access is granted to authenticated active users because the vehicle
-- master is referenced by operational, approval, service, rental, and report flows.
-- Mutations stay restricted to ADMIN / TRANSPORT.

create policy "driver_select_authenticated_active"
on public.driver
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.aktif = true
  )
);

create policy "driver_insert_transport_admin"
on public.driver
for insert
to authenticated
with check (
  public.has_any_role(array['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role])
);

create policy "driver_update_transport_admin"
on public.driver
for update
to authenticated
using (
  public.has_any_role(array['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role])
)
with check (
  public.has_any_role(array['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role])
);

create policy "driver_delete_admin"
on public.driver
for delete
to authenticated
using (
  public.has_any_role(array['ADMIN'::public.user_role])
);

create policy "kendaraan_select_authenticated_active"
on public.kendaraan
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.aktif = true
  )
);

create policy "kendaraan_insert_transport_admin"
on public.kendaraan
for insert
to authenticated
with check (
  public.has_any_role(array['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role])
);

create policy "kendaraan_update_transport_admin"
on public.kendaraan
for update
to authenticated
using (
  public.has_any_role(array['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role])
)
with check (
  public.has_any_role(array['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role])
);

create policy "kendaraan_delete_admin"
on public.kendaraan
for delete
to authenticated
using (
  public.has_any_role(array['ADMIN'::public.user_role])
);
