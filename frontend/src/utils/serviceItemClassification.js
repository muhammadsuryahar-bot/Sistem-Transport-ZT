import { decodeExcelMeta } from './excelSourceMeta.js'

const clean = value => String(value ?? '').trim()

export function normalizeServiceItemName(value) {
  return clean(value).replace(/^\d+[.)-]\s*/, '').toUpperCase()
}

export function classifyServiceItemCategory(category, name = '') {
  const raw = (clean(category) + ' ' + clean(name)).toUpperCase()
  if (/BAN|TYRE|TIRE/.test(raw)) return 'BAN'
  if (/AKI|BATERAI|BATTERY/.test(raw)) return 'AKI'
  if (/OLI|PELUMAS|GREASE|FILTER OLI|FILTER MINYAK|FILTER HAWA|FILTER UDARA|BUSI|KANVAS REM|BRAKE PAD|KAMPAS REM|KOPLING|CLUTCH|SHOCK|ABSORBER|BEARING|RACK END|DRAGLINK|SPAREPART|PENGADAAN BARANG/.test(raw)) return 'SPAREPART'
  if (/JASA|SERVICE|PEKERJAAN|LABOR/.test(raw)) return 'JASA'
  return clean(category).toUpperCase() || 'LAINNYA'
}

export function classifySourceServiceItemCategory(item = {}) {
  const meta = decodeExcelMeta(item.keterangan).meta || {}
  const source = clean(meta.jenis_pekerjaan).toUpperCase()
  if (/PENGADAAN BARANG|SPAREPART|SUKU CADANG/.test(source)) return 'SPAREPART'
  if (/JASA SERVICE|\bJASA\b|PEKERJAAN|LABOR/.test(source)) return 'JASA'
  return classifyServiceItemCategory(item.kategori, item.nama_item)
}

export function serviceItemGroupKey(name, category, unit) {
  return normalizeServiceItemName(name) + '|' + String(category || 'LAINNYA') + '|' + String(unit || '-')
}
