-- Keep the service workflow as the source of truth for its linked request status.
-- This also lets approvers update service status without requiring direct UPDATE
-- permission on permintaan_service.

create or replace function public.sync_transport_request_after_service()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  target_status text;
begin
  if new.permintaan_service_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  target_status := case new.status
    when 'SELESAI' then 'SELESAI'
    when 'DITOLAK' then 'DITOLAK'
    when 'DIBATALKAN' then 'DIBATALKAN'
    when 'MENUNGGU_APPROVAL' then 'MENUNGGU_APPROVAL'
    when 'DISETUJUI' then 'DALAM_PROSES'
    when 'DALAM_PENGERJAAN' then 'DALAM_PROSES'
    when 'DALAM_PROSES' then 'DALAM_PROSES'
    else null
  end;

  if target_status is null then
    return new;
  end if;

  update public.permintaan_service
  set status = target_status,
      diproses_oleh = coalesce(new.diproses_oleh, diproses_oleh),
      diproses_at = case
        when new.status = 'SELESAI' then coalesce(new.selesai_at, now())
        else coalesce(diproses_at, now())
      end,
      updated_at = now()
  where id = new.permintaan_service_id
    and status is distinct from target_status;

  return new;
end;
$function$;

drop trigger if exists trg_sync_transport_request_after_service on public.service;
create trigger trg_sync_transport_request_after_service
after insert or update of status on public.service
for each row
execute function public.sync_transport_request_after_service();
