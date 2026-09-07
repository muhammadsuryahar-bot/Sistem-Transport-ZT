-- Business-rule constraints for Transport.
-- These constraints backstop the UI so critical rules are also enforced in PostgreSQL.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kendaraan_kepemilikan_rule') THEN
    ALTER TABLE public.kendaraan
      ADD CONSTRAINT kendaraan_kepemilikan_rule
      CHECK (kepemilikan IN ('ASET_KANTOR','SEWA'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kendaraan_jenis_sewa_rule') THEN
    ALTER TABLE public.kendaraan
      ADD CONSTRAINT kendaraan_jenis_sewa_rule
      CHECK (
        (kepemilikan = 'SEWA' AND jenis_sewa IN ('SEWA_PERORANGAN','SEWA_RENTAL'))
        OR
        (kepemilikan = 'ASET_KANTOR' AND (jenis_sewa IS NULL OR jenis_sewa = ''))
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kontrak_sewa_periode_6_bulan') THEN
    ALTER TABLE public.kontrak_sewa
      ADD CONSTRAINT kontrak_sewa_periode_6_bulan
      CHECK (periode_bulan = 6);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kontrak_sewa_nilai_bulanan_nonnegatif') THEN
    ALTER TABLE public.kontrak_sewa
      ADD CONSTRAINT kontrak_sewa_nilai_bulanan_nonnegatif
      CHECK (nilai_sewa_bulanan >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pembayaran_sewa_periode_1_6') THEN
    ALTER TABLE public.pembayaran_sewa
      ADD CONSTRAINT pembayaran_sewa_periode_1_6
      CHECK (periode_ke BETWEEN 1 AND 6);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pembayaran_sewa_nominal_nonnegatif') THEN
    ALTER TABLE public.pembayaran_sewa
      ADD CONSTRAINT pembayaran_sewa_nominal_nonnegatif
      CHECK (jumlah_tagihan >= 0 AND jumlah_dibayar >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'potongan_sewa_nominal_positif') THEN
    ALTER TABLE public.potongan_pembayaran_sewa
      ADD CONSTRAINT potongan_sewa_nominal_positif
      CHECK (jumlah_potongan > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'perbaikan_sewa_potongan_consistency') THEN
    ALTER TABLE public.perbaikan_sewa
      ADD CONSTRAINT perbaikan_sewa_potongan_consistency
      CHECK (
        (dapat_dipotong = false AND COALESCE(jumlah_dipotong,0) = 0)
        OR
        (dapat_dipotong = true AND dibayar_kantor = true AND COALESCE(jumlah_dipotong,0) > 0)
      );
  END IF;
END $$;

-- Prevent the same rental contract from receiving the same monthly period twice.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pembayaran_sewa_kontrak_periode
  ON public.pembayaran_sewa (kontrak_sewa_id, periode_ke);

-- Avoid duplicate active ownership records for the same rental vehicle/contract start.
CREATE INDEX IF NOT EXISTS idx_kontrak_sewa_kendaraan_status
  ON public.kontrak_sewa (kendaraan_id, status, tanggal_mulai);

CREATE INDEX IF NOT EXISTS idx_service_status_biaya
  ON public.service (status, estimasi_biaya, biaya_aktual);

CREATE INDEX IF NOT EXISTS idx_dokumen_kendaraan_jatuh_tempo
  ON public.dokumen_kendaraan (tanggal_jatuh_tempo);
