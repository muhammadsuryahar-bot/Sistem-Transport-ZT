-- Prevent an authenticated user from changing their own authorization role or active status.
-- UI checks are not a security boundary; enforce this directly at the database layer.
-- Contact/name fields may still be edited if the applicable RLS policy permits them.

create or replace function private.guard_profile_self_role_status()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private
as $$
begin
  if auth.uid() is not null
     and auth.uid() = old.id
     and (
       new.role is distinct from old.role
       or new.aktif is distinct from old.aktif
     )
  then
    raise exception using
      errcode = '42501',
      message = 'Anda tidak dapat mengubah role atau status akun sendiri.';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_profile_self_role_status() from public, anon, authenticated;

drop trigger if exists guard_profile_self_role_status on public.profiles;
create trigger guard_profile_self_role_status
before update of role, aktif on public.profiles
for each row
execute function private.guard_profile_self_role_status();
