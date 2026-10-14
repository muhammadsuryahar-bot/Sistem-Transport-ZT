const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim()
const upper = value => clean(value).toUpperCase()
const normalizePlate = value => upper(value).replace(/\s+/g, ' ')
const normalizeIdentity = value => upper(value).replace(/[^A-Z0-9]/g, '')

const IDENTITY_FIELDS = ['merk', 'tipe', 'jenis', 'tahun', 'nomor_mesin', 'nomor_rangka', 'pemilik', 'kepemilikan', 'driver', 'lokasi', 'unit_kerja', 'masa_pajak', 'status_pajak']

function normalizedFieldValue(value, field) {
  if (field === 'nomor_mesin' || field === 'nomor_rangka') return normalizeIdentity(value)
  if (field === 'tahun') return clean(value).replace(/\.0+$/, '')
  return upper(value).replace(/\s+/g, ' ')
}

/**
 * Finds identity conflicts in a vehicle workbook before it is written.
 * Empty source values do not conflict with a populated value; two different
 * populated identity values do. Cross-plate engine/chassis reuse is blocked
 * because it can attach documents and service history to the wrong vehicle.
 */
export function analyzeVehicleImportIntegrity(rows = []) {
  const byPlate = new Map()
  for (const row of rows) {
    const plate = normalizePlate(row?.nomor_polisi)
    if (!plate) continue
    if (!byPlate.has(plate)) byPlate.set(plate, [])
    byPlate.get(plate).push(row)
  }

  const duplicatePlateConflicts = []
  for (const [plate, group] of byPlate) {
    if (group.length < 2) continue
    const fields = IDENTITY_FIELDS.filter(field => {
      const values = new Set(group.map(row => normalizedFieldValue(row?.[field], field)).filter(Boolean))
      return values.size > 1
    })
    if (fields.length) {
      duplicatePlateConflicts.push({
        plate,
        rows: group.map(row => row.excelRow).filter(row => row != null).sort((a, b) => a - b),
        fields,
      })
    }
  }

  const pairMap = new Map()
  for (const field of ['nomor_mesin', 'nomor_rangka']) {
    const byIdentifier = new Map()
    for (const row of rows) {
      const identifier = normalizeIdentity(row?.[field])
      const plate = normalizePlate(row?.nomor_polisi)
      if (!identifier || !plate) continue
      if (!byIdentifier.has(identifier)) byIdentifier.set(identifier, new Set())
      byIdentifier.get(identifier).add(plate)
    }
    for (const platesSet of byIdentifier.values()) {
      const plates = [...platesSet].sort()
      if (plates.length < 2) continue
      for (let left = 0; left < plates.length; left += 1) {
        for (let right = left + 1; right < plates.length; right += 1) {
          const key = `${plates[left]}::${plates[right]}`
          if (!pairMap.has(key)) pairMap.set(key, { plates: [plates[left], plates[right]], fields: new Set() })
          pairMap.get(key).fields.add(field)
        }
      }
    }
  }

  const crossVehicleConflicts = [...pairMap.values()].map(pair => ({
    plates: pair.plates,
    fields: [...pair.fields],
  }))

  return {
    duplicatePlateConflicts,
    crossVehicleConflicts,
    hasBlockingConflicts: duplicatePlateConflicts.length > 0 || crossVehicleConflicts.length > 0,
  }
}

export function describeVehicleImportIntegrity(report) {
  const messages = []
  for (const conflict of report?.duplicatePlateConflicts || []) {
    const rows = conflict.rows.length ? `baris Excel ${conflict.rows.join(', ')}` : 'beberapa baris sumber'
    messages.push(`${conflict.plate} (${rows}; kolom berbeda: ${conflict.fields.join(', ')})`)
  }
  for (const conflict of report?.crossVehicleConflicts || []) {
    messages.push(`${conflict.plates.join(' ↔ ')} (nomor ${conflict.fields.map(field => field === 'nomor_mesin' ? 'mesin' : 'rangka').join(' dan ')} sama)`)
  }
  return messages
}


/**
 * Compare the incoming workbook with current master data before writes.
 * This prevents an old source plate from being inserted as a second vehicle
 * when its engine/chassis currently belongs to a differently plated record.
 */
/**
 * Compare the incoming workbook with current master data before writes.
 * Prevents cross-plate identifier reuse and overwriting a populated engine/chassis
 * on an existing plate with a different value.
 */
