const XLSX_ROOTS = /<(?:workbook|Relationships|worksheet|sst)(?:\s|>)/

// XLSX XML may contain a default namespace plus prefixed namespaces such as r:.
// Only remove the default namespace. Removing xmlns:r leaves attributes such as
// r:id unbound and makes DOMParser reject an otherwise valid XLSX workbook.
const stripXlsxNamespaces = (source) => source
  .replace(/\sxmlns="[^"]*"/g, '')

if (typeof DOMParser !== 'undefined' && !DOMParser.prototype.__transportXlsxCompat) {
  const nativeParse = DOMParser.prototype.parseFromString

  DOMParser.prototype.parseFromString = function parseFromString(source, mimeType, ...rest) {
    if (mimeType === 'application/xml' && typeof source === 'string' && XLSX_ROOTS.test(source)) {
      source = stripXlsxNamespaces(source)
    }
    return nativeParse.call(this, source, mimeType, ...rest)
  }

  Object.defineProperty(DOMParser.prototype, '__transportXlsxCompat', { value: true })
}

export { stripXlsxNamespaces }
