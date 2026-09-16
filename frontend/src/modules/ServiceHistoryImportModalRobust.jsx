import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import './DataPageTools.css'
import './ServiceHistoryImportModal.css'

const MAX_FILE_SIZE = 25 * 1024 * 1024
const CONCURRENCY = 4
const PREVIEW_LIMIT = 120

const ALIASES = {
  nomor_polisi: ['no_polisi', 'no_pol', 'nomor_polisi', 'no_plat', 'plat'],
  merk: ['merk', 'brand'],
  tipe: ['tipe', 'type'],
  jenis: ['jenis', 'jenis_kendaraan', 'jenis_unit'],
  tahun: ['tahun', 'tahun_kendaraan'],
  driver: ['driver_pic', 'driver', 'nama_driver'],
  tanggal: ['tanggal', 'tgl', 'tanggal_service'],
  jenis_pekerjaan: ['jenis_pekerjaan', 'jenis_pekerjan', 'pekerjaan'],
  uraian: ['uraian', 'deskripsi', 'item', 'pekerjaan_detail'],
  qty: ['qty', 'jumlah'],
  satuan: ['sat', 'satuan', 'unit'],
  harga_satuan: ['harga_satuan', 'harga_satuan_rp', 'harga'],
  nilai_dpp: ['nilai_dpp', 'dpp'],
  ppn: ['ppn', 'ppn_rp'],
  total: ['total', 'nilai_total', 'jumlah_rp', 'biaya', 'biaya_rp', 'biaya_service'],
  kilometer: ['km', 'kilometer', 'km_terakhir'],
  bengkel: ['nama_bengkel', 'bengkel', 'nama_bengkel_service'],
  keterangan: ['keterangan', 'catatan'],
}

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim()
const norm = value => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
const upper = value => clean(value).toUpperCase()
const text = bytes => new TextDecoder('utf-8').decode(bytes)
const colIndex = name => { let n = 0; for (const c of name) n = n * 26 + c.charCodeAt(0) - 64; return n - 1 }

function allElements(root, localName) {
  if (!root) return []
  try { return Array.from(root.getElementsByTagNameNS('*', localName)) } catch { return [] }
}
function firstElement(root, localName) { return allElements(root, localName)[0] || null }
function directElements(root, localName) {
  return Array.from(root?.children || []).filter(node => node?.localName === localName)
}
function attributeByLocalName(node, name) {
  if (!node?.attributes) return ''
  const match = Array.from(node.attributes).find(attr => attr.name === name || attr.localName === name)
  return match?.value || ''
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
  if (typeof DecompressionStream === 'undefined') throw new Error('Browser belum mendukung pembacaan XLSX. Gunakan Chrome/Edge terbaru.')
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
    const name = text(bytes.slice(p + 46, p + 46 + nameLen))
    const start = localOffset + 30 + localNameLen + localExtraLen
    entries.set(normalizeZipPath(name), { method, bytes: bytes.slice(start, start + compSize) })
    p += 46 + nameLen + extraLen + commentLen
  }
  return {
    read: async name => {
      const entry = entries.get(normalizeZipPath(name))
      if (!entry) return null
      if (entry.method === 0) return entry.bytes
      if (entry.method === 8) return inflate(entry.bytes)
      throw new Error(`Metode kompresi XLSX ${entry.method} belum didukung.`)
    },
    names: () => [...entries.keys()],
  }
}

function parseSheetXml(xml, sharedStrings) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (firstElement(doc, 'parsererror')) throw new Error('Sheet XLSX tidak dapat dibaca.')
  const worksheetData = firstElement(doc, 'sheetData')
  if (!worksheetData) return []
  const rows = []
  for (const row of directElements(worksheetData, 'row')) {
    const values = []
    for (const cell of directElements(row, 'c')) {
      const ref = attributeByLocalName(cell, 'r')
      const match = ref.match(/^([A-Z]+)/)
      if (!match) continue
      const idx = colIndex(match[1])
      const type = attributeByLocalName(cell, 't')
      const vNode = directElements(cell, 'v')[0]
      const isNode = directElements(cell, 'is')[0]
      const valueNodes = isNode ? allElements(isNode, 't') : []
      let value = clean(vNode?.textContent)
      if (type === 's') value = sharedStrings[Number(value)] || ''
      else if (type === 'inlineStr') value = clean(valueNodes.map(node => node.textContent || '').join(''))
      else if (type === 'b') value = value === '1' ? 'TRUE' : 'FALSE'
      values[idx] = value
    }
    if (values.some(value => clean(value))) rows.push({ excelRow: Number(attributeByLocalName(row, 'r') || rows.length + 1), values })
  }
  return rows
}