export function analyzeVehicleImportAgainstDatabase(rows = [], existingVehicles = []) {
  const sourceRecords = rows
    .map(row => ({ ...row, __normalizedPlate: normalizePlate(row?.nomor_polisi) }))
    .filter(row => row.__normalizedPlate)
  const existingByPlate = new Map()
  for (const existing of existingVehicles) {
    const plate = normalizePlate(existing?.nomor_polisi)
    if (!plate) continue
    if (!existingByPlate.has(plate)) existingByPlate.set(plate, [])
    existingByPlate.get(plate).push(existing)
  }

  const samePlateDifferences = new Map()
  const crossPlateConflicts = new Map()

  for (const row of sourceRecords) {
    const samePlateRecords = existingByPlate.get(row.__normalizedPlate) || []
    for (const field of ['nomor_mesin', 'nomor_rangka']) {
      const sourceIdentifier = normalizeIdentity(row?.[field])
      if (!sourceIdentifier) continue

      for (const existing of samePlateRecords) {
        const storedIdentifier = normalizeIdentity(existing?.[field])
        if (!storedIdentifier || storedIdentifier === sourceIdentifier) continue
        if (!samePlateDifferences.has(row.__normalizedPlate)) {
          samePlateDifferences.set(row.__normalizedPlate, {
            plate: row.__normalizedPlate,
            fields: new Set(),
            sourceRows: new Set(),
          })
        }
        const issue = samePlateDifferences.get(row.__normalizedPlate)
        issue.fields.add(field)
        if (row.excelRow != null) issue.sourceRows.add(row.excelRow)
      }

      for (const existing of existingVehicles) {
        const existingPlate = normalizePlate(existing?.nomor_polisi)
        if (!existingPlate || existingPlate === row.__normalizedPlate) continue
        const existingIdentifier = normalizeIdentity(existing?.[field])
        if (!existingIdentifier || existingIdentifier !== sourceIdentifier) continue
        const key = `${row.__normalizedPlate}::${existingPlate}`
        if (!crossPlateConflicts.has(key)) {
          crossPlateConflicts.set(key, {
            sourcePlate: row.__normalizedPlate,
            existingPlate,
            fields: new Set(),
            sourceRows: new Set(),
          })
        }
        const issue = crossPlateConflicts.get(key)
        issue.fields.add(field)
        if (row.excelRow != null) issue.sourceRows.add(row.excelRow)
      }
    }
  }

  const normalizeIssue = issue => ({
    ...issue,
    fields: [...issue.fields],
    sourceRows: [...issue.sourceRows].sort((a, b) => a - b),
  })
  const samePlateConflicts = [...samePlateDifferences.values()]
    .map(normalizeIssue)
    .sort((a, b) => a.plate.localeCompare(b.plate))
  const databaseConflicts = [...crossPlateConflicts.values()]
    .map(normalizeIssue)
    .sort((a, b) => a.sourcePlate.localeCompare(b.sourcePlate) || a.existingPlate.localeCompare(b.existingPlate))

  return {
    samePlateConflicts,
    databaseConflicts,
    hasBlockingConflicts: samePlateConflicts.length > 0 || databaseConflicts.length > 0,
  }
}

export function describeVehicleDatabaseConflicts(report) {
  const messages = []
  for (const conflict of report?.samePlateConflicts || []) {
    const identifiers = conflict.fields.map(field => field === 'nomor_mesin' ? 'nomor mesin' : 'nomor rangka').join(' dan ')
    const rows = conflict.sourceRows.length ? ` (baris Excel ${conflict.sourceRows.join(', ')})` : ''
    messages.push(`${conflict.plate}: ${identifiers} pada Excel berbeda dari nilai kendaraan yang sudah tersimpan${rows}`)
  }
  for (const conflict of report?.databaseConflicts || []) {
    const identifiers = conflict.fields.map(field => field === 'nomor_mesin' ? 'nomor mesin' : 'nomor rangka').join(' dan ')
    const rows = conflict.sourceRows.length ? ` (baris Excel ${conflict.sourceRows.join(', ')})` : ''
    messages.push(`${conflict.sourcePlate} vs kendaraan tersimpan ${conflict.existingPlate}: ${identifiers} sama${rows}`)
  }
  return messages
}
