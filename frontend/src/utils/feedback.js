const DEFAULT_FALLBACK = 'Operasi tidak dapat diproses. Silakan coba lagi.'

export function humanizeError(error, fallback = DEFAULT_FALLBACK) {
  const code = String(error?.code ?? error?.statusCode ?? error?.status ?? '').trim()
  const raw = typeof error === 'string' ? error : error?.message
  const message = String(raw ?? '').trim()
  const context = `${code} ${message}`.toLowerCase()

  if (!message) return fallback
  if (code === '23505' || /duplicate key|unique constraint|already exists/i.test(message)) {
    return 'Data dengan identitas yang sama sudah ada. Periksa nomor atau data kunci lalu coba lagi.'
  }
  if (code === '23503' || /foreign key constraint|violates foreign key/i.test(message)) {
    return 'Data masih terhubung dengan data lain sehingga tindakan ini tidak dapat dilakukan.'
  }
  if (code === '42501' || /row-level security|permission denied|not authorized|forbidden/i.test(context)) {
    return 'Anda tidak memiliki izin untuk melakukan tindakan ini.'
  }
  if (code === 'PGRST116' || /no rows|0 rows/i.test(message)) {
    return 'Data tidak ditemukan atau sudah berubah. Muat ulang data lalu coba lagi.'
  }
  if (/failed to fetch|networkerror|network request failed|fetch failed|timeout/i.test(message)) {
    return 'Koneksi ke server gagal. Periksa koneksi internet lalu coba lagi.'
  }
  if (/jwt|token.*expired|session.*expired/i.test(message)) {
    return 'Sesi login sudah berakhir. Silakan login kembali.'
  }
  if (/storage|bucket|object not found|file.*not found/i.test(message)) {
    return 'File tidak dapat diproses. Periksa file dan akses penyimpanan lalu coba lagi.'
  }
  if (/not-null constraint|null value|violates check constraint|invalid input syntax/i.test(message)) {
    return 'Data yang dimasukkan belum lengkap atau tidak sesuai format yang diizinkan.'
  }
  return message.length > 240 ? fallback : message
}
