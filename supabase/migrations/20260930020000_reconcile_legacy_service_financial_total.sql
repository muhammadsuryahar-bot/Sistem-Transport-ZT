-- Reconcile a legacy service financial total and fix the approver trigger
-- function so data updates cannot fail because of an unqualified role helper.

create or replace function public.prevent_approver_service_data_change()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if private.has_any_role(ARRAY['ATASAN_TRANSPORT'::user_role, 'DIREKTUR'::user_role]) then
    if new.nomor_service is distinct from old.nomor_service
       or new.permintaan_service_id is distinct from old.permintaan_service_id
       or new.kendaraan_id is distinct from old.kendaraan_id
       or new.tanggal_service is distinct from old.tanggal_service
       or new.kilometer is distinct from old.kilometer
       or new.bengkel is distinct from old.bengkel
       or new.jenis_service is distinct from old.jenis_service
       or new.keluhan is distinct from old.keluhan
       or new.estimasi_biaya is distinct from old.estimasi_biaya
       or new.biaya_aktual is distinct from old.biaya_aktual
       or new.nilai_dpp is distinct from old.nilai_dpp
       or new.ppn is distinct from old.ppn
       or new.total is distinct from old.total
       or new.diproses_oleh is distinct from old.diproses_oleh
       or new.selesai_at is distinct from old.selesai_at
       or new.catatan is distinct from old.catatan
    then
      raise exception 'Approver hanya boleh mengubah status approval service.';
    end if;

    if new.status not in ('DISETUJUI', 'DITOLAK') then
      raise exception 'Approver hanya boleh menetapkan status DISETUJUI atau DITOLAK.';
    end if;

    if private.has_any_role(ARRAY['ATASAN_TRANSPORT'::user_role])
       and coalesce(old.biaya_aktual, old.estimasi_biaya, 0) > 5000000 then
      raise exception 'Service di atas Rp5.000.000 harus di-approve Direktur.';
    end if;

    if private.has_any_role(ARRAY['DIREKTUR'::user_role])
       and coalesce(old.biaya_aktual, old.estimasi_biaya, 0) <= 5000000 then
      raise exception 'Service sampai Rp5.000.000 harus di-approve Atasan Transport.';
    end if;
  end if;
  return new;
end;
$function$;

update public.service
set total = coalesce(nilai_dpp,0) + coalesce(ppn,0),
    updated_at = now()
where nomor_service = 'IMP-SRV-1789959814801-16'
  and abs(coalesce(total,0) - (coalesce(nilai_dpp,0) + coalesce(ppn,0))) > 1;

notify pgrst,'reload schema';
