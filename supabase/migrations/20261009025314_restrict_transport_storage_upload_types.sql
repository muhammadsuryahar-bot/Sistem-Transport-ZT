-- Keep uploaded business documents private and constrain object types/sizes to the UI's intended use.
-- The app accepts PDFs/images for documents and images for vehicle STNK photos.
update storage.buckets
set file_size_limit = 52428800,
    allowed_mime_types = case
      when name = 'kendaraan' then array[
        'image/jpeg','image/png','image/webp','image/gif','image/avif',
        'image/heic','image/heif','image/bmp','image/tiff'
      ]::text[]
      else array[
        'application/pdf','image/jpeg','image/png','image/webp','image/gif',
        'image/avif','image/heic','image/heif','image/bmp','image/tiff'
      ]::text[]
    end
where name in ('dokumen-kendaraan','dokumen-sewa','kendaraan','service-bukti');
