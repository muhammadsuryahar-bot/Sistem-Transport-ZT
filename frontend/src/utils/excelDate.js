const MONTHS = {
  jan: 1, january: 1, januari: 1,
  feb: 2, february: 2, februari: 2,
  mar: 3, march: 3, maret: 3,
  apr: 4, april: 4,
  may: 5, mei: 5,
  jun: 6, june: 6, juni: 6,
  jul: 7, july: 7, juli: 7,
  aug: 8, august: 8, agu: 8, ags: 8, agt: 8, agustus: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, oktober: 10, okt: 10,
  nov: 11, november: 11,
  dec: 12, desember: 12, des: 12,
}

function cleanDateValue(value) {
  return String(value ?? '').trim()
}

function formatYear(value) {
  let year = Number(value)
  if (!Number.isInteger(year)) return null
  if (year >= 0 && year < 100) year += year >= 70 ? 1900 : 2000
  return year
}

function buildDate(yearValue, monthValue, dayValue) {
  const year = formatYear(yearValue)
  const month = Number(monthValue)
  const day = Number(dayValue)
  if (!year || year < 1900 || year > 2200 || !Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1 || day > 31) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * Parse Excel date values without converting date-only strings through UTC.
 * Spreadsheet dates are calendar dates, so timezone offsets must not move them
 * to the previous/next day.
 */
export function excelDate(value) {
  const raw = cleanDateValue(value)
  if (!raw) return null

  // ISO date or datetime: preserve the explicit calendar date component.
  const iso = /^(\\d{4})-(\\d{1,2})-(\\d{1,2})(?:$|[T\\s])/.exec(raw)
  if (iso) return buildDate(iso[1], iso[2], iso[3])

  // Indonesian day-first numeric dates (d/m/yyyy or d-m-yyyy).
  const numeric = /^(\\d{1,2})[/-](\\d{1,2})[/-](\\d{2,4})$/.exec(raw)
  if (numeric) return buildDate(numeric[3], numeric[2], numeric[1])

  // Month names in Indonesian or English, e.g. 25-Oct-2025 / 11-Des-25.
  const named = raw.toLowerCase().replace(/[.,]/g, '').match(/^(\\d{1,2})[-\\s/]+([a-z]+)[-\\s/]+(\\d{2,4})$/)
  if (named) {
    const month = MONTHS[named[2]]
    if (month) return buildDate(named[3], month, named[1])
  }

  // Excel 1900-system serial date. Keep only the whole calendar-day component.
  const serial = Number(raw)
  if (raw !== '' && Number.isFinite(serial) && serial > 20000 && serial < 80000) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000)
    return buildDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
  }

  // Conservative support for other date strings; use local date fields rather
  // than toISOString(), which can shift local-midnight dates by one day.
  const fallback = new Date(raw)
  if (Number.isNaN(fallback.getTime())) return null
  return buildDate(fallback.getFullYear(), fallback.getMonth() + 1, fallback.getDate())
}
