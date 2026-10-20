export function getDocumentSaveFeedback({ editing = false, previousFileCleanupFailed = false } = {}) {
  return {
    success: editing ? 'Dokumen diperbarui.' : 'Dokumen ditambahkan.',
    error: editing && previousFileCleanupFailed
      ? 'Dokumen berhasil diperbarui dan berkas baru sudah terhubung, tetapi berkas lama gagal dibersihkan dari Storage. Perlu pemeriksaan Admin.'
      : '',
  }
}
