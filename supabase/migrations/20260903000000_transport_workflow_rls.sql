-- Transport workflow RLS
-- Run this migration in the Supabase SQL Editor after the related tables exist.

alter table if exists public.service enable row level security;
alter table if exists public.service_item enable row level security;
alter table if exists public.service_approval enable row level security;
alter table if exists public.service_bukti enable row level security;
alter table if exists public.permintaan_service_bukti enable row level security;
alter table if exists public.dokumen_kendaraan enable row level security;
alter table if exists public.riwayat_kilometer enable row level security;
alter table if exists public.riwayat_ban enable row level security;
alter table if exists public.riwayat_aki enable row level security;
alter table if exists public.pemilik_sewa enable row level security;
alter table if exists public.kontrak_sewa enable row level security;
alter table if exists public.pembayaran_sewa enable row level security;
alter table if exists public.perbaikan_sewa enable row level security;
alter table if exists public.potongan_pembayaran_sewa enable row level security;

-- Service workflow
 drop policy if exists service_select_authenticated on public.service;
 create policy service_select_authenticated on public.service for select to authenticated using (true);
 drop policy if exists service_insert_transport on public.service;
 create policy service_insert_transport on public.service for insert to authenticated with check (public.has_any_role(array['ADMIN','TRANSPORT']::public.user_role[]));
 drop policy if exists service_update_transport on public.service;
 create policy service_update_transport on public.service for update to authenticated using (public.has_any_role(array['ADMIN','TRANSPORT']::public.user_role[])) with check (public.has_any_role(array['ADMIN','TRANSPORT']::public.user_role[]));

-- Service detail, approvals and evidence
 drop policy if exists service_item_select_authenticated on public.service_item;
 create policy service_item_select_authenticated on public.service_item for select to authenticated using (true);
 drop policy if exists service_item_write_transport on public.service_item;
 create policy service_item_write_transport on public.service_item for all to authenticated using (public.has_any_role(array['ADMIN','TRANSPORT']::public.user_role[])) with check (public.has_any_role(array['ADMIN','TRANSPORT']::public.user_role[]));

 drop policy if exists service_approval_select_authenticated on public.service_approval;
 create policy service_approval_select_authenticated on public.service_approval for select to authenticated using (true);
 drop policy if exists service_approval_insert_approver on public.service_approval;
 create policy service_approval_insert_approver on public.service_approval for insert to authenticated with check (public.has_any_role(array['ADMIN','ATASAN_TRANSPORT','DIREKTUR']::public.user_role[]));
 drop policy if exists service_approval_update_approver on public.service_approval;
 create policy service_approval_update_approver on public.service_approval for update to authenticated using (public.has_any_role(array['ADMIN','ATASAN_TRANSPORT','DIREKTUR']::public.user_role[])) with check (public.has_any_role(array['ADMIN','ATASAN_TRANSPORT','DIREKTUR']::public.user_role[]));

 drop policy if exists service_bukti_select_authenticated on public.service_bukti;
 create policy service_bukti_select_authenticated on public.service_bukti for select to authenticated using (true);
 drop policy if exists service_bukti_write_transport on public.service_bukti;
 create policy service_bukti_write_transport on public.service_bukti for all to authenticated using (public.has_any_role(array['ADMIN','TRANSPORT']::public.user_role[])) with check (public.has_any_role(array['ADMIN','TRANSPORT']::public.user_role[]));

 drop policy if exists permintaan_service_bukti_select_authenticated on public.permintaan_service_bukti;
 create policy permintaan_service_bukti_select_authenticated on public.permintaan_service_bukti for select to authenticated using (true);
 drop policy if exists permintaan_service_bukti_write_requester_transport on public.permintaan_service_bukti;
 create policy permintaan_service_bukti_write_requester_transport on public.permintaan_service_bukti for all to authenticated using (public.has_any_role(array['ADMIN','TRANSPORT','OPERASIONAL']::public.user_role[])) with check (public.has_any_role(array['ADMIN','TRANSPORT','OPERASIONAL']::public.user_role[]));

