-- Reconcile the single 2018 asset whose main-master plate/model conflict
-- with the STNK and newer operational sources. Engine/chassis identifiers match
-- a Mitsubishi Colt platform; do not create a second vehicle for the alternate plate.
DO $$
DECLARE
  v_vehicle_id bigint;
BEGIN
  SELECT id INTO v_vehicle_id
  FROM public.kendaraan
  WHERE upper(regexp_replace(nomor_polisi, '[[:space:]]', '', 'g')) IN ('BM9960TM', 'BM9960TW')
  ORDER BY CASE WHEN upper(regexp_replace(nomor_polisi, '[[:space:]]', '', 'g')) = 'BM9960TM' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_vehicle_id IS NULL THEN
    RAISE EXCEPTION 'Cannot reconcile BM 9960: source vehicle record was not found.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.kendaraan k
    WHERE k.id <> v_vehicle_id
      AND upper(regexp_replace(k.nomor_polisi, '[[:space:]]', '', 'g')) = 'BM9960TW'
  ) THEN
    RAISE EXCEPTION 'Cannot reconcile BM 9960: a separate BM 9960 TW vehicle already exists; manual review is required.';
  END IF;

  UPDATE public.kendaraan
  SET kode_kendaraan = 'KND-BM9960TW',
      nomor_polisi = 'BM 9960 TW',
      merk = 'Mitsubishi',
      tipe = 'Colt.120 S/P.U',
      keterangan = CASE
        WHEN coalesce(keterangan, '') LIKE '%Rekonsiliasi identitas: master Data Kendaraan 07 Mei 2026%'
          THEN keterangan
        ELSE concat_ws(' | ',
          NULLIF(btrim(keterangan), ''),
          'Rekonsiliasi identitas: master Data Kendaraan 07 Mei 2026 memuat BM 9960 TM/Merk Daihatsu, tetapi No. Mesin 4G15S76333 dan No. Rangka MK2U5TU2EJK011885 konsisten dengan Mitsubishi. Sheet STNK pada workbook tersebut baris 29 dan FPD OPS 01 September 2026.xlsx sheet STNK DAN KIR baris 35 sama-sama mencatat BM 9960 TW, Mitsubishi Colt.120 S/P.U, tahun 2018, STNK 06 Okt 2026, dan 5 Tahun 06 Okt 2028. Dipertahankan satu record kendaraan, bukan menduplikasi TM dan TW.'
        )
      END,
      updated_at = now()
  WHERE id = v_vehicle_id;

  UPDATE public.dokumen_kendaraan
  SET keterangan = CASE
    WHEN coalesce(keterangan, '') LIKE '%Identitas kendaraan direkonsiliasi ke BM 9960 TW%'
      THEN keterangan
    ELSE concat_ws(' | ', NULLIF(btrim(keterangan), ''),
      'Identitas kendaraan direkonsiliasi ke BM 9960 TW/Mitsubishi berdasarkan sheet STNK baris 29 dan FPD OPS 01 September 2026.xlsx sheet STNK DAN KIR baris 35; sumber utama master memuat konflik TM/Daihatsu.')
  END,
  updated_at = now()
  WHERE kendaraan_id = v_vehicle_id AND jenis_dokumen='PAJAK';

  INSERT INTO public.dokumen_kendaraan
    (kendaraan_id, jenis_dokumen, tanggal_jatuh_tempo, keterangan)
  SELECT v_vehicle_id, 'STNK', DATE '2026-10-06',
    'SOURCE_EXCEL: Data Kendaraan 07 Mei 2026.xlsx | STNK baris 29; cocok dengan FPD OPS 01 September 2026.xlsx | STNK DAN KIR baris 35. Nomor polisi terselaraskan menjadi BM 9960 TW.'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.dokumen_kendaraan d
    WHERE d.kendaraan_id=v_vehicle_id AND d.jenis_dokumen='STNK'
  );

  INSERT INTO public.dokumen_kendaraan
    (kendaraan_id, jenis_dokumen, tanggal_jatuh_tempo, keterangan)
  SELECT v_vehicle_id, '5_TAHUNAN', DATE '2028-10-06',
    'SOURCE_EXCEL: Data Kendaraan 07 Mei 2026.xlsx | STNK baris 29; cocok dengan FPD OPS 01 September 2026.xlsx | STNK DAN KIR baris 35. Nomor polisi terselaraskan menjadi BM 9960 TW.'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.dokumen_kendaraan d
    WHERE d.kendaraan_id=v_vehicle_id AND d.jenis_dokumen='5_TAHUNAN'
  );
END;
$$;
