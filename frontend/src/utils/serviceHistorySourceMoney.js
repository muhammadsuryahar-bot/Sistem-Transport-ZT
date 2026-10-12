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

export function historySourceTotalValue(source, fallback = '-') {
  if (source?.total_source_blank === true) return '-'
  return source?.total ?? fallback
}
