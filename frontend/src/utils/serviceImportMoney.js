import { isBlankSourceAmount } from './serviceHistorySourceMoney.js'
import { roundCurrency } from './serviceMoneyPrecision.js'

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim()

function currencyValue(value) {
  let raw = clean(value)
  if (!raw) return 0
  raw = raw.replace(/^(rp|idr)\.?\s*/i, '').replace(/\s/g, '').replace(/[^0-9,.-]/g, '')
  if (!raw) return 0

  const comma = raw.lastIndexOf(',')
  const dot = raw.lastIndexOf('.')
  if (comma >= 0 && dot >= 0) {
    raw = comma > dot ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,/g, '')
  } else if (comma >= 0) {
    const decimals = raw.length - comma - 1
    raw = decimals === 1 || decimals === 2 ? raw.replace(',', '.') : raw.replace(/,/g, '')
  } else if (dot >= 0) {
    const decimals = raw.length - dot - 1
    if (decimals !== 1 && decimals !== 2) raw = raw.replace(/\./g, '')
  }

  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : 0
}

function parseMoneyBase(value) {
  const raw = clean(value)
  if (!raw || raw === '-') return 0
  return currencyValue(raw)
}

function hasFullRupiahFormat(value) {
  return /^-?\d{1,3}(?:[.]\d{3})+(?:[,]\d+)?$/.test(clean(value))
}

function normalizeMoneyField(value) {
  const raw = clean(value)
  if (!raw || raw === '-') return 0
  const base = parseMoneyBase(raw)
  if (hasFullRupiahFormat(raw)) return roundCurrency(base)

  // The source workbook mixes explicit Indonesian thousand separators with
  // numeric cells formatted as thousands. Keep the original cell alongside
  // this normalized value so every conversion remains auditable.
  return roundCurrency(Number.isFinite(base) && Math.abs(base) < 1000 ? base * 1000 : base)
}

function moneyMatches(left, right) {
  return Math.abs(left - right) <= Math.max(1, Math.abs(right) * 0.001)
}

function ppnCandidates(value) {
  const raw = clean(value)
  if (!raw || raw === '-') return [0]
  const base = parseMoneyBase(raw)
  const candidates = [roundCurrency(base)]
  if (!hasFullRupiahFormat(raw) && Math.abs(base) < 1000) {
    candidates.push(roundCurrency(base * 1000))
  }
  return [...new Set(candidates)]
}

function normalizePpn(dpp, rawPpn, normalizedTotal, totalSourceBlank) {
  if (isBlankSourceAmount(rawPpn)) return 0

  const candidates = ppnCandidates(rawPpn)
  if (!totalSourceBlank) {
    // Prefer the interpretation that reproduces the explicit Total in the
    // workbook. This is source-grounded and avoids assuming every row must
    // satisfy a hard-coded 11% tax rate.
    const matches = candidates
      .filter(candidate => moneyMatches(dpp + candidate, normalizedTotal))
      .sort((a, b) => Math.abs(dpp + a - normalizedTotal) - Math.abs(dpp + b - normalizedTotal))
    if (matches.length) return matches[0]
  }

  // If the source Total cannot disambiguate the scale, normalize the PPN
  // using the same conservative convention as the other source money fields.
  // Any remaining Total mismatch stays visible and blocks import.
  return normalizeMoneyField(rawPpn)
}

export function normalizeServiceMoney({ qty, harga, dpp, ppn, total }) {
  const totalSourceBlank = isBlankSourceAmount(total)
  const normalizedDpp = normalizeMoneyField(dpp)
  const normalizedHarga = normalizeMoneyField(harga)
  const normalizedTotal = totalSourceBlank ? 0 : normalizeMoneyField(total)
  const normalizedPpn = normalizePpn(normalizedDpp, ppn, normalizedTotal, totalSourceBlank)
  const quantity = Number(qty || 0)
  const priceFromDpp = quantity > 0 ? roundCurrency(normalizedDpp / quantity) : normalizedHarga
  const finalHarga = roundCurrency(
    normalizedHarga > 0 && normalizedDpp > 0
      && Math.abs((normalizedHarga * quantity) - normalizedDpp) <= Math.max(1, normalizedDpp * 0.001)
      ? normalizedHarga
      : (priceFromDpp || normalizedHarga),
  )
  const finalDpp = roundCurrency(normalizedDpp || (quantity > 0 ? finalHarga * quantity : 0))
  const finalPpn = roundCurrency(normalizedPpn)
  const derivedTotal = roundCurrency(finalDpp + finalPpn)

  // An explicit source Total is never overwritten merely to make it agree with
  // DPP + PPN. Preserve mismatches for review. Only a genuinely blank source
  // Total uses a derived numeric transaction value, while total_source_blank
  // tells readers that the workbook cell itself was blank.
  const finalTotal = totalSourceBlank ? derivedTotal : normalizedTotal
  return {
    harga_satuan: finalHarga,
    nilai_dpp: finalDpp,
    ppn: finalPpn,
    total: finalTotal,
    ppn_source: clean(ppn) || '-',
    total_source_blank: totalSourceBlank,
  }
}

export function financialBreakdownMatches(row) {
  const dpp = Number(row?.nilai_dpp || 0)
  const ppn = Number(row?.ppn || 0)
  const total = Number(row?.total || 0)
  if (dpp < 0 || ppn < 0 || total < 0) return false
  if (total === 0 && dpp === 0 && ppn === 0) return true
  return moneyMatches(dpp + ppn, total)
}
