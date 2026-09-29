-- Complete missing browser-side CRUD RLS for rental payment and rental repair.
-- Owner and contract CRUD are already covered by their existing ALL policies.
-- Keep frontend role rules aligned with RentalFeaturePage.jsx.

drop policy if exists pembayaran_sewa_update_rental on public.pembayaran_sewa;
create policy pembayaran_sewa_update_rental
on public.pembayaran_sewa
for update
using (private.has_any_role(ARRAY['ADMIN'::user_role, 'TRANSPORT'::user_role, 'AKUNTANSI'::user_role]))
with check (private.has_any_role(ARRAY['ADMIN'::user_role, 'TRANSPORT'::user_role, 'AKUNTANSI'::user_role]));

drop policy if exists pembayaran_sewa_delete_rental on public.pembayaran_sewa;
create policy pembayaran_sewa_delete_rental
on public.pembayaran_sewa
for delete
using (private.has_any_role(ARRAY['ADMIN'::user_role, 'TRANSPORT'::user_role, 'AKUNTANSI'::user_role]));

drop policy if exists perbaikan_sewa_update_rental on public.perbaikan_sewa;
create policy perbaikan_sewa_update_rental
on public.perbaikan_sewa
for update
using (private.has_any_role(ARRAY['ADMIN'::user_role, 'TRANSPORT'::user_role]))
with check (private.has_any_role(ARRAY['ADMIN'::user_role, 'TRANSPORT'::user_role]));

drop policy if exists perbaikan_sewa_delete_rental on public.perbaikan_sewa;
create policy perbaikan_sewa_delete_rental
on public.perbaikan_sewa
for delete
using (private.has_any_role(ARRAY['ADMIN'::user_role, 'TRANSPORT'::user_role]));
