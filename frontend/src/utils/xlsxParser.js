const text = (bytes) => new TextDecoder('utf-8').decode(bytes)

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim()

function attributeByLocalName(node, name) {
  if (!node?.attributes) return ''
  const match = Array.from(node.attributes).find((attr) => attr.name === name || attr.localName === name)
  return match?.value || ''
}

function allElements(root, localName) {
  if (!root) return []
  try { return Array.from(root.getElementsByTagNameNS('*', localName)) } catch { return [] }
}

function directElements(root, localName) {
  return Array.from(root?.children || []).filter((node) => node?.localName === localName)
}

function normalizeZipPath(path) {
  const raw = decodeURIComponent(String(path || '')).replace(/\\/g, '/')
  const parts = raw.split('/')
  const out = []
  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') { out.pop(); continue }
    out.push(part)
  }
  return out.join('/')
}

function resolveWorkbookTarget(target) {
  const raw = String(target || '').trim().replace(/\\/g, '/')
  if (!raw) return ''
  if (raw.startsWith('/')) return normalizeZipPath(raw.slice(1))
  if (raw.startsWith('xl/')) return normalizeZipPath(raw)
  return normalizeZipPath(`xl/${raw}`)
}

async function inflate(bytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Browser belum mendukung pembacaan XLSX. Gunakan Chrome/Edge terbaru.')
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function unzip(buffer) {
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  let eocd = -1
  for (let i = bytes.length - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('File bukan XLSX yang valid atau file rusak.')

  const count = view.getUint16(eocd + 10, true)
  const centralOffset = view.getUint32(eocd + 16, true)
  const entries = new Map()
  let p = centralOffset

  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('Struktur ZIP XLSX tidak valid.')
    const method = view.getUint16(p + 10, true)
    const compSize = view.getUint32(p + 20, true)
    const nameLen = view.getUint16(p + 28, true)
    const extraLen = view.getUint16(p + 30, true)
    const commentLen = view.getUint16(p + 32, true)
    const localOffset = view.getUint32(p + 42, true)
    if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error('Local header XLSX tidak valid.')
    const localNameLen = view.getUint16(localOffset + 26, true)
    const localExtraLen = view.getUint16(localOffset + 28, true)
    const start = localOffset + 30 + localNameLen + localExtraLen
    const name = text(bytes.slice(p + 46, p + 46 + nameLen))
    entries.set(normalizeZipPath(name), { method, bytes: bytes.slice(start, start + compSize) })
    p += 46 + nameLen + extraLen + commentLen
  }

  return {
    read: async (name) => {
      const entry = entries.get(normalizeZipPath(name))
      if (!entry) return null
      if (entry.method === 0) return entry.bytes
      if (entry.method === 8) return inflate(entry.bytes)
      throw new Error(`Metode kompresi XLSX ${entry.method} belum didukung.`)
    },
    names: () => [...entries.keys()],
  }
}

function columnNameToIndex(name) {
  let n = 0
  for (const c of name) n = n * 26 + c.charCodeAt(0) - 64
  return n - 1
}

function parseSheetXml(xml, sharedStrings) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (allElements(doc, 'parsererror').length) throw new Error('Sheet XLSX tidak dapat dibaca.')
  const worksheetData = allElements(doc, 'sheetData')[0]
  if (!worksheetData) return []

  const rows = []
  for (const row of directElements(worksheetData, 'row')) {
    const values = []
    for (const cell of directElements(row, 'c')) {
      const ref = attributeByLocalName(cell, 'r')
      const match = ref.match(/^([A-Z]+)/)
      if (!match) continue
      const idx = columnNameToIndex(match[1])
      const type = attributeByLocalName(cell, 't')
      const vNode = directElements(cell, 'v')[0]
      const isNode = directElements(cell, 'is')[0]
      const valueNodes = isNode ? allElements(isNode, 't') : []
      let value = clean(vNode?.textContent)
      if (type === 's') value = sharedStrings[Number(value)] || ''
      else if (type === 'inlineStr') value = clean(valueNodes.map((node) => node.textContent || '').join(''))
      else if (type === 'b') value = value === '1' ? 'TRUE' : 'FALSE'
      values[idx] = value
    }
    rows.push({ excelRow: Number(attributeByLocalName(row, 'r') || rows.length + 1), values })
  }
  return rows
}

export async function parseXlsx(file) {
  if (!file) throw new Error('File Excel belum dipilih.')
  const zip = await unzip(await file.arrayBuffer())
  const workbookXmlBytes = await zip.read('xl/workbook.xml')
  const relsXmlBytes = await zip.read('xl/_rels/workbook.xml.rels')
  if (!workbookXmlBytes || !relsXmlBytes) throw new Error('Workbook XLSX tidak lengkap.')

  const workbook = new DOMParser().parseFromString(text(workbookXmlBytes), 'application/xml')
  const rels = new DOMParser().parseFromString(text(relsXmlBytes), 'application/xml')
  if (allElements(workbook, 'parsererror').length || allElements(rels, 'parsererror').length) throw new Error('Struktur XML workbook XLSX tidak valid.')

  const sharedStrings = []
  const shared = await zip.read('xl/sharedStrings.xml')
  if (shared) {
    const doc = new DOMParser().parseFromString(text(shared), 'application/xml')
    for (const si of allElements(doc, 'si')) sharedStrings.push(clean(allElements(si, 't').map((node) => node.textContent || '').join('')))
  }

  const relMap = {}
  for (const rel of allElements(rels, 'Relationship')) {
    const id = attributeByLocalName(rel, 'Id')
    const target = attributeByLocalName(rel, 'Target')
    if (id && target) relMap[id] = target
  }

  const sheetsNode = allElements(workbook, 'sheets')[0]
  if (!sheetsNode) throw new Error('Workbook tidak memiliki daftar sheet.')

  const sheets = []
  for (const sheet of allElements(sheetsNode, 'sheet')) {
    const relationshipId = attributeByLocalName(sheet, 'id') || attributeByLocalName(sheet, 'Id')
    const target0 = relMap[relationshipId]
    let target = resolveWorkbookTarget(target0)
    let raw = target ? await zip.read(target) : null

    if (!raw) {
      const candidates = zip.names().filter((name) => /^xl\/worksheets\/sheet[^/]*\.xml$/i.test(name))
      const ordinal = sheets.length
      const byOrdinal = candidates.find((name) => {
        const m = name.match(/sheet(\d+)\.xml$/i)
        return m && Number(m[1]) === ordinal + 1
      })
      const fallback = byOrdinal || candidates[ordinal]
      if (fallback) { target = fallback; raw = await zip.read(fallback) }
    }

    if (!raw) continue
    sheets.push({
      name: clean(attributeByLocalName(sheet, 'name')) || `Sheet ${sheets.length + 1}`,
      target,
      rows: parseSheetXml(text(raw), sharedStrings),
    })
  }

  if (!sheets.length) {
    const fallbacks = zip.names().filter((name) => /^xl\/worksheets\/sheet[^/]*\.xml$/i.test(name)).sort()
    for (const target of fallbacks) {
      const raw = await zip.read(target)
      if (raw) sheets.push({ name: target.split('/').pop()?.replace(/\.xml$/i, '') || `Sheet ${sheets.length + 1}`, target, rows: parseSheetXml(text(raw), sharedStrings) })
    }
  }

  if (!sheets.length) throw new Error('Tidak ada worksheet XLSX yang bisa dibaca. File mungkin bukan XLSX standar atau rusak.')
  return sheets
}

export default parseXlsx
