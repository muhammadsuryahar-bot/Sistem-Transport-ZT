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
const colIndex = name => { let n = 0; for (const c of name) n = n * 26 + c.charCodeAt(0) - 64; return n - 1 }
const text = bytes => new TextDecoder('utf-8').decode(bytes)

function elements(root, localName) {
  return Array.from(root.getElementsByTagNameNS('*', localName))
}
function firstElement(root, localName) {
  return elements(root, localName)[0] || null
}
function childElements(root, localName) {
  return Array.from(root.children || []).filter(node => node.localName === localName)
}
function childElement(root, localName) {
  return childElements(root, localName)[0] || null
}
function attr(root, name) { return root?.getAttribute(name) || '' }

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
    const name = text(bytes.slice(p + 46, p + 46 + nameLen))
    const local = new DataView(buffer, localOffset)
    const localNameLen = local.getUint16(26, true)
    const localExtraLen = local.getUint16(28, true)
    const start = localOffset + 30 + localNameLen + localExtraLen
    entries.set(name, { method, bytes: bytes.slice(start, start + compSize) })
    p += 46 + nameLen + extraLen + commentLen
  }
  return {
    read: async name => {
      const entry = entries.get(name)
      if (!entry) return null
      if (entry.method === 0) return entry.bytes
      if (entry.method === 8) return inflate(entry.bytes)
      throw new Error(`Metode kompresi XLSX ${entry.method} belum didukung.`)
    },
  }
}

