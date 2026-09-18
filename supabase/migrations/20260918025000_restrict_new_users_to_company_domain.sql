-- Prevent public email/password signups outside the company email domain.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if split_part(lower(coalesce(new.email, '')), '@', 2) <> 'zamanteknindo.com' then
    raise exception 'Pendaftaran hanya diperbolehkan menggunakan email perusahaan.';
  end if;

  insert into public.profiles (
    id,
    nama_lengkap,
    email,
    role,
    aktif
  )
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      split_part(new.email, '@', 1)
    ),
    new.email,
    'OPERASIONAL',
    true
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
