/**
 * Resolve the Excel-like clean table mode preference.
 *
 * Other operational modules keep their existing clean-view default. Kendaraan
 * keeps its original/native table layout by default; explicit saved choices
 * continue to be respected.
 */
export function resolveCleanTableView(rawValue, context) {
  const defaultValue = context !== 'kendaraan'
  try {
    const value = rawValue ? JSON.parse(rawValue) : {}
    if (value && typeof value === 'object' && value[context] !== undefined) {
      return value[context] !== false
    }
  } catch {
    // Fall back to the safe, context-specific default for malformed storage.
  }
  return defaultValue
}
/**
 * Classify table headers by role so injected checkbox controls are never
 * treated as business data columns.
 */
export function classifyTableColumnKind(label, isSelectionControl = false) {
  if (isSelectionControl) return 'selection'
  const value = String(label ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
  if (value === 'tanda' || value === 'penanda') return 'mark'
  if (value === 'aksi') return 'action'
  return 'data'
}

export function isCleanTableUtilityColumn(kind) {
  return kind === 'mark' || kind === 'action' || kind === 'selection'
}