function parseSheetXml(xml, sharedStrings) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (firstElement(doc, 'parsererror')) throw new Error('Sheet XLSX tidak dapat dibaca.')
  const worksheetData = firstElement(doc, 'sheetData')
  if (!worksheetData) return []
  const rows = []
  for (const row of childElements(worksheetData, 'row')) {
    const values = []
    for (const cell of childElements(row, 'c')) {
      const ref = attr(cell, 'r')
      const match = ref.match(/^([A-Z]+)/)
      if (!match) continue
      const idx = colIndex(match[1])
      const type = attr(cell, 't')
      const vNode = childElement(cell, 'v')
      const isNode = childElement(cell, 'is')
      const valueNodes = isNode ? elements(isNode, 't') : []
      let value = clean(vNode?.textContent)
      if (type === 's') value = sharedStrings[Number(value)] || ''
      else if (type === 'inlineStr') value = clean(valueNodes.map(node => node.textContent || '').join(''))
      else if (type === 'b') value = value === '1' ? 'TRUE' : 'FALSE'
      values[idx] = value
    }
    if (values.some(value => clean(value))) rows.push({ excelRow: Number(attr(row, 'r') || rows.length + 1), values })
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
    for (const si of elements(doc, 'si')) sharedStrings.push(clean(elements(si, 't').map(t => t.textContent || '').join('')))
  }
  const relMap = {}
  for (const rel of elements(rels, 'Relationship')) relMap[attr(rel, 'Id')] = attr(rel, 'Target')
  const sheetsNode = firstElement(workbook, 'sheets')
  if (!sheetsNode) throw new Error('Workbook tidak memiliki daftar sheet.')
  const sheets = []
  for (const sheet of childElements(sheetsNode, 'sheet')) {
    const target0 = relMap[attr(sheet, 'r:id')] || relMap[attr(sheet, 'Id')]
    if (!target0) continue
    const target = target0.startsWith('xl/') ? target0 : `xl/${target0.replace(/^\//, '')}`
    const raw = await zip.read(target)
    if (!raw) continue
    sheets.push({ name: attr(sheet, 'name') || target, rows: parseSheetXml(text(raw), sharedStrings) })
  }
  if (!sheets.length) throw new Error('Tidak ada sheet yang bisa dibaca dari file Excel.')
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
function getValue(row, headers, key) { const aliases = ALIASES[key] || [key]; const index = headers.findIndex(header => aliases.includes(norm(header))); return index >= 0 ? clean(row.values[index]) : '' }
function numberValue(value) { const v = clean(value); if (!v) return null; if (/^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(v)) return Number(v.replace(/\./g, '').replace(',', '.')); const n = Number(v.replace(/,/g, '')); return Number.isFinite(n) ? n : null }
function serviceCurrency(value) { const v = clean(value); if (!v) return 0; if (/^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(v)) return Number(v.replace(/\./g, '').replace(',', '.')); const n = Number(v.replace(',', '.')); return Number.isFinite(n) ? n * 1000 : 0 }
function excelDate(value) {
  const v = clean(value)
  if (!v) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(v)) { const [d, m, y] = v.split(/[/-]/); return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` }
  const months = { jan:1, januari:1, feb:2, februari:2, mar:3, maret:3, apr:4, april:4, mei:5, may:5, jun:6, juni:6, jul:7, juli:7, agu:8, agustus:8, sep:9, september:9, okt:10, oktober:10, nov:11, november:11, des:12, desember:12 }
  const named = v.toLowerCase().replace(/\./g, '').match(/^(\d{1,2})[-\s/]([a-z]+)[-\s/](\d{2,4})$/)
  if (named) { const month = months[named[2]]; let year = Number(named[3]); if (year < 100) year += year >= 70 ? 1900 : 2000; if (month) return `${year}-${String(month).padStart(2, '0')}-${String(Number(named[1])).padStart(2, '0')}` }
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
    merk: getValue(row, headers, 'merk'), tipe: getValue(row, headers, 'tipe'), jenis: getValue(row, headers, 'jenis'), tahun: getValue(row, headers, 'tahun'), driver: getValue(row, headers, 'driver'),
    tanggal: excelDate(getValue(row, headers, 'tanggal')),
    jenis_pekerjaan: getValue(row, headers, 'jenis_pekerjaan'), uraian: getValue(row, headers, 'uraian'), qty: numberValue(getValue(row, headers, 'qty')) ?? 1,
    satuan: getValue(row, headers, 'satuan') || 'pcs', harga_satuan: serviceCurrency(getValue(row, headers, 'harga_satuan')), nilai_dpp: serviceCurrency(getValue(row, headers, 'nilai_dpp')), ppn: serviceCurrency(getValue(row, headers, 'ppn')), total: serviceCurrency(getValue(row, headers, 'total')),
    kilometer: numberValue(getValue(row, headers, 'kilometer')) ?? 0, bengkel: getValue(row, headers, 'bengkel') || null, keterangan: getValue(row, headers, 'keterangan') || null,
  }
}
function typeFor(rows) { const raw = rows.map(r => upper(r.jenis_pekerjaan)).join(' '); if (/GANTI\s+BAN|PENGGANTIAN\s+BAN/.test(raw)) return 'GANTI_BAN'; if (/GANTI\s+(AKI|BATERAI)|PENGGANTIAN\s+(AKI|BATERAI)/.test(raw)) return 'GANTI_AKI'; if (/PEMERIKSAAN/.test(raw)) return 'PEMERIKSAAN'; return 'SERVICE' }
function itemCategory(value) { const raw = upper(value); if (/BAN/.test(raw)) return 'BAN'; if (/AKI|BATERAI/.test(raw)) return 'AKI_BATERAI'; if (/JASA|SERVICE/.test(raw)) return 'JASA_SERVICE'; return 'MATERIAL_SPAREPART' }
function chooseServiceSheet(sheets) {
  return sheets.map(sheet => { const header = findHeader(sheet), h = header.row.map(norm), name = norm(sheet.name); let score = 0; if (name === 'data_service') score += 30; else if (name.includes('data_service')) score += 18; if (name.includes('rekapan_permintaan')) score += 12; if (name.includes('monitoring_perbaikan')) score += 10; if (h.includes('no_polisi') || h.includes('no_pol')) score += 5; if (h.includes('tanggal')) score += 4; if (h.includes('uraian')) score += 4; if (h.includes('nilai_dpp') || h.includes('dpp')) score += 3; return { sheet, header, score } }).sort((a,b) => b.score - a.score)[0]
}
function groupRows(rows) { const groups = new Map(); rows.forEach(row => { const key = `${row.nomor_polisi}|${row.tanggal}|${upper(row.bengkel || '-')}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row) }); return [...groups.entries()].map(([key, values]) => ({ key, values })) }

