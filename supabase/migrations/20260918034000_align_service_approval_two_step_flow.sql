-- Align service approval authority with the documented two-step workflow.
-- First approval is based on the approved estimate. A later approval is
-- required only when the actual cost exceeds the estimate.

create or replace function public.guard_service_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  svc public.service%rowtype;
  approval_count integer;
  approval_amount numeric;
  estimate_amount numeric;
  actual_amount numeric;
  required_role public.user_role;
begin
  if new.status not in ('DISETUJUI','DITOLAK') then
    raise exception 'Approval service harus berstatus DISETUJUI atau DITOLAK.';
  end if;

  select * into svc
  from public.service
  where id = new.service_id
  for update;

  if svc.id is null then
    raise exception 'Service tidak ditemukan.';
  end if;

  if svc.status <> 'MENUNGGU_APPROVAL' then
    raise exception 'Service tidak sedang menunggu approval.';
  end if;

  select count(*)::integer into approval_count
  from public.service_approval
  where service_id = svc.id
    and status = 'DISETUJUI';

  estimate_amount := coalesce(svc.estimasi_biaya, 0);
  actual_amount := coalesce(svc.biaya_aktual, estimate_amount);

  if approval_count = 0 then
    approval_amount := estimate_amount;
  else
    if actual_amount <= estimate_amount then
      raise exception 'Service sudah memiliki approval yang diperlukan.';
    end if;
    approval_amount := actual_amount;
  end if;

  if approval_count >= 2 then
    raise exception 'Jumlah approval service sudah terpenuhi.';
  end if;

  required_role := case
    when approval_amount > 5000000 then 'DIREKTUR'::public.user_role
    else 'ATASAN_TRANSPORT'::public.user_role
  end;

  if not public.has_any_role(ARRAY['ADMIN'::public.user_role, required_role]) then
    raise exception 'Approval untuk nilai % harus diberikan oleh %.', approval_amount, required_role;
  end if;

  new.urutan := approval_count + 1;
  new.jenis_approval := case when required_role = 'DIREKTUR'::public.user_role then 'DIREKTUR' else 'KEPALA_BAGIAN' end;
  new.pemberi_approval := auth.uid();
  new.waktu_approval := coalesce(new.waktu_approval, now());
  return new;
end;
$$;

drop trigger if exists trg_guard_service_approval on public.service_approval;
create trigger trg_guard_service_approval
before insert on public.service_approval
for each row execute function public.guard_service_approval();

revoke execute on function public.guard_service_approval() from public,anon,authenticated;
