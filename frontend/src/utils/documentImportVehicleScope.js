const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim()
const normalizePlate = value => clean(value).toUpperCase()

/**
 * Document-date imports are restricted to ASET vehicles. Known SEWA vehicles
 * are intentionally excluded; unknown plates must stop the whole import so
 * valid assets cannot be saved while source vehicles silently disappear.
 */
export function classifyDocumentImportRows(rows = [], vehicles = []) {
  const masterByPlate = new Map()
  for (const vehicle of vehicles) {
    const plate = normalizePlate(vehicle?.nomor_polisi)
    if (plate) masterByPlate.set(plate, vehicle)
  }

  const assetRows = []
  const rentalRows = []
  const unknownPlates = new Set()
  for (const row of rows) {
    const plate = normalizePlate(row?.nomor_polisi)
    const master = masterByPlate.get(plate)
    if (!plate || !master) {
      unknownPlates.add(plate || 'No. Polisi kosong')
      continue
    }
    const ownership = clean(master.kepemilikan).toUpperCase()
    if (ownership === 'ASET') assetRows.push(row)
    else if (ownership === 'SEWA') rentalRows.push(row)
    else unknownPlates.add(plate)
  }

  return {
    assetRows,
    rentalRows,
    rentalPlates: [...new Set(rentalRows.map(row => normalizePlate(row?.nomor_polisi)))],
    unknownPlates: [...unknownPlates].sort(),
  }
}

export function assertNoUnknownDocumentRows(scope) {
  const unknown = scope?.unknownPlates || []
  if (!unknown.length) return
  const visible = unknown.slice(0, 12).join(', ')
  const remainder = unknown.length > 12 ? ` dan ${unknown.length - 12} plat lainnya` : ''
  throw new Error(
    `Import Dokumen Kendaraan dibatalkan seluruhnya: ${unknown.length} nomor polisi belum terdaftar pada Master Kendaraan ASET/SEWA (${visible}${remainder}). Tidak ada dokumen dari file ini yang disimpan. Tambahkan/perbaiki data Master atau periksa ejaan plat, lalu impor ulang. Kendaraan SEWA yang sudah terdaftar tetap dikecualikan sesuai aturan.`,
  )
}