async function importHistory(rows, profile, sheetName, onProgress) {
  const valid = rows.filter(row => row.nomor_polisi && row.tanggal)
  const groups = groupRows(valid)
  const [{ data: vehicles, error: vehicleError }, { data: existing, error: existingError }] = await Promise.all([
    supabase.from('kendaraan').select('id,nomor_polisi,kilometer_terakhir'),
    supabase.from('service').select('id,kendaraan_id,tanggal_service,bengkel'),
  ])
  if (vehicleError) throw new Error(`Tidak bisa membaca master kendaraan: ${vehicleError.message}`)
  if (existingError) throw new Error(`Tidak bisa membaca histori service: ${existingError.message}`)
  const vehicleMap = Object.fromEntries((vehicles || []).map(v => [upper(v.nomor_polisi), v]))
  const existingKeys = new Set((existing || []).map(s => `${s.kendaraan_id}|${s.tanggal_service}|${upper(s.bengkel || '-')}`))
  const unknownPlates = [...new Set(valid.map(r => r.nomor_polisi).filter(p => !vehicleMap[p]))]
  const skipped = groups.filter(group => { const v = vehicleMap[group.values[0].nomor_polisi]; return v && existingKeys.has(`${v.id}|${group.values[0].tanggal}|${upper(group.values[0].bengkel || '-')}`) })
  const candidates = groups.filter(group => { const v = vehicleMap[group.values[0].nomor_polisi]; return v && !existingKeys.has(`${v.id}|${group.values[0].tanggal}|${upper(group.values[0].bengkel || '-')}`) }).map(group => ({ group, vehicle: vehicleMap[group.values[0].nomor_polisi] }))
  const results = []
  let cursor = 0
  let completed = 0
  let failure = null
  onProgress?.({ completed: 0, total: candidates.length })
  const processCandidate = async (candidate, index) => {
    const { group, vehicle } = candidate
    const first = group.values[0]
    const dpp = group.values.reduce((sum, row) => sum + row.nilai_dpp, 0)
    const ppn = group.values.reduce((sum, row) => sum + row.ppn, 0)
    const total = group.values.reduce((sum, row) => sum + row.total, 0)
    const kilometer = Math.max(...group.values.map(row => row.kilometer || 0))
    const jenis = typeFor(group.values)
    const complaint = group.values.find(row => row.uraian)?.uraian || `Riwayat ${jenis}`
    const note = `Import histori Excel: ${sheetName}`
    const request = await supabase.from('permintaan_service').insert({ pemohon_id: profile.id, kendaraan_id: vehicle.id, tanggal_pengajuan: first.tanggal, kilometer_pengajuan: kilometer, jenis_permintaan: jenis, keluhan: complaint, prioritas: 'NORMAL', status: 'MENUNGGU_TRANSPORT' }).select('id').single()
    if (request.error) throw new Error(`Gagal membuat histori pengajuan ${first.nomor_polisi} baris ${first.excelRow}: ${request.error.message}`)
    const service = await supabase.from('service').insert({ nomor_service: `IMP-SRV-${Date.now()}-${index + 1}`, permintaan_service_id: request.data.id, kendaraan_id: vehicle.id, tanggal_service: first.tanggal, kilometer, bengkel: first.bengkel, jenis_service: jenis, keluhan: complaint, estimasi_biaya: total, biaya_aktual: total, status: 'DALAM_PENGERJAAN', diproses_oleh: profile.id, nilai_dpp: dpp, ppn, total, catatan: note }).select('id').single()
    if (service.error) throw new Error(`Gagal membuat histori service ${first.nomor_polisi} baris ${first.excelRow}: ${service.error.message}`)
    const itemRows = group.values.map(row => {
      const subtotal = row.nilai_dpp || row.total || (row.qty * row.harga_satuan)
      const harga = row.qty ? subtotal / row.qty : subtotal
      return { service_id: service.data.id, nama_item: row.uraian || row.jenis_pekerjaan || 'Item Excel', kategori: itemCategory(row.jenis_pekerjaan || row.uraian), jumlah: row.qty > 0 ? row.qty : 1, satuan: row.satuan || 'pcs', harga_satuan: harga || 0, subtotal: subtotal || 0, keterangan: row.keterangan || null }
    })
    if (itemRows.length) { const itemResult = await supabase.from('service_item').insert(itemRows); if (itemResult.error) throw new Error(`Gagal menyimpan item service ${first.nomor_polisi}: ${itemResult.error.message}`) }
    const completeResult = await supabase.from('service').update({ status: 'SELESAI', selesai_at: new Date().toISOString() }).eq('id', service.data.id)
    if (completeResult.error) throw new Error(`Gagal menyelesaikan histori service ${first.nomor_polisi}: ${completeResult.error.message}`)
    const requestComplete = await supabase.from('permintaan_service').update({ status: 'SELESAI' }).eq('id', request.data.id)
    if (requestComplete.error) throw new Error(`Gagal menutup histori pengajuan ${first.nomor_polisi}: ${requestComplete.error.message}`)
    return { group, vehicleId: vehicle.id, nomor_polisi: first.nomor_polisi, itemCount: itemRows.length, kilometer }
  }
  const worker = async () => {
    while (!failure) {
      const index = cursor++
      if (index >= candidates.length) return
      try {
        results[index] = await processCandidate(candidates[index], index)
        completed += 1
        onProgress?.({ completed, total: candidates.length })
      } catch (error) { failure = error; return }
    }
  }
  const workerCount = Math.min(CONCURRENCY, Math.max(1, candidates.length))
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  if (failure) throw failure
  const kmMap = new Map()
  for (const result of results.filter(Boolean)) {
    const current = kmMap.get(result.vehicleId)
    if (result.kilometer > Number(current?.kilometer || 0)) kmMap.set(result.vehicleId, result)
  }
  const kmRows = results.filter(Boolean).filter(result => result.kilometer > Number(vehicles.find(v => v.id === result.vehicleId)?.kilometer_terakhir || 0)).map(result => ({ kendaraan_id: result.vehicleId, tanggal: result.group.values[0].tanggal, kilometer: result.kilometer, sumber: 'IMPORT_EXCEL_SERVICE', keterangan: `Import histori Excel: ${sheetName}`, dicatat_oleh: profile.id }))
  for (const result of kmMap.values()) {
    const current = vehicles.find(v => v.id === result.vehicleId)
    if (!current || result.kilometer <= Number(current.kilometer_terakhir || 0)) continue
    const updated = await supabase.from('kendaraan').update({ kilometer_terakhir: result.kilometer }).eq('id', result.vehicleId)
    if (updated.error) throw new Error(`Histori service masuk tetapi KM ${result.nomor_polisi} gagal diperbarui: ${updated.error.message}`)
  }
  if (kmRows.length) { const history = await supabase.from('riwayat_kilometer').insert(kmRows); if (history.error) throw new Error(`KM master sudah diperbarui tetapi riwayat KM gagal dicatat: ${history.error.message}`) }
  return { sourceRows: rows.length, validRows: valid.length, transactions: groups.length, imported: results.length, skipped: skipped.length + unknownPlates.length, unknownPlates, items: results.reduce((sum, r) => sum + r.itemCount, 0), kmUpdated: kmMap.size }
}