async function parseXlsx(file) {
  const zip = await unzip(await file.arrayBuffer())
  const workbookXml = await zip.read('xl/workbook.xml')
  const relsXml = await zip.read('xl/_rels/workbook.xml.rels')
  if (!workbookXml || !relsXml) throw new Error('Workbook XLSX tidak lengkap.')

  const workbook = new DOMParser().parseFromString(text(workbookXml), 'application/xml')
  const rels = new DOMParser().parseFromString(text(relsXml), 'application/xml')
  if (firstElement(workbook, 'parsererror') || firstElement(rels, 'parsererror')) throw new Error('Struktur XML workbook XLSX tidak valid.')

  const sharedStrings = []
  const shared = await zip.read('xl/sharedStrings.xml')
  if (shared) {
    const doc = new DOMParser().parseFromString(text(shared), 'application/xml')
    for (const si of allElements(doc, 'si')) {
      sharedStrings.push(clean(allElements(si, 't').map(node => node.textContent || '').join('')))
    }
  }

  const relMap = {}
  for (const rel of allElements(rels, 'Relationship')) {
    const id = attributeByLocalName(rel, 'Id')
    const target = attributeByLocalName(rel, 'Target')
    if (id && target) relMap[id] = target
  }

  const sheetsNode = firstElement(workbook, 'sheets')
  if (!sheetsNode) throw new Error('Workbook tidak memiliki daftar sheet.')

  const workbookSheets = allElements(sheetsNode, 'sheet')
  const sheets = []
  for (const sheet of workbookSheets) {
    const relationshipId = attributeByLocalName(sheet, 'id') || attributeByLocalName(sheet, 'Id')
    const target0 = relMap[relationshipId]
    let target = resolveWorkbookTarget(target0)
    let raw = target ? await zip.read(target) : null

    if (!raw) {
      const sheetName = clean(attributeByLocalName(sheet, 'name')).toLowerCase()
      const candidates = zip.names().filter(name => /^xl\/worksheets\/sheet[^/]*\.xml$/i.test(name))
      const ordinal = sheets.length
      const byOrdinal = candidates.find(name => /sheet(\d+)\.xml$/i.test(name) && Number(name.match(/sheet(\d+)\.xml$/i)[1]) === ordinal + 1)
      const fallbackName = byOrdinal || candidates[ordinal]
      if (fallbackName) { target = fallbackName; raw = await zip.read(fallbackName) }
      if (!raw && sheetName) {
        const same = candidates.find(name => name.toLowerCase().includes(sheetName.replace(/\s+/g, '')))
        if (same) { target = same; raw = await zip.read(same) }
      }
    }

    if (!raw) continue
    sheets.push({ name: clean(attributeByLocalName(sheet, 'name')) || `Sheet ${sheets.length + 1}`, rows: parseSheetXml(text(raw), sharedStrings), target })
  }

  if (!sheets.length) {
    const fallbacks = zip.names().filter(name => /^xl\/worksheets\/sheet[^/]*\.xml$/i.test(name)).sort()
    for (const target of fallbacks) {
      const raw = await zip.read(target)
      if (raw) sheets.push({ name: target.split('/').pop()?.replace(/\.xml$/i, '') || `Sheet ${sheets.length + 1}`, rows: parseSheetXml(text(raw), sharedStrings), target })
    }
  }

  if (!sheets.length) throw new Error('Tidak ada worksheet XLSX yang bisa dibaca. File mungkin bukan XLSX standar atau rusak.')
  return sheets
}

