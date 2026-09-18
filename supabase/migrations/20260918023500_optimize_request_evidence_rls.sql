-- Optimize service-request evidence RLS auth evaluation.
drop policy if exists permintaan_service_bukti_select on public.permintaan_service_bukti;
create policy permintaan_service_bukti_select
on public.permintaan_service_bukti
for select
to authenticated
using (
  exists (
    select 1
    from public.permintaan_service ps
    where ps.id = permintaan_service_id
      and (
        ps.pemohon_id = (select auth.uid())
        or (select has_any_role(ARRAY[
          'ADMIN'::user_role,'TRANSPORT'::user_role,
          'ATASAN_TRANSPORT'::user_role,'DIREKTUR'::user_role
        ]))
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
    where ps.id = permintaan_service_id
      and (
        ps.pemohon_id = (select auth.uid())
        or (select has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role]))
      )
  )
);
