-- Data-integrity backstop for Transport.
-- These rules prevent invalid negative KM/nominal and impossible replacement records.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kendaraan_kilometer_nonnegatif') THEN
    ALTER TABLE public.kendaraan
      ADD CONSTRAINT kendaraan_kilometer_nonnegatif
      CHECK (kilometer_terakhir IS NULL OR kilometer_terakhir >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_kilometer_nonnegatif') THEN
    ALTER TABLE public.service
      ADD CONSTRAINT service_kilometer_nonnegatif
      CHECK (kilometer IS NULL OR kilometer >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_biaya_nonnegatif') THEN
    ALTER TABLE public.service
      ADD CONSTRAINT service_biaya_nonnegatif
      CHECK (
        (estimasi_biaya IS NULL OR estimasi_biaya >= 0)
        AND (biaya_aktual IS NULL OR biaya_aktual >= 0)
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_item_nominal_nonnegatif') THEN
    ALTER TABLE public.service_item
      ADD CONSTRAINT service_item_nominal_nonnegatif
      CHECK (
        jumlah > 0
        AND (harga_satuan IS NULL OR harga_satuan >= 0)
        AND (subtotal IS NULL OR subtotal >= 0)
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'riwayat_kilometer_nonnegatif') THEN
    ALTER TABLE public.riwayat_kilometer
      ADD CONSTRAINT riwayat_kilometer_nonnegatif
      CHECK (kilometer >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'riwayat_ban_km_nonnegatif') THEN
    ALTER TABLE public.riwayat_ban
      ADD CONSTRAINT riwayat_ban_km_nonnegatif
      CHECK (kilometer IS NULL OR kilometer >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'riwayat_ban_jumlah_positif') THEN
    ALTER TABLE public.riwayat_ban
      ADD CONSTRAINT riwayat_ban_jumlah_positif
      CHECK (jumlah_ban IS NULL OR jumlah_ban > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'riwayat_ban_biaya_nonnegatif') THEN
    ALTER TABLE public.riwayat_ban
      ADD CONSTRAINT riwayat_ban_biaya_nonnegatif
      CHECK (biaya IS NULL OR biaya >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'riwayat_aki_km_nonnegatif') THEN
    ALTER TABLE public.riwayat_aki
      ADD CONSTRAINT riwayat_aki_km_nonnegatif
      CHECK (kilometer IS NULL OR kilometer >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'riwayat_aki_biaya_nonnegatif') THEN
    ALTER TABLE public.riwayat_aki
      ADD CONSTRAINT riwayat_aki_biaya_nonnegatif
      CHECK (biaya IS NULL OR biaya >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'perbaikan_sewa_nominal_nonnegatif') THEN
    ALTER TABLE public.perbaikan_sewa
      ADD CONSTRAINT perbaikan_sewa_nominal_nonnegatif
      CHECK (
        (estimasi_biaya IS NULL OR estimasi_biaya >= 0)
        AND (biaya_aktual IS NULL OR biaya_aktual >= 0)
        AND (jumlah_dipotong IS NULL OR jumlah_dipotong >= 0)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_riwayat_kilometer_kendaraan_tanggal
  ON public.riwayat_kilometer (kendaraan_id, tanggal DESC);

CREATE INDEX IF NOT EXISTS idx_service_approval_service_status
  ON public.service_approval (service_id, status, urutan);

CREATE INDEX IF NOT EXISTS idx_service_bukti_service
  ON public.service_bukti (service_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pembayaran_sewa_status_jatuh_tempo
  ON public.pembayaran_sewa (status, tanggal_jatuh_tempo);

CREATE INDEX IF NOT EXISTS idx_perbaikan_sewa_kontrak_status
  ON public.perbaikan_sewa (kontrak_sewa_id, status, tanggal_kejadian DESC);