export default function ServiceHistoryImportModalRobust({ profile, onDone, onClose }) {
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [workbook, setWorkbook] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState({ completed: 0, total: 0 })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
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
      if (!chosen || chosen.score < 9) throw new Error('Sheet histori service tidak ditemukan. Untuk file ini gunakan sheet “Data Service” yang memiliki No. Polisi + Tanggal + Uraian.')
      const rawRows = chosen.sheet.rows.slice(chosen.header.index + 1).filter(row => row.values.some(value => clean(value)))
      const parsed = rawRows.map(row => parseRow(row, chosen.header.row))
      const valid = parsed.filter(row => row.nomor_polisi && row.tanggal)
      const transactions = groupRows(valid)
      const uniquePlates = [...new Set(valid.map(row => row.nomor_polisi))]
      setWorkbook({ sheet: chosen.sheet, header: chosen.header, dataRows: parsed, valid, transactions, uniquePlates, invalid: parsed.length - valid.length })
      setMessage(`Sheet “${chosen.sheet.name}” terdeteksi: ${parsed.length} baris sumber • ${valid.length} valid • ${transactions.length} transaksi.`)
    } catch (e) { setError(e.message || 'File Excel tidak dapat dibaca.') }
    finally { setLoading(false) }
  }

  const start = async () => {
    if (!workbook || !canImport || saving) return
    setSaving(true); setError(''); setProgress({ completed: 0, total: workbook.transactions.length }); setMessage(`Memproses import: 0/${workbook.transactions.length} transaksi...`)
    try {
      const result = await importHistory(workbook.valid, profile, workbook.sheet.name, ({ completed, total }) => { setProgress({ completed, total }); setMessage(`Memproses import: ${completed}/${total} transaksi...`) })
      const report = { context: 'service', ...result, validRows: workbook.valid.length, fileName: file?.name || '', completedAt: new Date().toISOString(), message: `Import selesai: ${result.imported} transaksi baru • ${result.skipped} dilewati • ${result.items} item tersimpan • ${result.kmUpdated} kendaraan diperbarui.` }
      sessionStorage.setItem('transport_import_report', JSON.stringify(report))
      setProgress({ completed: workbook.transactions.length, total: workbook.transactions.length })
      setMessage(report.message)
      onDone?.(report)
    } catch (e) { setError(e.message || 'Import histori service gagal.'); setMessage('Import dihentikan. Data yang sudah tersimpan tetap ada dan tidak akan dianggap berhasil ulang pada import berikutnya.') }
    finally { setSaving(false) }
  }

  return <div className="dpt-overlay" role="dialog" aria-modal="true" aria-label="Import Histori Service">
    <section className="dpt-modal service-import-modal">
      <header className="dpt-modal-head"><div><span className="eyebrow">IMPORT EXCEL SERVICE</span><h3>Histori Service & Perbaikan</h3><p>Reader XLSX sekarang membaca namespace XML secara aman dan memilih sheet berdasarkan struktur data nyata.</p></div><button type="button" className="dpt-icon" onClick={onClose}>×</button></header>
      {error && <div className="dpt-alert error">{error}</div>}{message && <div className="dpt-alert success">{message}</div>}
      {saving && progress.total > 0 && <div className="dpt-progress" aria-live="polite"><div className="dpt-progress-bar"><span style={{ width: `${Math.min(100, Math.round((progress.completed / progress.total) * 100))}%` }} /></div><small>{progress.completed} dari {progress.total} transaksi selesai diproses.</small></div>}
      <div className="dpt-upload"><input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e => scan(e.target.files?.[0])} /><button type="button" className="dpt-upload-button" onClick={() => inputRef.current?.click()} disabled={loading || saving}>{loading ? 'Membaca Excel…' : file ? 'Ganti File' : 'Pilih File Excel'}</button><div className="dpt-file-meta"><strong title={file?.name}>{file?.name || 'Belum ada file'}</strong><span>{file ? `✓ .xlsx • ${(file.size / 1024 / 1024).toFixed(2)} MB` : 'Maksimal 25 MB'}</span></div></div>
      {workbook && <>
        <div className="service-import-stats"><div><b>{workbook.dataRows.length}</b><span>baris sumber</span></div><div><b>{workbook.valid.length}</b><span>baris valid</span></div><div><b>{workbook.transactions.length}</b><span>transaksi service</span></div><div><b>{workbook.uniquePlates.length}</b><span>kendaraan</span></div></div>
        {workbook.invalid > 0 && <div className="service-import-warning">{workbook.invalid} baris tidak memiliki No. Polisi atau Tanggal lengkap dan tidak akan diimport.</div>}
        <div className="service-import-note"><b>Audit mapping yang dipakai</b><span>Data Service → Service & Perbaikan</span><span>No. Polisi → Kendaraan</span><span>Uraian → Item Service</span><span>DPP/PPN/Total → rincian biaya</span><span>KM → service + master kendaraan + riwayat KM</span><span>Baris kendaraan + tanggal + bengkel sama digabung menjadi 1 transaksi</span></div>
        <div className="service-import-map"><div><b>No. Polisi</b><span>→</span><span>Kendaraan</span></div><div><b>Tanggal</b><span>→</span><span>Tanggal Service</span></div><div><b>Jenis Pekerjaan</b><span>→</span><span>Jenis Service</span></div><div><b>Uraian</b><span>→</span><span>Item Service</span></div><div><b>Nilai DPP</b><span>→</span><span>DPP</span></div><div><b>PPn</b><span>→</span><span>PPN</span></div><div><b>Total</b><span>→</span><span>Total + Aktual</span></div><div><b>KM</b><span>→</span><span>KM + Riwayat</span></div><div><b>Nama Bengkel</b><span>→</span><span>Bengkel</span></div></div>
        <div className="dpt-preview"><div className="dpt-sheet-title"><b>Preview Sumber: {workbook.sheet.name}</b><span>{Math.min(workbook.dataRows.length, PREVIEW_LIMIT)} dari {workbook.dataRows.length} baris ditampilkan</span></div><div className="dpt-preview-wrap"><table><thead><tr>{workbook.header.row.map((header, index) => <th key={`${header}-${index}`}>{header || `Kolom ${index + 1}`}</th>)}</tr></thead><tbody>{workbook.dataRows.slice(0, PREVIEW_LIMIT).map(row => <tr key={row.excelRow}>{workbook.header.row.map((header, index) => <td key={index}>{clean(row.values[index]) || '-'}</td>)}</tr>)}</tbody></table></div></div>
      </>}
      <div className="dpt-actions"><button type="button" className="dpt-button" onClick={onClose} disabled={saving}>Batal</button><button type="button" className="dpt-button primary" onClick={start} disabled={!workbook || saving || !canImport}>{saving ? `Mengimport ${progress.completed}/${progress.total}…` : 'Import Histori Service'}</button></div>
    </section>
  </div>
}
