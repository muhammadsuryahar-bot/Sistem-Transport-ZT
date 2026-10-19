const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim()
const SUMMARY_LABELS = /^(?:total|sub\s*total|grand\s*total|jumlah|grand\s*total\s+keseluruhan)$/i

/**
 * Keep every non-empty source record, including rows missing required fields,
 * so the importer can reject or request correction instead of silently dropping it.
 * Aggregate footer rows such as TOTAL are not transactions.
 */
export function selectServiceImportRows(parsedRows = []) {
  return (Array.isArray(parsedRows) ? parsedRows : []).filter(row => {
    const rawValues = Array.isArray(row?.values) ? row.values : []
    if (!rawValues.some(value => clean(value))) return false

    const sourceNo = clean(row?.source_no)
    const hasTransactionIdentity = Boolean(
      clean(row?.nomor_polisi)
      || clean(row?.tanggal)
      || clean(row?.driver)
      || clean(row?.bulan)
      || clean(row?.jenis_pekerjaan)
      || clean(row?.uraian)
      || clean(row?.bengkel)
      || clean(row?.merk)
      || clean(row?.tipe),
    )
    if (SUMMARY_LABELS.test(sourceNo) && !hasTransactionIdentity) return false
    return true
  })
}
