const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim()
const upper = value => clean(value).toUpperCase()
const normalizedIdentity = value => upper(value).replace(/[^A-Z0-9]/g, '')
const normalizedPlate = value => upper(value).replace(/\s+/g, ' ')

const REVIEW_MARKERS = /PERLU VERIFIKASI|KONFLIK|DUPLIKASI IDENTITAS|DUPLIKASI SUMBER|ANOMALI SUMBER|KOSONG DI SUMBER|TAHUN KOSONG|NO MESIN\/RANGKA KOSONG|REKONSILIASI DUPLIKASI SUMBER|REKONSILIASI IDENTITAS|REKONSILIASI DARI FPD/i

export function analyzeVehicleIntegrity(vehicles = []) {
  const flagsByVehicle = new Map()
  const identityPairs = new Map()

  const vehicleKey = vehicle => String(vehicle?.id ?? normalizedPlate(vehicle?.nomor_polisi))
  const mark = (vehicle, flag) => {
    const key = vehicleKey(vehicle)
    if (!key) return
    if (!flagsByVehicle.has(key)) flagsByVehicle.set(key, new Set())
    flagsByVehicle.get(key).add(flag)
  }

  const identifierFields = [
    ['nomor_mesin', 'nomor_mesin'],
    ['nomor_rangka', 'nomor_rangka'],
  ]

  for (const [field, flag] of identifierFields) {
    const groups = new Map()
    for (const vehicle of vehicles) {
      const identifier = normalizedIdentity(vehicle?.[field])
      const plate = normalizedPlate(vehicle?.nomor_polisi)
      if (!identifier || !plate) continue
      if (!groups.has(identifier)) groups.set(identifier, new Map())
      if (!groups.get(identifier).has(plate)) groups.get(identifier).set(plate, [])
      groups.get(identifier).get(plate).push(vehicle)
    }

    for (const plates of groups.values()) {
      const plateNames = [...plates.keys()].sort()
      if (plateNames.length < 2) continue
      for (const plate of plateNames) for (const vehicle of plates.get(plate)) mark(vehicle, flag)
      for (let left = 0; left < plateNames.length; left += 1) {
        for (let right = left + 1; right < plateNames.length; right += 1) {
          const pairKey = `${plateNames[left]}::${plateNames[right]}`
          if (!identityPairs.has(pairKey)) identityPairs.set(pairKey, { plates: [plateNames[left], plateNames[right],], fields: new Set() })
          identityPairs.get(pairKey).fields.add(flag)
        }
      }
    }
  }

  for (const vehicle of vehicles) {
    const note = [vehicle?.keterangan, vehicle?.catatan_hutang].filter(Boolean).join(' ')
    if (REVIEW_MARKERS.test(note)) mark(vehicle, 'source_review')
  }

  const flaggedIds = new Set(flagsByVehicle.keys())
  return {
    reviewCount: flaggedIds.size,
    duplicateIdentityPairCount: identityPairs.size,
    duplicateIdentityPairs: [...identityPairs.values()].map(pair => ({
      plates: pair.plates,
      fields: [...pair.fields],
    })),
    isFlagged: vehicle => flaggedIds.has(vehicleKey(vehicle)),
    flagsFor: vehicle => [...(flagsByVehicle.get(vehicleKey(vehicle)) || [])],
  }
}
