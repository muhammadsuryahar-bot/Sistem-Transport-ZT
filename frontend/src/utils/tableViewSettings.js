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
