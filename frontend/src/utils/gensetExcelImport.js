import { normalizeGensetInput, validateGensetInput } from './gensetData.js'

const clean = value => String(value ?? '').replace(/\\s+/g, ' ').trim()
const norm = value => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
const upper = value => clean(value).toUpperCase()

const ALIASES = {
  source_no: ['no', 'nomor', 'nomor_urut', 'source_no'],
  merk: ['merk', 'brand'],
  kapasitas_kva: ['kap_kva', 'kapasitas_kva', 'kapasitas', 'kva'],
  engine_no: ['engine_no', 'engine_number', 'no_mesin', 'nomor_mesin'],
  generator_no: ['generator_no', 'generator_number', 'no_generator', 'nomor_generator'],
  lokasi_kerja: ['lokasi_kerja', 'lokasi', 'lokasi_unit'],
  pemilik: ['pemilik', 'nama_pemilik', 'owner'],
  status_kepemilikan: ['status_kepemilikan', 'status', 'kepemilikan'],
  keterangan: ['keterangan', 'catatan', 'notes'],
}

function fieldForHeader(value) {
  const header = norm(value)
  for (const [field, aliases] of Object.entries(ALIASES)) {
    if (aliases.includes(header)) return field
  }
  return null
}

function parsePositiveInteger(value) {
  const raw = clean(value)
  if (!raw) return null
  const numeric = Number(raw.replace(',', '.'))
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null
}

function parseCapacity(value) {
  const raw = clean(value)
  if (!raw) return null
  // KVA values are small capacity values, so a comma is treated as a decimal
  // separator, never as a thousands separator.
  const numeric = Number(raw.replace(',', '.'))
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null
}

function normalizeOwnership(value) {
  const status = upper(value).replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '')
  if (['ASET', 'ASSET', 'MILIK', 'MILIK_KANTOR', 'ASET_KANTOR'].includes(status)) return 'ASET'
  if (['SEWA', 'RENTAL', 'KENDARAAN_SEWA'].includes(status)) return 'SEWA'
  return ''
}

function getValue(values, headers, field) {
  const index = headers.findIndex(header => fieldForHeader(header) === field)
  return index < 0 ? '' : clean(values[index])
}

function reportError(excelRow, message) {
  return `Baris Excel ${excelRow}: ${message}`
}

/**
 * Map the source sheet Data Genset into the exact database payload shape.
 * Any non-empty data row that cannot be validated blocks the whole import;
 * this avoids partial inserts and silently dropped source rows.
 */
export function parseGensetImportSheet(sheet) {
  const inputRows = Array.isArray(sheet?.rows) ? sheet.rows : []
  let header = null
  let headerIndex = -1
  let bestScore = -1

  for (let index = 0; index < Math.min(inputRows.length, 80); index += 1) {
    const values = inputRows[index]?.values || []
    const headers = values.map(value => fieldForHeader(value))
    const unique = new Set(headers.filter(Boolean))
    const score = unique.size
    if (score > bestScore) {
      bestScore = score
      header = values
      headerIndex = index
    }
  }

  const requiredFields = ['source_no', 'merk', 'kapasitas_kva', 'lokasi_kerja', 'pemilik', 'status_kepemilikan']
  const headers = (header || []).map(value => clean(value))
  const missingFields = requiredFields.filter(field => !headers.some(value => fieldForHeader(value) === field))
  if (headerIndex < 0 || missingFields.length > 0) {
    return {
      sheetName: sheet?.name || '',
      headerRow: null,
      dataRows: [],
      rows: [],
      errors: [`Header Data Genset tidak lengkap. Kolom wajib yang hilang: ${missingFields.join(', ') || requiredFields.join(', ')}.`],
    }
  }

  const dataRows = inputRows.slice(headerIndex + 1)
    .filter(row => (row?.values || []).some(value => clean(value)))

  const seenSourceNo = new Map()
  const rows = []
  const errors = []

  for (const row of dataRows) {
    const values = row.values || []
    const sourceNoRaw = getValue(values, headers, 'source_no')
    const sourceNo = parsePositiveInteger(sourceNoRaw)
    const merk = getValue(values, headers, 'merk')
    const capacityRaw = getValue(values, headers, 'kapasitas_kva')
    const capacity = parseCapacity(capacityRaw)
    const statusRaw = getValue(values, headers, 'status_kepemilikan')
    const status = normalizeOwnership(statusRaw)
    const normalized = normalizeGensetInput({
      source_no: sourceNo,
      merk,
      kapasitas_kva: capacity,
      engine_no: getValue(values, headers, 'engine_no'),
      generator_no: getValue(values, headers, 'generator_no'),
      lokasi_kerja: getValue(values, headers, 'lokasi_kerja'),
      pemilik: getValue(values, headers, 'pemilik'),
      status_kepemilikan: status,
      keterangan: getValue(values, headers, 'keterangan'),
    })

    const rowErrors = []
    if (sourceNo == null) rowErrors.push('No sumber wajib bilangan bulat positif.')
    else if (seenSourceNo.has(sourceNo)) rowErrors.push(`No sumber ${sourceNo} duplikat dalam file (juga baris Excel ${seenSourceNo.get(sourceNo)}).`)
    else seenSourceNo.set(sourceNo, row.excelRow ?? '?')
    if (!merk) rowErrors.push('Merk wajib diisi.')
    if (capacity == null) rowErrors.push(`Kapasitas KVA tidak valid: “${capacityRaw || '(kosong)'}”.`)
    if (!status) rowErrors.push(`Status kepemilikan tidak dikenal: “${statusRaw || '(kosong)'}”; gunakan Aset atau Sewa.`)

    const formError = validateGensetInput(normalized)
    if (formError && !rowErrors.some(message => message.includes(formError))) rowErrors.push(formError)

    for (const message of rowErrors) {
      errors.push(reportError(row.excelRow ?? '?', message))
    }

    rows.push({
      ...normalized,
      source_row: Number.isInteger(Number(row.excelRow)) ? Number(row.excelRow) : null,
      source_no_raw: sourceNoRaw,
      kapasitas_kva_raw: capacityRaw,
      status_kepemilikan_raw: statusRaw,
      source_errors: rowErrors,
    })
  }

  return {
    sheetName: sheet?.name || '',
    headerRow: inputRows[headerIndex]?.excelRow ?? headerIndex + 1,
    dataRows,
    rows,
    errors,
  }
}
