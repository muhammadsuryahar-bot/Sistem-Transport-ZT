const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const escapeXml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;')

const columnName = (index) => {
  let n = index + 1
  let out = ''
  while (n > 0) {
    const r = (n - 1) % 26
    out = String.fromCharCode(65 + r) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

const crc32 = (bytes) => {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

const u16 = (value) => new Uint8Array([value & 255, (value >>> 8) & 255])
const u32 = (value) => new Uint8Array([
  value & 255,
  (value >>> 8) & 255,
  (value >>> 16) & 255,
  (value >>> 24) & 255,
])

const concatBytes = (parts) => {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const output = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.length
  }
  return output
}

const localHeader = (nameBytes, data, crc) => concatBytes([
  u32(0x04034b50),
  u16(20),
  u16(0),
  u16(0),
  u16(0),
  u16(0),
  u32(crc),
  u32(data.length),
  u32(data.length),
  u16(nameBytes.length),
  u16(0),
  nameBytes,
])

const centralHeader = (nameBytes, data, crc, offset) => concatBytes([
  u32(0x02014b50),
  u16(20),
  u16(20),
  u16(0),
  u16(0),
  u16(0),
  u16(0),
  u32(crc),
  u32(data.length),
  u32(data.length),
  u16(nameBytes.length),
  u16(0),
  u16(0),
  u16(0),
  u16(0),
  u32(0),
  u32(offset),
  nameBytes,
])

const endOfCentralDirectory = (entryCount, size, offset) => concatBytes([
  u32(0x06054b50),
  u16(0),
  u16(0),
  u16(entryCount),
  u16(entryCount),
  u32(size),
  u32(offset),
  u16(0),
])

const makeZip = async (files) => {
  const encoder = new TextEncoder()
  const localParts = []
  const centralParts = []
  let offset = 0

  for (const file of files) {
    const nameBytes = encoder.encode(file.name)
    const data = encoder.encode(file.content)
    const crc = crc32(data)
    const local = localHeader(nameBytes, data, crc)
    localParts.push(local, data)
    centralParts.push(centralHeader(nameBytes, data, crc, offset))
    offset += local.length + data.length
  }

  const centralOffset = offset
  const central = concatBytes(centralParts)
  return concatBytes([...localParts, central, endOfCentralDirectory(files.length, central.length, centralOffset)])
}

const safeSheetName = (value, index) => {
  const cleaned = String(value || `Sheet ${index + 1}`)
    .replace(/[\\/*?:[\]]/g, ' ')
    .trim()
    .slice(0, 31)
  return cleaned || `Sheet ${index + 1}`
}

const isFiniteNumber = (value) => {
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'string') return false
  const text = value.trim()
  return text !== '' && Number.isFinite(Number(text)) && /^-?(?:\d+|\d*\.\d+)$/.test(text)
}

const cellXml = (ref, value, style = 0) => {
  const styleAttr = style ? ` s="${style}"` : ''
  if (value === null || value === undefined || value === '') return `<c r="${ref}"${styleAttr}/>`
  if (isFiniteNumber(value)) return `<c r="${ref}"${styleAttr}><v>${escapeXml(value)}</v></c>`
  return `<c r="${ref}" t="inlineStr"${styleAttr}><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`
}

const buildSheetXml = (sheet) => {
  const headers = Array.isArray(sheet.headers) ? sheet.headers : []
  const rows = Array.isArray(sheet.rows) ? sheet.rows : []
  const allRows = [headers, ...rows]
  const rowXml = allRows.map((row, rowIndex) => {
    const values = Array.isArray(row) ? row : []
    const cells = headers.map((_, colIndex) => cellXml(`${columnName(colIndex)}${rowIndex + 1}`, values[colIndex], rowIndex === 0 ? 1 : 0)).join('')
    return `<row r="${rowIndex + 1}">${cells}</row>`
  }).join('')

  const widths = headers.map((header, index) => {
    const maxLength = Math.min(42, Math.max(
      String(header ?? '').length + 2,
      ...rows.slice(0, 80).map(row => String(Array.isArray(row) ? row[index] ?? '' : '').length + 2),
      10,
    ))
    return `<col min="${index + 1}" max="${index + 1}" width="${Math.min(42, Math.max(10, Math.round(maxLength * 0.95)))}" customWidth="1"/>`
  }).join('')

  const endColumn = columnName(Math.max(headers.length - 1, 0))
  const endRow = Math.max(allRows.length, 1)
  const filterRef = `A1:${endColumn}${endRow}`

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <cols>${widths}</cols>
  <sheetData>${rowXml}</sheetData>
  <autoFilter ref="${filterRef}"/>
</worksheet>`
}

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="0"/>
  <fonts count="2">
    <font><sz val="11"/><name val="Aptos"/></font>
    <font><b/><sz val="11"/><name val="Aptos"/></font>
  </fonts>
  <fills count="2">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="D9EDE3"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="1"><border/></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="1" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`

export async function downloadXlsx(filename, sheets) {
  if (!Array.isArray(sheets) || sheets.length === 0) throw new Error('Tidak ada data untuk diekspor.')
  const safeSheets = sheets.slice(0, 10).map((sheet, index) => ({
    ...sheet,
    name: safeSheetName(sheet?.name, index),
  }))

  const workbookSheets = safeSheets.map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')
  const workbookRels = safeSheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')
  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <bookViews><workbookView/></bookViews>
  <sheets>${workbookSheets}</sheets>
</workbook>`

  const files = [
    {
      name: '[Content_Types].xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${safeSheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`,
    },
    {
      name: '_rels/.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`,
    },
    {
      name: 'docProps/core.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${escapeXml(filename.replace(/\\.xlsx$/i, ''))}</dc:title><dc:creator>Sistem Transport ZT</dc:creator></cp:coreProperties>`,
    },
    {
      name: 'docProps/app.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Sistem Transport ZT</Application></Properties>`,
    },
    {
      name: 'xl/workbook.xml',
      content: workbookXml,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${workbookRels}</Relationships>`,
    },
    {
      name: 'xl/styles.xml',
      content: stylesXml,
    },
    ...safeSheets.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      content: buildSheetXml(sheet),
    })),
  ]

  const zip = await makeZip(files)
  const blob = new Blob([zip], { type: XLSX_MIME })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename.toLowerCase().endsWith('.xlsx') ? filename : `${filename}.xlsx`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default downloadXlsx
