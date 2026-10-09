-- Enforce active-profile checks on requester-owned request/evidence access.
-- Role-based manager access remains governed by private.has_any_role(), which also
-- requires an active profile. This prevents stale sessions for deactivated requesters
-- from continuing to read/update their own pending requests or attach evidence.

drop policy if exists permintaan_service_select_manage on public.permintaan_service;
create policy permintaan_service_select_manage
on public.permintaan_service
for select
to authenticated
using (
  (
    pemohon_id = (select auth.uid())
    and exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.aktif = true
    )
  )
  or (select private.has_any_role(array[
    'ADMIN'::public.user_role,
    'TRANSPORT'::public.user_role,
    'ATASAN_TRANSPORT'::public.user_role,
    'DIREKTUR'::public.user_role,
    'AKUNTANSI'::public.user_role
  ]))
);

drop policy if exists permintaan_service_update on public.permintaan_service;
create policy permintaan_service_update
on public.permintaan_service
for update
to authenticated
using (
  (select private.has_any_role(array['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role]))
  or (
    pemohon_id = (select auth.uid())
    and status = 'MENUNGGU_TRANSPORT'
    and exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.aktif = true
    )
  )
)
with check (
  (select private.has_any_role(array['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role]))
  or (
    pemohon_id = (select auth.uid())
    and status = 'MENUNGGU_TRANSPORT'
    and exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.aktif = true
    )
  )
);

drop policy if exists permintaan_service_bukti_insert on public.permintaan_service_bukti;
create policy permintaan_service_bukti_insert
on public.permintaan_service_bukti
for insert
to authenticated
with check (
  exists (
    select 1
    from public.permintaan_service ps
    where ps.id = permintaan_service_bukti.permintaan_service_id
      and (
        (
          ps.pemohon_id = (select auth.uid())
          and exists (
            select 1
            from public.profiles p
            where p.id = (select auth.uid())
              and p.aktif = true
          )
        )
        or (select private.has_any_role(array['ADMIN'::public.user_role, 'TRANSPORT'::public.user_role]))
      )
  )
);

drop policy if exists permintaan_service_bukti_select on public.permintaan_service_bukti;
create policy permintaan_service_bukti_select
on public.permintaan_service_bukti
for select
to authenticated
using (
  exists (
    select 1
    from public.permintaan_service ps
    where ps.id = permintaan_service_bukti.permintaan_service_id
      and (
        (
          ps.pemohon_id = (select auth.uid())
          and exists (
            select 1
            from public.profiles p
            where p.id = (select auth.uid())
              and p.aktif = true
          )
        )
        or (select private.has_any_role(array[
          'ADMIN'::public.user_role,
          'TRANSPORT'::public.user_role,
          'ATASAN_TRANSPORT'::public.user_role,
          'DIREKTUR'::public.user_role
        ]))
      )
  )
);