function findHeader(sheet) {
  let best = { index: -1, row: [], score: -1, excelRow: 1 }
  sheet.rows.slice(0, 80).forEach((item, idx) => {
    const score = item.values.filter(Boolean).map(norm).filter(Boolean).length
    if (score > best.score) best = { index: idx, row: item.values, score, excelRow: item.excelRow }
  })
  return best
}
function getValue(row, headers, key) {
  const aliases = ALIASES[key] || [key]
  const index = headers.findIndex(header => aliases.includes(norm(header)))
  return index >= 0 ? clean(row.values[index]) : ''
}
function numberValue(value) {
  const v = clean(value)
  if (!v) return null
  if (/^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(v)) return Number(v.replace(/\./g, '').replace(',', '.'))
  const n = Number(v.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}
function serviceCurrency(value) {
  const v = clean(value)
  if (!v) return 0
  if (/^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(v)) return Number(v.replace(/\./g, '').replace(',', '.'))
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n * 1000 : 0
}
function excelDate(value) {
  const v = clean(value)
  if (!v) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(v)) { const [d, m, y] = v.split(/[/-]/); return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` }
  const months = { jan:1, januari:1, feb:2, februari:2, mar:3, maret:3, apr:4, april:4, mei:5, may:5, jun:6, juni:6, jul:7, juli:7, agu:8, agustus:8, sep:9, september:9, okt:10, oktober:10, nov:11, november:11, des:12, desember:12 }
  const named = v.toLowerCase().replace(/\./g, '').match(/^(\d{1,2})[-\s/]([a-z]+)[-\s/](\d{2,4})$/)
  if (named) {
    const month = months[named[2]]
    let year = Number(named[3])
    if (year < 100) year += year >= 70 ? 1900 : 2000
    if (month) return `${year}-${String(month).padStart(2, '0')}-${String(Number(named[1])).padStart(2, '0')}`
  }
  const serial = Number(v)
  if (Number.isFinite(serial) && serial > 20000 && serial < 80000) return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10)
  const date = new Date(v)
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
}
function parseRow(row, headers) {
  return {
    excelRow: row.excelRow,
    values: row.values,
    nomor_polisi: upper(getValue(row, headers, 'nomor_polisi')),
    merk: getValue(row, headers, 'merk'),
    tipe: getValue(row, headers, 'tipe'),
    jenis: getValue(row, headers, 'jenis'),
    tahun: getValue(row, headers, 'tahun'),
    driver: getValue(row, headers, 'driver'),
    tanggal: excelDate(getValue(row, headers, 'tanggal')),
    jenis_pekerjaan: getValue(row, headers, 'jenis_pekerjaan'),
    uraian: getValue(row, headers, 'uraian'),
    qty: numberValue(getValue(row, headers, 'qty')) ?? 1,
    satuan: getValue(row, headers, 'satuan') || 'pcs',
    harga_satuan: serviceCurrency(getValue(row, headers, 'harga_satuan')),
    nilai_dpp: serviceCurrency(getValue(row, headers, 'nilai_dpp')),
    ppn: serviceCurrency(getValue(row, headers, 'ppn')),
    total: serviceCurrency(getValue(row, headers, 'total')),
    kilometer: numberValue(getValue(row, headers, 'kilometer')) ?? 0,
    bengkel: getValue(row, headers, 'bengkel') || null,
    keterangan: getValue(row, headers, 'keterangan') || null,
  }
}
function typeFor(rows) {
  const raw = rows.map(r => upper(r.jenis_pekerjaan)).join(' ')
  if (/GANTI\s+BAN|PENGGANTIAN\s+BAN/.test(raw)) return 'GANTI_BAN'
  if (/GANTI\s+(AKI|BATERAI)|PENGGANTIAN\s+(AKI|BATERAI)/.test(raw)) return 'GANTI_AKI'
  if (/PEMERIKSAAN/.test(raw)) return 'PEMERIKSAAN'
  return 'SERVICE'
}
function itemCategory(value) {
  const raw = upper(value)
  if (/BAN/.test(raw)) return 'BAN'
  if (/AKI|BATERAI/.test(raw)) return 'AKI_BATERAI'
  if (/JASA|SERVICE/.test(raw)) return 'JASA_SERVICE'
  return 'MATERIAL_SPAREPART'
}
function chooseServiceSheet(sheets) {
  const scored = sheets.map(sheet => {
    const header = findHeader(sheet)
    const h = header.row.map(norm)
    const name = norm(sheet.name)
    let score = 0
    if (name === 'data_service') score += 30
    else if (name.includes('data_service')) score += 18
    if (name.includes('rekapan_permintaan')) score += 12
    if (name.includes('monitoring_perbaikan')) score += 10
    if (h.includes('no_polisi') || h.includes('no_pol')) score += 5
    if (h.includes('tanggal')) score += 4
    if (h.includes('uraian')) score += 4
    if (h.includes('nilai_dpp') || h.includes('dpp')) score += 3
    return { sheet, header, score }
  }).sort((a, b) => b.score - a.score)
  return scored[0]
}
function groupRows(rows) {
  const groups = new Map()
  rows.forEach(row => {
    const key = `${row.nomor_polisi}|${row.tanggal}|${upper(row.bengkel || '-')}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  })
  return [...groups.entries()].map(([key, values]) => ({ key, values }))
}

