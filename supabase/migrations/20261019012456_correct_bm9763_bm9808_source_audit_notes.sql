-- Correct source traceability notes for the BM 9763 TO / BM 9808 TO identity conflict.
-- The May vehicle-master sheet contains BM 9763 TO on rows 81 and 87, both with
-- ME35374 / MHKP3BA1JEK081902 and cutoff notes. It does not contain a master row
-- for BM 9808 TO. September FPD's rental sheet includes separate billing entries
-- for both plates, but does not prove BM 9808 TO's physical engine/chassis.
-- This updates audit commentary only. It does not merge/delete records or alter VINs.

DO $$
DECLARE affected_rows integer;
BEGIN
  UPDATE public.kendaraan
  SET keterangan = CASE nomor_polisi
    WHEN 'BM 9763 TO' THEN replace(
      keterangan,
      'KONFLIK NOMOR MESIN/RANGKA: Data Kendaraan 07 Mei 2026.xlsx mencatat engine ME35374 dan chassis MHKP3BA1JEK081902 untuk BM 9763 TO maupun BM 9808 TO. Namun FPD sheet Sewa KEndaraan memiliki tagihan terpisah untuk kedua plat sebagai kendaraan sewa berbeda. Nomor polisi tidak digabung dan VIN tidak diganti; verifikasi dokumen registrasi untuk menentukan mana nomor mesin/rangka yang benar.',
      'KONFLIK SUMBER IDENTITAS BM 9763 TO/BM 9808 TO (diverifikasi ulang 19 Okt 2026): Data Kendaraan 07 Mei 2026.xlsx hanya mencatat BM 9763 TO pada Excel row 81 (No 77) dan row 87 (No 83), keduanya dengan engine ME35374/chassis MHKP3BA1JEK081902 dan catatan cut-off 1 Juli 2025; row 81 tanpa lokasi, row 87 berlokasi Pakning. Workbook master tersebut tidak mencatat BM 9808 TO sebagai kendaraan. FPD OPS 01 September 2026.xlsx, sheet Sewa KEndaraan, memiliki catatan tagihan terpisah untuk kedua plat, tetapi bagian sumber yang ditelaah tidak memberi nomor mesin/rangka BM 9808 TO yang terverifikasi. Dua plat dipertahankan karena tagihan rental terpisah; identitas mesin/rangka BM 9808 TO belum terverifikasi dan harus dicocokkan dengan STNK/BPKB serta kontrak sewa.'
    )
    WHEN 'BM 9808 TO' THEN replace(
      keterangan,
      'KONFLIK NOMOR MESIN/RANGKA: Data Kendaraan 07 Mei 2026.xlsx mencatat engine ME35374 dan chassis MHKP3BA1JEK081902 untuk BM 9808 TO maupun BM 9763 TO. FPD sheet Sewa KEndaraan memiliki tagihan terpisah untuk kedua plat sebagai kendaraan sewa berbeda. Lokasi di master BM 9808 TO tercatat Bengkalis, BM 9763 TO tercatat Pakning. Nomor polisi tidak digabung dan VIN tidak diganti; verifikasi dokumen registrasi untuk menentukan mana nomor mesin/rangka yang benar.',
      'KONFLIK SUMBER IDENTITAS BM 9808 TO/BM 9763 TO (diverifikasi ulang 19 Okt 2026): Data Kendaraan 07 Mei 2026.xlsx tidak memiliki baris master BM 9808 TO; yang ada ialah BM 9763 TO pada Excel row 81 dan row 87 dengan engine ME35374/chassis MHKP3BA1JEK081902. FPD OPS 01 September 2026.xlsx, sheet Sewa KEndaraan, memiliki catatan tagihan terpisah untuk BM 9808 TO dan BM 9763 TO. Lokasi BM 9808 TO di database adalah Bengkalis dan BM 9763 TO Pakning, tetapi lokasi dan nomor mesin/rangka BM 9808 TO belum didukung oleh baris master workbook Mei. Jangan menganggap engine/chassis yang saat ini tersimpan untuk BM 9808 TO sebagai identitas terverifikasi; cocokkan STNK/BPKB dan kontrak sewa.'
    )
    ELSE keterangan
  END,
  updated_at = now()
  WHERE nomor_polisi IN ('BM 9763 TO','BM 9808 TO')
    AND keterangan LIKE '%KONFLIK NOMOR MESIN/RANGKA: Data Kendaraan 07 Mei 2026.xlsx mencatat engine ME35374 dan chassis MHKP3BA1JEK081902%';

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  IF affected_rows <> 2 THEN
    RAISE EXCEPTION 'Expected to correct exactly two BM 9763 TO/BM 9808 TO audit notes, updated % rows', affected_rows;
  END IF;
END $$;
