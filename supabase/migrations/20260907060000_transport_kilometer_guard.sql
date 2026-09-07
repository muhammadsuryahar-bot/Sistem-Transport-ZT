-- Kilometer master kendaraan tidak boleh diturunkan.
-- Riwayat boleh menyimpan koreksi historis, tetapi angka KM terakhir armada
-- harus selalu monoton naik atau tetap.

CREATE OR REPLACE FUNCTION public.guard_kendaraan_kilometer()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.kilometer_terakhir IS NOT NULL
     AND OLD.kilometer_terakhir IS NOT NULL
     AND NEW.kilometer_terakhir < OLD.kilometer_terakhir THEN
    RAISE EXCEPTION 'Kilometer terakhir kendaraan tidak boleh lebih kecil dari nilai sebelumnya.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_kendaraan_kilometer ON public.kendaraan;
CREATE TRIGGER trg_guard_kendaraan_kilometer
BEFORE UPDATE OF kilometer_terakhir ON public.kendaraan
FOR EACH ROW EXECUTE FUNCTION public.guard_kendaraan_kilometer();
