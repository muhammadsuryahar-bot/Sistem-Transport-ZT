export function getDocumentAttachmentStatus(document) {
  const filePath = String(document?.file_path ?? '').trim()
  if (filePath) {
    return {
      key: 'linked',
      label: 'Lampiran tercatat',
      message: 'Tautan berkas tercatat. Gunakan tombol Lihat File untuk memastikan berkas dapat dibuka.',
    }
  }

  const notes = String(document?.keterangan ?? '')
  if (notes.includes('EXCEL_META:')) {
    return {
      key: 'metadata-only',
      label: 'Metadata Excel saja',
      message: 'Catatan ini berasal dari impor Excel; file fisik (PDF/foto) belum diunggah ke penyimpanan.',
    }
  }

  return {
    key: 'missing',
    label: 'Lampiran belum diunggah',
    message: 'Belum ada berkas fisik yang dilampirkan pada catatan dokumen ini.',
  }
}
