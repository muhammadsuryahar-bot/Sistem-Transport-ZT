-- Final master-data integrity rules for Transport.
-- These rules prevent duplicate vehicle identities and invalid rental-owner states.

CREATE UNIQUE INDEX IF NOT EXISTS uq_kendaraan_kode_kendaraan
  ON public.kendaraan (upper(trim(kode_kendaraan)))
  WHERE kode_kendaraan IS NOT NULL AND trim(kode_kendaraan) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_kendaraan_nomor_polisi
  ON public.kendaraan (upper(trim(nomor_polisi)))
  WHERE nomor_polisi IS NOT NULL AND trim(nomor_polisi) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_driver_nomor_sim
  ON public.driver (upper(trim(nomor_sim)))
  WHERE nomor_sim IS NOT NULL AND trim(nomor_sim) <> '';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pemilik_sewa_jenis_rule') THEN
    ALTER TABLE public.pemilik_sewa
      ADD CONSTRAINT pemilik_sewa_jenis_rule
      CHECK (jenis_pemilik IN ('SEWA_PERORANGAN','SEWA_RENTAL'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pemilik_sewa_identitas_rule') THEN
    ALTER TABLE public.pemilik_sewa
      ADD CONSTRAINT pemilik_sewa_identitas_rule
      CHECK (
        (jenis_pemilik = 'SEWA_PERORANGAN' AND trim(COALESCE(nomor_identitas,'')) <> '')
        OR
        (jenis_pemilik = 'SEWA_RENTAL' AND trim(COALESCE(nama_perusahaan,'')) <> '')
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pembayaran_sewa_tanggal_rule') THEN
    ALTER TABLE public.pembayaran_sewa
      ADD CONSTRAINT pembayaran_sewa_tanggal_rule
      CHECK (
        tanggal_pembayaran IS NULL
        OR tanggal_jatuh_tempo IS NULL
        OR tanggal_pembayaran >= tanggal_jatuh_tempo
        OR status IN ('BELUM_LUNAS','TERLAMBAT')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_kendaraan_kepemilikan_status
  ON public.kendaraan (kepemilikan, status);

CREATE INDEX IF NOT EXISTS idx_driver_status_sim_expiry
  ON public.driver (status, masa_berlaku_sim);

CREATE INDEX IF NOT EXISTS idx_kontrak_sewa_tanggal_status
  ON public.kontrak_sewa (tanggal_mulai, tanggal_selesai, status);