async function importHistory(rows, profile, sheetName, onProgress = () => {}) {
  const valid = rows.filter(row => row.nomor_polisi && row.tanggal)
  if (!valid.length) throw new Error('Tidak ada baris Service valid. Pastikan No. Polisi dan Tanggal tersedia.')
  const groups = groupRows(valid)
  const plates = [...new Set(valid.map(row => row.nomor_polisi))]
  const [{ data: vehicles, error: vehicleError }, { data: existing, error: existingError }] = await Promise.all([
    supabase.from('kendaraan').select('id,nomor_polisi,kilometer_terakhir'),
    supabase.from('service').select('id,kendaraan_id,tanggal_service,bengkel'),
  ])
  if (vehicleError) throw new Error(`Tidak bisa membaca Master Kendaraan: ${vehicleError.message}`)
  if (existingError) throw new Error(`Tidak bisa membaca histori service: ${existingError.message}`)

  const vehicleMap = Object.fromEntries((vehicles || []).map(v => [upper(v.nomor_polisi), v]))
  const existingKeys = new Set((existing || []).map(s => `${s.kendaraan_id}|${s.tanggal_service}|${upper(s.bengkel || '-')}`))
  const unknownPlates = [...new Set(plates.filter(plate => !vehicleMap[plate]))]
  const candidates = []
  let skipped = 0

  groups.forEach(group => {
    const first = group.values[0]
    const vehicle = vehicleMap[first.nomor_polisi]
    if (!vehicle) { skipped += 1; return }
    const duplicateKey = `${vehicle.id}|${first.tanggal}|${upper(first.bengkel || '-')}`
    if (existingKeys.has(duplicateKey)) skipped += 1
    else candidates.push({ group, vehicle, duplicateKey })
  })

  const results = []
  let cursor = 0
  let completed = 0
  let failure = null
  const worker = async () => {
    while (!failure) {
      const index = cursor++
      if (index >= candidates.length) return
      try {
        const { group, vehicle, duplicateKey } = candidates[index]
        const first = group.values[0]
        const dpp = group.values.reduce((sum, row) => sum + row.nilai_dpp, 0)
        const ppn = group.values.reduce((sum, row) => sum + row.ppn, 0)
        const total = group.values.reduce((sum, row) => sum + row.total, 0)
        const kilometer = Math.max(...group.values.map(row => row.kilometer || 0))
        const jenisService = typeFor(group.values)
        const label = group.values.find(row => row.jenis_pekerjaan)?.jenis_pekerjaan || 'Service'
        const complaint = group.values.find(row => row.uraian)?.uraian || `Riwayat ${label}`
        const historyNote = `Import histori Excel: ${sheetName}`

        const request = await supabase.from('permintaan_service').insert({
          pemohon_id: profile.id,
          kendaraan_id: vehicle.id,
          tanggal_pengajuan: first.tanggal,
          kilometer_pengajuan: kilometer,
          jenis_permintaan: jenisService,
          keluhan: complaint,
          prioritas: 'NORMAL',
          status: 'MENUNGGU_TRANSPORT',
        }).select('id').single()
        if (request.error) throw new Error(`Gagal membuat histori pengajuan ${first.nomor_polisi} (baris ${first.excelRow}): ${request.error.message}`)

        const serviceNumber = `IMP-SRV-${Date.now()}-${index + 1}`
        const service = await supabase.from('service').insert({
          nomor_service: serviceNumber,
          permintaan_service_id: request.data.id,
          kendaraan_id: vehicle.id,
          tanggal_service: first.tanggal,
          kilometer,
          bengkel: first.bengkel,
          jenis_service: jenisService,
          keluhan: complaint,
          estimasi_biaya: total,
          biaya_aktual: total,
          status: 'DALAM_PENGERJAAN',
          diproses_oleh: profile.id,
          nilai_dpp: dpp,
          ppn,
          total,
          catatan: historyNote,
        }).select('id').single()
        if (service.error) throw new Error(`Gagal membuat histori service ${first.nomor_polisi} (baris ${first.excelRow}): ${service.error.message}`)

        const itemRows = group.values.map(row => {
          const subtotal = row.nilai_dpp || row.total || (row.qty * row.harga_satuan)
          const harga = row.qty ? subtotal / row.qty : subtotal
          return {
            service_id: service.data.id,
            nama_item: row.uraian || row.jenis_pekerjaan || 'Item Excel',
            kategori: itemCategory(row.jenis_pekerjaan || row.uraian),
            jumlah: row.qty > 0 ? row.qty : 1,
            satuan: row.satuan || 'pcs',
            harga_satuan: harga || 0,
            subtotal: subtotal || 0,
            keterangan: row.keterangan || null,
          }
        })
        if (itemRows.length) {
          const itemResult = await supabase.from('service_item').insert(itemRows)
          if (itemResult.error) throw new Error(`Gagal menyimpan item service ${first.nomor_polisi} (baris ${first.excelRow}): ${itemResult.error.message}`)
        }

        const completedService = await supabase.from('service').update({ status: 'SELESAI', selesai_at: new Date().toISOString() }).eq('id', service.data.id)
        if (completedService.error) throw new Error(`Gagal menyelesaikan histori service ${first.nomor_polisi}: ${completedService.error.message}`)
        const completedRequest = await supabase.from('permintaan_service').update({ status: 'SELESAI' }).eq('id', request.data.id)
        if (completedRequest.error) throw new Error(`Gagal menutup histori pengajuan ${first.nomor_polisi}: ${completedRequest.error.message}`)

        results[index] = { group, duplicateKey, itemCount: itemRows.length, km: kilometer > Number(vehicle.kilometer_terakhir || 0) ? { kendaraan_id: vehicle.id, nomor_polisi: first.nomor_polisi, tanggal: first.tanggal, kilometer, keterangan: historyNote } : null }
        completed += 1
        onProgress({ completed, total: candidates.length })
      } catch (error) {
        failure = error
      }
    }
  }

  onProgress({ completed: 0, total: candidates.length })
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, Math.max(candidates.length, 1)) }, worker))
  if (failure) throw failure

  const kmUpdates = new Map()
  const kmHistory = []
  let itemCount = 0
  results.filter(Boolean).forEach(result => {
    itemCount += result.itemCount
    if (!result.km) return
    const previous = kmUpdates.get(result.km.kendaraan_id)
    if (!previous || result.km.kilometer > previous.kilometer) kmUpdates.set(result.km.kendaraan_id, result.km)
    kmHistory.push({ kendaraan_id: result.km.kendaraan_id, tanggal: result.km.tanggal, kilometer: result.km.kilometer, sumber: 'IMPORT_EXCEL_SERVICE', keterangan: result.km.keterangan, dicatat_oleh: profile.id })
  })

  await Promise.all([...kmUpdates.values()].map(async update => {
    const { error } = await supabase.from('kendaraan').update({ kilometer_terakhir: update.kilometer }).eq('id', update.kendaraan_id)
    if (error) throw new Error(`Histori service tersimpan tetapi KM ${update.nomor_polisi} gagal diperbarui: ${error.message}`)
  }))
  if (kmHistory.length) {
    const { error } = await supabase.from('riwayat_kilometer').insert(kmHistory)
    if (error) throw new Error(`KM master berhasil diperbarui tetapi riwayat KM gagal dicatat: ${error.message}`)
  }

  return { sourceRows: rows.length, validRows: valid.length, transactions: groups.length, imported: results.filter(Boolean).length, skipped, unknownPlates, items: itemCount, kmUpdated: kmUpdates.size }
}

