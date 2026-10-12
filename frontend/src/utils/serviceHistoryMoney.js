export function historyNumberInput(value) {
  const raw = String(value ?? '').trim()
  if (!raw || raw === '-') return ''
  const normalized = raw.replace(/[^\\d,.-]/g, '')
  const comma = normalized.lastIndexOf(',')
  const dot = normalized.lastIndexOf('.')
  if (comma >= 0 && dot >= 0) {
    return comma > dot
      ? normalized.replace(/\\./g, '').replace(',', '.')
      : normalized.replace(/,/g, '')
  }
  if (comma >= 0) return normalized.replace(/\\./g, '').replace(',', '.')
  if (/^-?\\d{1,3}(?:\\.\\d{3})+$/.test(normalized)) return normalized.replace(/\\./g, '')
  if ((normalized.match(/\\./g) || []).length > 1) return normalized.replace(/\\./g, '')
  return normalized
}

export function normalizeHistoryPpn(dppValue, rawPpnValue) {
  const raw = String(rawPpnValue ?? '').trim()
  if (!raw || raw === '-') return 0
  const base = Number(historyNumberInput(raw))
  if (!Number.isFinite(base) || base < 0) return Number.NaN

  const isFullRupiahFormat = /^-?\\d{1,3}(?:[.]\\d{3})+(?:[, ]\\d+)?$/.test(raw.replace(/\\s/g, ''))
  const candidates = [base]
  if (!isFullRupiahFormat && Math.abs(base) < 1000) candidates.push(base * 1000)

  const dpp = Number(dppValue || 0)
  const expectedPpn = dpp * 0.11
  return candidates.reduce((best, candidate) =>
    Math.abs(candidate - expectedPpn) < Math.abs(best - expectedPpn) ? candidate : best, candidates[0])
}
