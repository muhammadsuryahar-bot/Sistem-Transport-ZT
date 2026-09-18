drop policy if exists dokumen_kendaraan_delete_manage on public.dokumen_kendaraan;
create policy dokumen_kendaraan_delete_manage
on public.dokumen_kendaraan
for delete
to authenticated
using ((select has_any_role(ARRAY['ADMIN'::user_role,'TRANSPORT'::user_role])));
