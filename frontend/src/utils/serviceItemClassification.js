import { decodeExcelMeta } from './excelSourceMeta.js'

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim()

export function normalizeServiceItemName(value) {
  return clean(value).replace(/^\d+[.)-]\s*/, '').replace(/\s+/g, ' ').trim().toUpperCase()
}

const BAN_PATTERN = /\b(?:BAN(?:\s+(?:LUAR|DALAM|CADANGAN))?|TYRES?|TIRES?|TUBELESS|TUBE\s*TYPE)\b/
const AKI_PATTERN = /\b(?:AKI|ACCU|BATERAI|BATTERY)\b/
const PART_PATTERN = /\b(?:OLI|OIL|PELUMAS|GREASE|FILTER|SARINGAN|BUSI|SPARK\s*PLUG|KAMPAS\s+REM|KANVAS\s+REM|KANVAS\s+CAKRAM|BLOK?\s+REM|BLOCK\s+REM|BLOK\s+CAKRAM|BLOCK\s+CAKRAM|PIRING\s+CAKRAM|BLOK\s+VAKUM|BLOK\s+KLOS|BRAKE\s+PAD|BRAKE\s+SHOE|SHOE\s*KIT|KOPLING|CLUTCH|GAERBOX|GEARBOX|SHOCK(?:BREAKER|BREKER)?|SHOCK\s*BREAKER|ABSORBER|BEARING|RACK\s*END|STEERING\s+RACK|DRAG\s*LINK|TIE[ -]?ROD|TIEROD|BALL\s+JOINT|SEAL(?:ING)?|O[ -]?RING|GASKET|PAKING|PACKING|MINYAK\s+REM|LAMPU|LAMP|BOHLAM|BULB|HEAD\s*LAMP|HEADLAM|TAIL\s*LAMP|STOP\s*LAMP|RADIATOR|SELANG|HOSE|WATER\s+PUMP|POMPA\s+AIR|FAN\s*BELT|V[ -]?BELT|BELT\s+V|BELT|V-RIBBED|WIPER|SPARE[ -]?PART|SUKU\s+CADANG|PENGADAAN\s+BARANG|KABEL|CABLE|SEKRING|SKRING|FUSE|RELAY|REALY|TERMINAL|BUSHING|BUSH|KARET|LINK\s+STABIL(?:IZER)?|STABILIZER\s+LINK|K\.\s*STABIL|STABIL|CV\s+JOINT|AXLE|BOOT|PULLEY|ALTERNATOR|STARTER(?:\s+MOTOR)?|INJECTOR|NOZZLE|PARKING\s+BRAKE|MASTER\s+REM|WHEEL\s+CYLINDER|DISC\s+ROTOR|BRAKE\s+DISC|SLAVE\s+CYLINDER|CLAMP|MOUNTING|FAN\s+RADIATOR|MOTOR\s+FAN|PIPA\s+REM|BUSH\s+ARM|ARM\s+BUSH|PISTON|BAUT|BOLT|RING\s+SET|METAL|LIFTER|THERMOSTAT|VALVE|SENSOR|KLAKSON|KLAXON|DINAMO|DIANAMO|DYNAMO|LEVER|SHIFT|LEM|BBM|BAHAN\s+BAKAR|TINNER|THINNER|CLEANER|KUNCI|KAP\s+MESIN|KONTAK\s+SEIN|TUTUP|CLIP|KLIP|SUPPORT|LINER|LINNER|FENDER|BUMPER|APRON|LOUVER|MOULDING|MOLDING|WINDSHIELD|KACA|GLASS|HANDLE|HINGE|WINDOWS?|VELG|RIM|HOOD|DOOR[\s-]?LOCK|POWER\s+WINDOWS?|RESERVE\s+TANK|TANK\s+RAD|HOOD\s+SUPPORT|PEN\s+PAYUNG)\b/

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