export default function ServiceHistoryImportModalRobust({ profile, onDone, onClose }) {
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [workbook, setWorkbook] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [progress, setProgress] = useState({ completed: 0, total: 0 })
  const canImport = ['ADMIN', 'TRANSPORT'].includes(profile?.role)

  const scan = async nextFile => {
    setFile(nextFile || null); setWorkbook(null); setError(''); setMessage(''); setProgress({ completed: 0, total: 0 })
    if (!nextFile) return
    if (!/\.xlsx$/i.test(nextFile.name)) return setError('Gunakan file Excel .xlsx. Format .xls lama belum didukung.')
    if (nextFile.size > MAX_FILE_SIZE) return setError('Ukuran file maksimal 25 MB.')
    setLoading(true)
    try {
      const sheets = await parseXlsx(nextFile)
      const chosen = chooseServiceSheet(sheets)
      if (!chosen || chosen.score < 12) {
        const available = sheets.map(sheet => sheet.name).filter(Boolean).join(', ')
        throw new Error(`Sheet histori service tidak ditemukan. File terbaca, tetapi tidak ada sheet Data Service yang sesuai. Sheet yang ditemukan: ${available || '(tidak ada nama)'}. Untuk histori service pilih sheet “Data Service”.`)
      }
      const dataRows = chosen.sheet.rows.slice(chosen.header.index + 1).filter(row => row.values.some(value => clean(value)))
      const parsed = dataRows.map(row => parseRow(row, chosen.header.row))
      const valid = parsed.filter(row => row.nomor_polisi && row.tanggal)
      const transactions = groupRows(valid)
      const uniquePlates = [...new Set(valid.map(row => row.nomor_polisi))]
      setWorkbook({ sheet: chosen.sheet, header: chosen.header, dataRows: parsed.slice(0, PREVIEW_LIMIT), sourceRowCount: parsed.length, valid, transactions, uniquePlates, invalid: parsed.length - valid.length })
      setMessage(`Sheet “${chosen.sheet.name}” terdeteksi: ${parsed.length} baris sumber • ${valid.length} valid • ${transactions.length} transaksi service.`)
    } catch (e) {
      setError(e.message || 'File Excel tidak dapat dibaca.')
    } finally { setLoading(false) }
  }

  const start = async () => {
    if (!workbook || !canImport || saving) return
    setSaving(true); setError(''); setProgress({ completed: 0, total: workbook.transactions.length }); setMessage(`Memproses import: 0/${workbook.transactions.length} transaksi...`)
    try {
      const result = await importHistory(workbook.valid, profile, workbook.sheet.name, ({ completed, total }) => { setProgress({ completed, total }); setMessage(`Memproses import: ${completed}/${total} transaksi...`) })
      const report = { context: 'service', ...result, validRows: workbook.valid.length, transactions: result.imported, fileName: file?.name || '', completedAt: new Date().toISOString(), message: `${result.imported} transaksi baru disimpan • ${result.skipped} dilewati • ${result.items} item tersimpan • ${result.kmUpdated} KM kendaraan diperbarui.` }
      sessionStorage.setItem('transport_import_report', JSON.stringify(report))
      setProgress({ completed: workbook.transactions.length, total: workbook.transactions.length })
      setMessage(report.message)
      if (result.unknownPlates.length) setError(`Plat belum ada di Master Kendaraan: ${result.unknownPlates.slice(0, 20).join(', ')}${result.unknownPlates.length > 20 ? ' …' : ''}. Baris tersebut tidak dibuat otomatis.`)
      onDone?.(report)
    } catch (e) {
      setError(e.message || 'Import histori service gagal.')
      setMessage('Import berhenti. Data yang sudah tersimpan tetap ada dan tidak diulang otomatis.')
    } finally { setSaving(false) }
  }

  return (
    <div className="dpt-overlay" role="dialog" aria-modal="true" aria-label="Import Histori Service">
      <section className="dpt-modal service-import-modal">
        <header className="dpt-modal-head"><div><span className="eyebrow">IMPORT EXCEL SERVICE</span><h3>Histori Service & Perbaikan</h3><p>Gunakan sheet Data Service dari workbook kendaraan/service.</p></div><button type="button" className="dpt-icon" onClick={onClose}>×</button></header>
        {error && <div className="dpt-alert error">{error}</div>}
        {message && <div className="dpt-alert success">{message}</div>}
        {saving && progress.total > 0 && <div className="dpt-progress" aria-live="polite"><div className="dpt-progress-bar"><span style={{ width: `${Math.min(100, Math.round((progress.completed / progress.total) * 100))}%` }} /></div><small>{progress.completed} dari {progress.total} transaksi selesai diproses.</small></div>}
        <div className="dpt-upload"><input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e => scan(e.target.files?.[0])} /><button type="button" className="dpt-upload-button" onClick={() => inputRef.current?.click()} disabled={loading || saving}>{loading ? 'Membaca Excel…' : file ? 'Ganti File' : 'Pilih File Excel'}</button><div className="dpt-file-meta"><strong title={file?.name}>{file?.name || 'Belum ada file'}</strong><span>{file ? `✓ .xlsx • ${(file.size / 1024 / 1024).toFixed(2)} MB` : 'Maksimal 25 MB'}</span></div></div>
        {workbook && <>
          <div className="service-import-stats"><div><b>{workbook.sourceRowCount}</b><span>baris sumber</span></div><div><b>{workbook.valid.length}</b><span>baris valid</span></div><div><b>{workbook.transactions.length}</b><span>transaksi service</span></div><div><b>{workbook.uniquePlates.length}</b><span>kendaraan</span></div></div>
          {workbook.invalid > 0 && <div className="service-import-warning">{workbook.invalid} baris tanpa No. Polisi atau Tanggal valid tidak akan diimport.</div>}
          <div className="service-import-note"><b>Aturan import</b><span>Data Service → Service & Perbaikan.</span><span>Baris dengan kendaraan + tanggal + bengkel yang sama digabung menjadi satu transaksi.</span><span>Uraian masuk sebagai Item Service.</span><span>DPP, PPN, Total, KM, Bengkel, dan Keterangan dipertahankan.</span><span>Plat yang belum ada di Master Kendaraan tidak dibuat otomatis.</span></div>
          <div className="service-import-map"><div><b>No. Polisi</b><span>→</span><span>Kendaraan</span></div><div><b>Tanggal</b><span>→</span><span>Tanggal Service</span></div><div><b>Uraian</b><span>→</span><span>Item Service</span></div><div><b>Total</b><span>→</span><span>Biaya Aktual</span></div><div><b>KM</b><span>→</span><span>Master + Riwayat KM</span></div><div><b>Nama Bengkel</b><span>→</span><span>Bengkel</span></div></div>
          <div className="dpt-preview"><div className="dpt-sheet-title"><b>Preview: {workbook.sheet.name}</b><span>{workbook.sourceRowCount} baris sumber{workbook.sourceRowCount > PREVIEW_LIMIT ? ` • menampilkan ${PREVIEW_LIMIT}` : ''}</span></div><div className="dpt-preview-wrap"><table><thead><tr>{workbook.header.row.map((header, index) => <th key={`${header}-${index}`}>{header || `Kolom ${index + 1}`}</th>)}</tr></thead><tbody>{workbook.dataRows.map(row => <tr key={row.excelRow}>{workbook.header.row.map((_, index) => <td key={index}>{clean(row.values[index]) || '-'}</td>)}</tr>)}</tbody></table></div></div>
        </>}
        <div className="dpt-actions"><button type="button" className="dpt-button" onClick={onClose} disabled={saving}>Batal</button><button type="button" className="dpt-button primary" onClick={start} disabled={!workbook || saving || !canImport}>{saving ? `Mengimport ${progress.completed}/${progress.total}…` : 'Import Histori Service'}</button></div>
      </section>
    </div>
  )
}
