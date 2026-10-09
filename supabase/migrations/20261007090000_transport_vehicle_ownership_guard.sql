-- Enforce the business rule that every rented vehicle has an explicit owner.
-- ASET vehicles may leave owner empty; SEWA vehicles may not.
alter table public.kendaraan
  drop constraint if exists kendaraan_sewa_owner_required;

alter table public.kendaraan
  add constraint kendaraan_sewa_owner_required
  check (
    kepemilikan <> 'SEWA'
    or nullif(btrim(pemilik), '') is not null
  );
