const IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/heic',
  'image/heif',
  'image/bmp',
  'image/tiff',
]

const MIME_BY_EXTENSION = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.jfif': 'image/jpeg',
  '.jpe': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.bmp': 'image/bmp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
}

const DOCUMENT_MIME_TYPES = new Set(['application/pdf', ...IMAGE_MIME_TYPES])
const IMAGE_MIME_TYPE_SET = new Set(IMAGE_MIME_TYPES)
const GENERIC_MIME_TYPES = new Set(['', 'application/octet-stream', 'binary/octet-stream'])

export const MAX_STORAGE_UPLOAD_BYTES = 50 * 1024 * 1024
export const IMAGE_UPLOAD_ACCEPT = IMAGE_MIME_TYPES.join(',')
export const DOCUMENT_UPLOAD_ACCEPT = ['application/pdf', ...IMAGE_MIME_TYPES].join(',')

export function validateStorageUploadFile(file, { imagesOnly = false } = {}) {
  if (!file) return null

  if (!Number.isFinite(file.size) || file.size < 0) {
    throw new Error('Ukuran file tidak dapat diperiksa. Pilih file lain.')
  }

  if (file.size > MAX_STORAGE_UPLOAD_BYTES) {
    throw new Error('Ukuran file maksimal 50 MiB. Pilih file yang lebih kecil.')
  }

  const extension = file.name?.match(/\.[^.]+$/)?.[0]?.toLowerCase() || ''
  const extensionMime = MIME_BY_EXTENSION[extension]
  const detectedMime = String(file.type || '').toLowerCase()
  const allowedTypes = imagesOnly ? IMAGE_MIME_TYPE_SET : DOCUMENT_MIME_TYPES

  if (extension && !extensionMime) {
    throw new Error('Ekstensi file tidak didukung. Pilih PDF atau format gambar yang diizinkan.')
  }

  if (extensionMime && !GENERIC_MIME_TYPES.has(detectedMime) && detectedMime !== extensionMime) {
    throw new Error('Tipe file tidak cocok dengan ekstensinya. Pilih file yang benar lalu coba lagi.')
  }

  const contentType = extensionMime || detectedMime

  if (!allowedTypes.has(contentType)) {
    const expected = imagesOnly
      ? 'JPG, PNG, WEBP, GIF, AVIF, HEIC, HEIF, BMP, atau TIFF'
      : 'PDF atau gambar JPG, PNG, WEBP, GIF, AVIF, HEIC, HEIF, BMP, atau TIFF'
    throw new Error(`Format file tidak didukung. Gunakan ${expected}.`)
  }

  return contentType
}
