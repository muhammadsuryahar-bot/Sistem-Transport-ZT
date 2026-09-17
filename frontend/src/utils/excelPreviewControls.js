const STORAGE_KEY = 'transport_excel_preview_deleted_v1'

function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const value = raw ? JSON.parse(raw) : {}
    return value && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}

function writeStore(value) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)) } catch { /* intentional no-op */ }
}

export function rowDeleteKey(context, excelRow) {
  return `${context}:${String(excelRow)}`
}

export function getDeletedExcelRows(context) {
  const store = readStore()
  const keys = new Set(Array.isArray(store?.[context]) ? store[context].map(String) : [])
  return keys
}

export function clearDeletedExcelRows(context) {
  const store = readStore()
  delete store[context]
  writeStore(store)
}

export function filterDeletedExcelRows(context, rows) {
  const deleted = getDeletedExcelRows(context)
  return (rows || []).filter(row => !deleted.has(String(row.excelRow)))
}

export function setDeletedExcelRows(context, rows) {
  const store = readStore()
  store[context] = [...new Set((rows || []).map(String))]
  writeStore(store)
}
