const toDate = (value) => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (value === null || value === undefined) return null

  const raw = String(value).trim()
  if (!raw) return null

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  if (dateOnly) {
    const [, year, month, day] = dateOnly
    const localDate = new Date(Number(year), Number(month) - 1, Number(day))
    return Number.isNaN(localDate.getTime()) ? null : localDate
  }

  const monthOnly = /^(\d{4})-(\d{2})$/.exec(raw)
  if (monthOnly) {
    const [, year, month] = monthOnly
    const localDate = new Date(Number(year), Number(month) - 1, 1)
    return Number.isNaN(localDate.getTime()) ? null : localDate
  }

  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export const formatDateSafe = (value, options = { dateStyle: 'medium' }) => {
  const date = toDate(value)
  return date ? new Intl.DateTimeFormat('id-ID', options).format(date) : '-'
}

export const formatMonthSafe = (value) => {
  const date = toDate(value)
  return date ? new Intl.DateTimeFormat('id-ID', { month: 'long' }).format(date) : '-'
}

export const isValidDateValue = (value) => Boolean(toDate(value))
