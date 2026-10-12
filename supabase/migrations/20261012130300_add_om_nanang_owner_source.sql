-- Add the owner found on FPD's BM 8241 TM record to the rental-owner lookup.
-- Do not synthesize contact, identity, bank, address, or contract information.
INSERT INTO public.pemilik_sewa
  (jenis_pemilik,nama_pemilik,keterangan,aktif)
SELECT 'PERORANGAN','OM Nanang',
  'Sumber: FPD OPS 01 September 2026.xlsx, sheet STNK DAN KIR baris 16 untuk BM 8241 TM. Nomor kontak, identitas lengkap, rekening, dan kontrak tidak tercantum pada sumber.',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.pemilik_sewa
  WHERE upper(regexp_replace(btrim(nama_pemilik),'[[:space:]]','','g'))='OMNANANG'
);
