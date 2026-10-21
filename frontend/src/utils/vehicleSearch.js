const normalizeSearchText = value => String(value ?? '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ')

const compactSearchText = value => normalizeSearchText(value).replace(/\s/g, '')

/**
 * Search a vehicle by any useful source/master field, rather than only a
 * subset of the visible columns. Plate and identity searches ignore spaces
 * and punctuation so "BM 1234 XX" also matches "BM1234XX".
 */
export function matchesVehicleSearch(vehicle, driver, query) {
  const needle = normalizeSearchText(query)
  if (!needle) return true

  const compactNeedle = needle.replace(/\s/g, '')
  const values = [
    vehicle?.kode_kendaraan,
    vehicle?.nomor_polisi,
    vehicle?.merk,
    vehicle?.tipe,
    vehicle?.jenis_kendaraan,
    vehicle?.tahun,
    vehicle?.nomor_mesin,
    vehicle?.nomor_rangka,
    vehicle?.kepemilikan,
    vehicle?.jenis_sewa,
    vehicle?.kepemilikan === 'ASET' ? 'Aset' : '',
    vehicle?.kepemilikan === 'SEWA' ? 'Sewa' : '',
    vehicle?.jenis_sewa === 'SEWA_PERORANGAN' ? 'Sewa Perorangan' : '',
    vehicle?.jenis_sewa === 'SEWA_PERUSAHAAN' ? 'Sewa Perusahaan' : '',
    vehicle?.harga_perolehan,
    vehicle?.pemilik,
    vehicle?.unit_kerja,
    vehicle?.lokasi,
    vehicle?.masa_berlaku_pajak,
    vehicle?.status_pajak,
    vehicle?.status,
    vehicle?.keterangan,
    vehicle?.catatan_hutang,
    driver?.nama_lengkap,
  ].filter(value => value !== null && value !== undefined && String(value).trim() !== '')

  return values.some(value => {
    const normalized = normalizeSearchText(value)
    if (normalized.includes(needle)) return true
    return compactNeedle.length > 0 && compactSearchText(value).includes(compactNeedle)
  })
}

/**
 * Keep bulk actions scoped to rows currently visible under the active filters.
 * A hidden row must not remain selected and be deleted without being visible.
 */
export function retainVisibleVehicleSelection(selectedIds, visibleVehicles) {
  const selected = Array.isArray(selectedIds) ? selectedIds : []
  const visibleIds = new Set((visibleVehicles || []).map(vehicle => vehicle.id))
  const next = selected.filter(id => visibleIds.has(id))
  return next.length === selected.length ? selected : next
}
