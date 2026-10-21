import { decodeExcelMeta } from './excelSourceMeta.js'

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim()

export function normalizeServiceItemName(value) {
  return clean(value).replace(/^\d+[.)-]\s*/, '').replace(/\s+/g, ' ').trim().toUpperCase()
}

const BAN_PATTERN = /\b(?:BAN(?:\s+(?:LUAR|DALAM|CADANGAN))?|TYRES?|TIRES?|TUBELESS|TUBE\s*TYPE)\b/
const AKI_PATTERN = /\b(?:AKI|ACCU|BATERAI|BATTERY)\b/
const PART_PATTERN = /\b(?:OLI|OIL|PELUMAS|GREASE|FILTER|BUSI|SPARK\s*PLUG|KAMPAS\s+REM|KANVAS\s+REM|BRAKE\s+PAD|BRAKE\s+SHOE|KOPLING|CLUTCH|SHOCK(?:\s+ABSORBER)?|ABSORBER|BEARING|RACK\s*END|DRAG\s*LINK|TIE[ -]?ROD|TIEROD|BALL\s+JOINT|SEAL(?:ING)?|O[ -]?RING|GASKET|LAMPU|BOHLAM|BULB|HEAD\s*LAMP|TAIL\s*LAMP|STOP\s*LAMP|RADIATOR|SELANG|HOSE|WATER\s+PUMP|POMPA\s+AIR|FAN\s*BELT|V[ -]?BELT|WIPER|SPARE[ -]?PART|SUKU\s+CADANG|PENGADAAN\s+BARANG|KABEL|SEKRING|FUSE|RELAY|TERMINAL|BUSHING|BUSH|LINK\s+STABILIZER|STABILIZER\s+LINK|CV\s+JOINT|AXLE|BOOT|PULLEY|ALTERNATOR|STARTER(?:\s+MOTOR)?|INJECTOR|NOZZLE|PARKING\s+BRAKE|MASTER\s+REM|WHEEL\s+CYLINDER|DISC\s+ROTOR|BRAKE\s+DISC|SLAVE\s+CYLINDER|CLAMP|MOUNTING|FAN\s+RADIATOR|PIPA\s+REM|BUSH\s+ARM|ARM\s+BUSH)\b/

export function classifyServiceItemCategory(category, name = '') {
  const raw = (clean(category) + ' ' + clean(name)).toUpperCase()
  if (BAN_PATTERN.test(raw)) return 'BAN'
  if (AKI_PATTERN.test(raw)) return 'AKI'
  // Classify identifiable parts before generic labels such as "JASA" or "SERVICE".
  // This is important when the original spreadsheet stores the work type as "Service".
  if (PART_PATTERN.test(raw)) return 'SPAREPART'
  if (/\b(?:JASA|SERVICE|PEKERJAAN|LABOR)\b/.test(raw)) return 'JASA'
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
  const normalizedCategory = clean(category).toUpperCase() || 'LAINNYA'
  const normalizedUnit = clean(unit).toUpperCase() || '-'
  return normalizeServiceItemName(name) + '|' + normalizedCategory + '|' + normalizedUnit
}
