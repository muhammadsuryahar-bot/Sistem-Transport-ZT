-- Reconcile the legacy service transaction whose stored total did not match its DPP + PPN breakdown.
update public.service
set total = coalesce(nilai_dpp,0) + coalesce(ppn,0),
    updated_at = now()
where nomor_service = 'IMP-SRV-1789959814801-16'
  and abs(coalesce(total,0) - (coalesce(nilai_dpp,0) + coalesce(ppn,0))) > 1;

notify pgrst,'reload schema';
