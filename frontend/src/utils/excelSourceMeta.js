export const EXCEL_META_PREFIX = 'EXCEL_META:'

export function encodeExcelMeta(meta, note = '') {
  const payload = `${EXCEL_META_PREFIX}${JSON.stringify(meta ?? {})}`
  return note ? `${payload} | ${String(note)}` : payload
}

export function decodeExcelMeta(value) {
  const raw = String(value ?? '')
  if (!raw.startsWith(EXCEL_META_PREFIX)) return { meta: null, note: raw }
  const separator = raw.indexOf(' | ')
  const json = raw.slice(EXCEL_META_PREFIX.length, separator >= 0 ? separator : undefined)
  const note = separator >= 0 ? raw.slice(separator + 3) : ''
  try {
    return { meta: JSON.parse(json), note }
  } catch {
    return { meta: null, note: raw }
  }
}
