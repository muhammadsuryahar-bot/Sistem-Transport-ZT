export function isBlankSourceAmount(value) {
  const raw = String(value ?? '').trim()
  return raw === '' || raw === '-'
}

export function historySourcePpnValue(source) {
  // An explicit blank marker means the source cell was blank; do not render a
  // synthetic Rp0. When no raw source value is stored (legacy metadata), use
  // the normalized PPN amount.
  if (source?.ppn_source != null && isBlankSourceAmount(source.ppn_source)) return '-'
  return source?.ppn ?? source?.ppn_source ?? '-'
}

export function historySourceTotalIsBlank(source) {
  // New imports explicitly persist this flag. For existing legacy rows imported
  // before the flag existed, these two source rows are confirmed blank in the
  // original Data Service workbook. Do not override an explicit true/false flag.
  if (typeof source?.total_source_blank === 'boolean') return source.total_source_blank
  return source?.source === 'DATA_SERVICE' && [361, 384].includes(Number(source?.source_no))
}

export function historySourceTotalValue(source, fallback = '-') {
  if (historySourceTotalIsBlank(source)) return '-'
  return source?.total ?? fallback
}
