-- Harden rental write policies and make service deletion restore an unprocessed request safely.

drop policy if exists pembayaran_sewa_update_rental on public.pembayaran_sewa;
create policy pembayaran_sewa_update_rental
on public.pembayaran_sewa
for update
to authenticated
using (
  (select private.has_any_role(ARRAY['ADMIN'::user_role, 'TRANSPORT'::user_role, 'AKUNTANSI'::user_role]))
)
with check (
  (select private.has_any_role(ARRAY['ADMIN'::user_role, 'TRANSPORT'::user_role, 'AKUNTANSI'::user_role]))
);

drop policy if exists pembayaran_sewa_delete_rental on public.pembayaran_sewa;
create policy pembayaran_sewa_delete_rental
on public.pembayaran_sewa
for delete
to authenticated
using (
  (select private.has_any_role(ARRAY['ADMIN'::user_role, 'TRANSPORT'::user_role, 'AKUNTANSI'::user_role]))
);

drop policy if exists perbaikan_sewa_update_rental on public.perbaikan_sewa;
create policy perbaikan_sewa_update_rental
on public.perbaikan_sewa
for update
to authenticated
using (
  (select private.has_any_role(ARRAY['ADMIN'::user_role, 'TRANSPORT'::user_role]))
)
with check (
  (select private.has_any_role(ARRAY['ADMIN'::user_role, 'TRANSPORT'::user_role]))
);

drop policy if exists perbaikan_sewa_delete_rental on public.perbaikan_sewa;
create policy perbaikan_sewa_delete_rental
on public.perbaikan_sewa
for delete
to authenticated
using (
  (select private.has_any_role(ARRAY['ADMIN'::user_role, 'TRANSPORT'::user_role]))
);

create or replace function public.sync_transport_request_after_service_delete()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if old.permintaan_service_id is null then
    return old;
  end if;

  update public.permintaan_service
  set status = 'MENUNGGU_TRANSPORT',
      diproses_oleh = null,
      diproses_at = null,
      updated_at = now()
  where id = old.permintaan_service_id
    and not exists (
      select 1
      from public.service s
      where s.permintaan_service_id = old.permintaan_service_id
    );

  return old;
end;
$function$;

revoke all on function public.sync_transport_request_after_service_delete() from public;

drop trigger if exists trg_sync_transport_request_after_service_delete on public.service;

create trigger trg_sync_transport_request_after_service_delete
after delete on public.service
for each row
execute function public.sync_transport_request_after_service_delete();