-- Vehicle records and history
 drop policy if exists dokumen_kendaraan_select_authenticated on public.dokumen_kendaraan;
 create policy dokumen_kendaraan_select_authenticated on public.dokumen_kendaraan for select to authenticated using (true);
 drop policy if exists dokumen_kendaraan_write_transport on public.dokumen_kendaraan;
 create policy dokumen_kendaraan_write_transport on public.dokumen_kendaraan for all to authenticated using (public.has_any_role(array['ADMIN','TRANSPORT']::public.user_role[])) with check (public.has_any_role(array['ADMIN','TRANSPORT']::public.user_role[]));

 drop policy if exists riwayat_kilometer_select_authenticated on public.riwayat_kilometer;
 create policy riwayat_kilometer_select_authenticated on public.riwayat_kilometer for select to authenticated using (true);
 drop policy if exists riwayat_kilometer_write_transport on public.riwayat_kilometer;
 create policy riwayat_kilometer_write_transport on public.riwayat_kilometer for all to authenticated using (public.has_any_role(array['ADMIN','TRANSPORT']::public.user_role[])) with check (public.has_any_role(array['ADMIN','TRANSPORT']::public.user_role[]));

 drop policy if exists riwayat_ban_select_authenticated on public.riwayat_ban;
 create policy riwayat_ban_select_authenticated on public.riwayat_ban for select to authenticated using (true);
 drop policy if exists riwayat_ban_write_transport on public.riwayat_ban;
 create policy riwayat_ban_write_transport on public.riwayat_ban for all to authenticated using (public.has_any_role(array['ADMIN','TRANSPORT']::public.user_role[])) with check (public.has_any_role(array['ADMIN','TRANSPORT']::public.user_role[]));

 drop policy if exists riwayat_aki_select_authenticated on public.riwayat_aki;
 create policy riwayat_aki_select_authenticated on public.riwayat_aki for select to authenticated using (true);
 drop policy if exists riwayat_aki_write_transport on public.riwayat_aki;
 create policy riwayat_aki_write_transport on public.riwayat_aki for all to authenticated using (public.has_any_role(array['ADMIN','TRANSPORT']::public.user_role[])) with check (public.has_any_role(array['ADMIN','TRANSPORT']::public.user_role[]));

-- Rental and payment workflow
 drop policy if exists pemilik_sewa_select_authenticated on public.pemilik_sewa;
 create policy pemilik_sewa_select_authenticated on public.pemilik_sewa for select to authenticated using (true);
 drop policy if exists pemilik_sewa_write_rental on public.pemilik_sewa;
 create policy pemilik_sewa_write_rental on public.pemilik_sewa for all to authenticated using (public.has_any_role(array['ADMIN','TRANSPORT','AKUNTANSI']::public.user_role[])) with check (public.has_any_role(array['ADMIN','TRANSPORT','AKUNTANSI']::public.user_role[]));

 drop policy if exists kontrak_sewa_select_authenticated on public.kontrak_sewa;
 create policy kontrak_sewa_select_authenticated on public.kontrak_sewa for select to authenticated using (true);
 drop policy if exists kontrak_sewa_write_rental on public.kontrak_sewa;
 create policy kontrak_sewa_write_rental on public.kontrak_sewa for all to authenticated using (public.has_any_role(array['ADMIN','TRANSPORT','AKUNTANSI']::public.user_role[])) with check (public.has_any_role(array['ADMIN','TRANSPORT','AKUNTANSI']::public.user_role[]));

 drop policy if exists pembayaran_sewa_select_authenticated on public.pembayaran_sewa;
 create policy pembayaran_sewa_select_authenticated on public.pembayaran_sewa for select to authenticated using (true);
 drop policy if exists pembayaran_sewa_write_finance on public.pembayaran_sewa;
 create policy pembayaran_sewa_write_finance on public.pembayaran_sewa for all to authenticated using (public.has_any_role(array['ADMIN','TRANSPORT','AKUNTANSI']::public.user_role[])) with check (public.has_any_role(array['ADMIN','TRANSPORT','AKUNTANSI']::public.user_role[]));

 drop policy if exists perbaikan_sewa_select_authenticated on public.perbaikan_sewa;
 create policy perbaikan_sewa_select_authenticated on public.perbaikan_sewa for select to authenticated using (true);
 drop policy if exists perbaikan_sewa_write_transport on public.perbaikan_sewa;
 create policy perbaikan_sewa_write_transport on public.perbaikan_sewa for all to authenticated using (public.has_any_role(array['ADMIN','TRANSPORT']::public.user_role[])) with check (public.has_any_role(array['ADMIN','TRANSPORT']::public.user_role[]));

 drop policy if exists potongan_pembayaran_sewa_select_authenticated on public.potongan_pembayaran_sewa;
 create policy potongan_pembayaran_sewa_select_authenticated on public.potongan_pembayaran_sewa for select to authenticated using (true);
 drop policy if exists potongan_pembayaran_sewa_write_finance on public.potongan_pembayaran_sewa;
 create policy potongan_pembayaran_sewa_write_finance on public.potongan_pembayaran_sewa for all to authenticated using (public.has_any_role(array['ADMIN','TRANSPORT','AKUNTANSI']::public.user_role[])) with check (public.has_any_role(array['ADMIN','TRANSPORT','AKUNTANSI']::public.user_role[]));
