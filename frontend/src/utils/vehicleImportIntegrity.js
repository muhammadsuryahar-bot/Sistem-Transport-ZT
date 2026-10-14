const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim()
const upper = value => clean(value).toUpperCase()
const normalizePlate = value => upper(value).replace(/\s+/g, ' ')
const normalizeIdentity = value => upper(value).replace(/[^A-Z0-9]/g, '')

const IDENTITY_FIELDS = ['merk', 'tipe', 'tahun', 'nomor_mesin', 'nomor_rangka', 'pemilik', 'kepemilikan']

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
