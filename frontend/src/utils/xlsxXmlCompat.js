const XLSX_ROOTS = /<(?:workbook|Relationships|worksheet|sst)(?:\s|>)/

if (typeof DOMParser !== 'undefined' && !DOMParser.prototype.__transportXlsxCompat) {
  const nativeParse = DOMParser.prototype.parseFromString

  DOMParser.prototype.parseFromString = function parseFromString(source, mimeType, ...rest) {
    if (mimeType === 'application/xml' && typeof source === 'string' && XLSX_ROOTS.test(source)) {
      source = source.replace(/\sxmlns="[^"]*"/g, '')
    }
    return nativeParse.call(this, source, mimeType, ...rest)
  }

  Object.defineProperty(DOMParser.prototype, '__transportXlsxCompat', { value: true })
}
