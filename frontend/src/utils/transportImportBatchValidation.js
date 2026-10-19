const LABELS = {
  pengajuan: 'Pengajuan Service',
  sewa: 'Kendaraan Sewa',
}

/**
 * Prevent importers from saving only the valid subset of a source workbook.
 * Duplicate rows are handled separately as skips; rows sent here are validation errors.
 */
export function assertNoInvalidTransportRows(context, invalidRows = []) {
  if (!Array.isArray(invalidRows) || invalidRows.length === 0) return

  const label = LABELS[context] || 'Excel'
  const shown = invalidRows.slice(0, 12).map((row, index) => {
    const rowLabel = row?.sourceRow != null ? `baris data ${row.sourceRow}` : `baris data ${index + 1}`
    const plate = String(row?.plate ?? '').trim() || 'No. Polisi kosong'
    const reason = String(row?.reason ?? '').trim() || 'Data tidak valid'
    return `${rowLabel} — ${plate}: ${reason}`
  })
  const remainder = invalidRows.length > shown.length
    ? `; dan ${invalidRows.length - shown.length} baris bermasalah lainnya`
    : ''

  throw new Error(
    `Import ${label} dibatalkan seluruhnya: ${invalidRows.length} baris sumber bermasalah. ${shown.join('; ')}${remainder}. Tidak ada data dari file ini yang disimpan. Perbaiki semua baris bermasalah lalu impor ulang.`,
  )
}
