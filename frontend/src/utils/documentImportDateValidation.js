import { excelDate } from './excelDate.js'

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim()
const norm = value => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
const FIELD_ALIASES = {
  nomor_polisi: ['no_polisi', 'nomor_polisi', 'no_pol', 'plat'],
  stnk: ['stnk', 'jatuh_tempo_stnk'],
  lima_tahun: ['5_tahun', '5_tahunan', 'lima_tahun', 'jatuh_tempo_5_tahun'],
  pajak: ['pajak', 'jatuh_tempo_pajak', 'masa_berlaku_pajak', 'tanggal_jatuh_tempo_pajak'],
}
const LABELS = {
  stnk: 'STNK',
  lima_tahun: '5 Tahunan',
  pajak: 'Pajak',
}

function fieldIndex(headers, field) {
  const aliases = FIELD_ALIASES[field]
  return headers.findIndex(header => aliases.includes(norm(header)))
}

function rawCell(row, headers, field) {
  const index = fieldIndex(headers, field)
  return index >= 0 ? clean(row?.values?.[index]) : ''
}

function normalizedSourceDate(raw) {
  const value = clean(raw)
  if (!value) return null

  // XLSX parser returns the underlying serial as text. Process every positive
  // numeric serial, including low serials that excelDate intentionally rejects
  // as likely numbers; we then mark old dates implausible instead of losing them.
  if (/^\d+(?:\.\d+)?$/.test(value)) {
    const serial = Number(value)
    if (!Number.isFinite(serial) || serial <= 0 || serial > 80000) return null
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000)
    if (Number.isNaN(date.getTime())) return null
    return date.toISOString().slice(0, 10)
  }

  return excelDate(value)
}

/**
 * Validate source date cells before any document RPC is called.
 * For expiry dates a year before 2000 or after 2100 must be explicitly reviewed:
 * never silently coerce a wrong numeric Excel serial to a guessed date.
 */
export function validateDocumentSourceDates(sources = []) {
  const issues = []
  for (const source of sources) {
    if (!source || source.header?.index < 0 || !source.sheet) continue
    const headers = source.header.row || []
    const dateFields = source.kind === 'doc' ? ['stnk', 'lima_tahun'] : source.kind === 'tax' ? ['pajak'] : []

    for (const row of source.sheet.rows.slice(source.header.index + 1)) {
      const plate = rawCell(row, headers, 'nomor_polisi').toUpperCase()
      const populatedDateFields = dateFields
        .map(field => ({ field, raw: rawCell(row, headers, field) }))
        .filter(item => item.raw)

      if (!populatedDateFields.length) continue
      if (!plate) {
        issues.push({
          sheet: source.sheet.name || 'Excel',
          excelRow: row.excelRow,
          plate: '',
          field: populatedDateFields.map(item => LABELS[item.field]).join(', '),
          rawValue: populatedDateFields.map(item => item.raw).join(', '),
          reason: 'Tanggal dokumen terisi tetapi No. Polisi kosong.',
        })
        continue
      }

      for (const item of populatedDateFields) {
        const parsed = normalizedSourceDate(item.raw)
        const year = parsed ? Number(parsed.slice(0, 4)) : NaN
        if (!parsed || !Number.isInteger(year) || year < 2000 || year > 2100) {
          issues.push({
            sheet: source.sheet.name || 'Excel',
            excelRow: row.excelRow,
            plate,
            field: LABELS[item.field],
            rawValue: item.raw,
            parsedValue: parsed,
            reason: parsed
              ? `Tanggal hasil baca ${parsed} berada di luar rentang wajar 2000–2100.`
              : 'Nilai tanggal tidak valid atau tidak dapat dibaca sebagai tanggal Excel.',
          })
        }
      }
    }
  }

  return issues
}

export function describeDocumentSourceDateIssues(issues = [], limit = 12) {
  const shown = issues.slice(0, limit).map(issue => {
    const plate = issue.plate || 'No. Polisi kosong'
    return `Sheet “${issue.sheet}”, baris Excel ${issue.excelRow}, ${plate}, ${issue.field}: nilai “${issue.rawValue}” — ${issue.reason}`
  })
  const remainder = issues.length > shown.length ? `; dan ${issues.length - shown.length} masalah tanggal lainnya` : ''
  return shown.join('; ') + remainder
}
