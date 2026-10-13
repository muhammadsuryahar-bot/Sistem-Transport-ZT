const VALID_CATEGORIES = new Set(['JASA', 'SPAREPART', 'OLI', 'BAN', 'AKI', 'LAINNYA'])

export const normalizeBenchmarkItemName = value => String(value ?? '')
  .trim()
  .replace(/^\s*\d+(?:\.\d+)?\s*[.)-]?\s*/, '')
  .replace(/\s+/g, ' ')
  .toLocaleUpperCase('id-ID')

export const normalizeBenchmarkUnit = value => String(value ?? '')
  .trim()
  .replace(/\s+/g, ' ')
  .toLocaleUpperCase('id-ID')

export const benchmarkKey = (name, category, unit) => JSON.stringify([
  normalizeBenchmarkItemName(name),
  String(category ?? 'LAINNYA').trim().toLocaleUpperCase('id-ID'),
  normalizeBenchmarkUnit(unit),
])

export const classifyBenchmarkCategory = (name, sourceWork = '', fallback = '') => {
  const item = String(name ?? '').trim().toLocaleUpperCase('id-ID')
  const work = String(sourceWork ?? '').trim().toLocaleUpperCase('id-ID')
  const all = `${work} ${item}`

  if (/PENGADAAN BARANG|SPAREPART|SUKU CADANG|\bPARTS?\b/.test(all)) return 'SPAREPART'
  if (/\bOLI\b|\bOIL\b|PELUMAS|LUBRICANT/.test(item)) return 'OLI'
  if (/\bBAN\b|\bTIRE\b|\bTYRE\b/.test(item)) return 'BAN'
  if (/\bAKI\b|BATTERY|BATERAI/.test(item)) return 'AKI'

  const normalizedFallback = String(fallback ?? '').trim().toLocaleUpperCase('id-ID')
  if (['SPAREPART', 'OLI', 'BAN', 'AKI'].includes(normalizedFallback)) return normalizedFallback
  if (/JASA SERVICE|\bJASA\b|PEKERJAAN|\bLABOR\b|SPOORING|CHECK REM|ENGINE TUNE UP/.test(work)) return 'JASA'
  return VALID_CATEGORIES.has(normalizedFallback) ? normalizedFallback : 'LAINNYA'
}

const medianOf = values => {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export const buildServicePriceHistory = rows => {
  const groups = new Map()

  for (const row of Array.isArray(rows) ? rows : []) {
    const name = String(row?.name ?? '').trim().replace(/^\s*\d+(?:\.\d+)?\s*[.)-]?\s*/, '').replace(/\s+/g, ' ')
    const normalizedName = normalizeBenchmarkItemName(name)
    const category = String(row?.category ?? 'LAINNYA').trim().toLocaleUpperCase('id-ID')
    const unit = normalizeBenchmarkUnit(row?.unit)
    const price = Number(row?.price)
    if (!normalizedName || !VALID_CATEGORIES.has(category) || !Number.isFinite(price) || price <= 0) continue

    const key = benchmarkKey(name, category, unit)
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        name,
        normalizedName,
        category,
        unit,
        prices: [],
        vehicles: new Set(),
        workshops: new Set(),
      })
    }

    const group = groups.get(key)
    group.prices.push(price)
    const vehicle = String(row?.vehicle ?? '').trim().toLocaleUpperCase('id-ID')
    const workshop = String(row?.workshop ?? '').trim().replace(/\s+/g, ' ').toLocaleUpperCase('id-ID')
    if (vehicle) group.vehicles.add(vehicle)
    if (workshop) group.workshops.add(workshop)
  }

  return [...groups.values()].map(group => {
    const prices = group.prices
    return {
      key: group.key,
      name: group.name,
      normalizedName: group.normalizedName,
      category: group.category,
      unit: group.unit,
      transactionCount: prices.length,
      vehicleCount: group.vehicles.size,
      workshopCount: group.workshops.size,
      minPrice: Math.min(...prices),
      medianPrice: medianOf(prices),
      maxPrice: Math.max(...prices),
      averagePrice: prices.reduce((sum, price) => sum + price, 0) / prices.length,
    }
  }).sort((a, b) => a.normalizedName.localeCompare(b.normalizedName, 'id'))
}

export const mergeServicePriceBenchmarks = (historyRows, benchmarkRows) => {
  const merged = new Map()

  for (const history of Array.isArray(historyRows) ? historyRows : []) {
    merged.set(history.key, {
      key: history.key,
      nama_item: history.name,
      kategori: history.category,
      satuan: history.unit,
      history,
      benchmark: null,
    })
  }

  for (const benchmark of Array.isArray(benchmarkRows) ? benchmarkRows : []) {
    const key = benchmarkKey(benchmark?.nama_item, benchmark?.kategori, benchmark?.satuan)
    const current = merged.get(key)
    if (current) {
      current.benchmark = benchmark
      if (benchmark.aktif) current.nama_item = benchmark.nama_item
      continue
    }

    merged.set(key, {
      key,
      nama_item: String(benchmark?.nama_item ?? '').trim(),
      kategori: String(benchmark?.kategori ?? 'SPAREPART').trim().toLocaleUpperCase('id-ID'),
      satuan: normalizeBenchmarkUnit(benchmark?.satuan),
      history: null,
      benchmark,
    })
  }

  return [...merged.values()].sort((a, b) => {
    const aName = normalizeBenchmarkItemName(a.nama_item)
    const bName = normalizeBenchmarkItemName(b.nama_item)
    return aName.localeCompare(bName, 'id') || a.kategori.localeCompare(b.kategori, 'id') || a.satuan.localeCompare(b.satuan, 'id')
  })
}
