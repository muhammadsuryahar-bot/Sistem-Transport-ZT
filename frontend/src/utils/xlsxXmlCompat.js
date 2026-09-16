const XLSX_ROOTS = /<(?:workbook|Relationships|worksheet|sst)(?:\s|>)/

// Be compatible with the many namespace variants produced by Excel/WPS/LibreOffice.
// The import components query the XLSX XML using simple local selectors, so remove
// namespace declarations while preserving attributes such as r:id.
const stripXlsxNamespaces = (source) => source
  .replace(/\sxmlns(?:\:[A-Za-z_][\w.-]*)?="[^"]*"/g, '')

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
