-- Align service approval RLS with the database enum/check values.
drop policy if exists service_approval_insert_role on public.service_approval;
create policy service_approval_insert_role
on public.service_approval
for insert
to authenticated
with check (
  (select has_any_role(ARRAY['ADMIN'::user_role]))
  or (
    jenis_approval = 'KEPALA_BAGIAN'
    and (select has_any_role(ARRAY['ATASAN_TRANSPORT'::user_role]))
    and exists (
      select 1 from public.service s
      where s.id = service_id
        and coalesce(s.biaya_aktual, s.estimasi_biaya, 0) <= 5000000
    )
  )
  or (
    jenis_approval = 'DIREKTUR'
    and (select has_any_role(ARRAY['DIREKTUR'::user_role]))
    and exists (
      select 1 from public.service s
      where s.id = service_id
        and coalesce(s.biaya_aktual, s.estimasi_biaya, 0) > 5000000
    )
  )
);
