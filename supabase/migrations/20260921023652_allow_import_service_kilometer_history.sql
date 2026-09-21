CREATE OR REPLACE FUNCTION public.guard_vehicle_kilometer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  current_km numeric;
begin
  if new.sumber = 'IMPORT_SERVICE' then
    return new;
  end if;

  select coalesce(kilometer_terakhir,0)
    into current_km
  from public.kendaraan
  where id = new.kendaraan_id
  for update;

  if current_km is null then current_km := 0; end if;

  if new.kilometer < current_km then
    raise exception 'KM baru tidak boleh lebih kecil dari KM terakhir kendaraan (%).', current_km;
  end if;

  return new;
end;
$function$;

ALTER TABLE public.riwayat_kilometer
  DROP CONSTRAINT IF EXISTS riwayat_kilometer_sumber_check;

ALTER TABLE public.riwayat_kilometer
  ADD CONSTRAINT riwayat_kilometer_sumber_check
  CHECK (sumber = ANY (ARRAY[
    'MANUAL'::text,
    'SERVICE'::text,
    'PERMINTAAN'::text,
    'PEMERIKSAAN'::text,
    'LAINNYA'::text,
    'IMPORT_SERVICE'::text
  ]));
