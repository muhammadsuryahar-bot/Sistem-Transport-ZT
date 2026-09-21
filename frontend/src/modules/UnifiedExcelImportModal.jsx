import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatDateSafe } from '../utils/dateSafe'

const LABELS = {
  pengajuan: 'Pengajuan Service',
  sewa: 'Kendaraan Sewa',
}

const ALIASES = {
  nomor_polisi: ['nomor_polisi', 'no_polisi', 'no_pol', 'no_plat', 'plat', 'nomor_kendaraan'],
  kilometer: ['km', 'kilometer', 'km_terakhir', 'kilometer_terakhir', 'kilometer_pengajuan'],
  tanggal: ['tanggal', 'tgl', 'tanggal_pengajuan'],
  jenis_permintaan: ['jenis_permintaan', 'jenis_perbaikan', 'jenis_service'],
  keluhan: ['keluhan', 'keluhan_kerusakan', 'uraian_kerusakan', 'uraian'],
  prioritas: ['prioritas'],
  nomor_kontrak: ['nomor_kontrak', 'no_kontrak', 'kontrak'],
  pemilik: ['pemilik', 'nama_pemilik', 'pemilik_pic', 'nama_pemilik_pic', 'supplier'],
  nama_perusahaan: ['nama_perusahaan', 'perusahaan'],
  jenis_pemilik: ['jenis_pemilik', 'jenis_owner'],
  tanggal_mulai: ['tanggal_mulai', 'mulai'],
  tanggal_selesai: ['tanggal_selesai', 'selesai'],
  nilai_sewa_bulanan: ['nilai_sewa_bulanan', 'sewa_bulanan', 'harga_sewa'],
  tanggal_jatuh_tempo_bulanan: ['tanggal_jatuh_tempo_bulanan', 'jatuh_tempo_bulanan'],
}

const MAX_FILE_SIZE = 25 * 1024 * 1024
const BLOCKED_SHEETS = {
  pengajuan: new Set(['permintaan_perbaikan', 'pengajuan_perbaikan']),
  sewa: new Set(['sewa_kendaraan', 'summery_rental']),
}

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim()
const norm = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
const upper = (value) => clean(value).toUpperCase()

function readU16(view, offset) { return view.getUint16(offset, true) }
function readU32(view, offset) { return view.getUint32(offset, true) }
function text(bytes) { return new TextDecoder('utf-8').decode(bytes) }

async function inflate(bytes) {
  if (typeof DecompressionStream === 'undefined') throw new Error('Browser belum mendukung pembacaan XLSX. Gunakan Chrome/Edge terbaru.')
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function unzip(buffer) {
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  let eocd = -1
  for (let i = bytes.length - 22; i >= 0; i -= 1) if (readU32(view, i) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) throw new Error('File bukan XLSX yang valid atau file rusak.')
  const count = readU16(view, eocd + 10)
  const centralOffset = readU32(view, eocd + 16)
  const entries = new Map()
  let p = centralOffset
  for (let i = 0; i < count; i += 1) {
    if (readU32(view, p) !== 0x02014b50) throw new Error('Struktur ZIP XLSX tidak valid.')
    const method = readU16(view, p + 10)
    const compSize = readU32(view, p + 20)
    const nameLen = readU16(view, p + 28)
    const extraLen = readU16(view, p + 30)
    const commentLen = readU16(view, p + 32)
    const localOffset = readU32(view, p + 42)
    const name = text(bytes.slice(p + 46, p + 46 + nameLen))
    const local = new DataView(buffer, localOffset)
    const localNameLen = readU16(local, 26)
    const localExtraLen = readU16(local, 28)
    const start = localOffset + 30 + localNameLen + localExtraLen
    entries.set(name, { method, bytes: bytes.slice(start, start + compSize) })
    p += 46 + nameLen + extraLen + commentLen
  }
  return { read: async (name) => { const entry = entries.get(name); if (!entry) return null; if (entry.method === 0) return entry.bytes; if (entry.method === 8) return inflate(entry.bytes); throw new Error(`Metode kompresi XLSX ${entry.method} belum didukung.`) } }
}

function colIndex(name) {
  let n = 0
  for (const c of name) n = n * 26 + c.charCodeAt(0) - 64
  return n - 1
}

function parseSheetXml(xml, sharedStrings) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('Sheet XLSX tidak dapat dibaca.')
  const rows = []
  doc.querySelectorAll('sheetData > row').forEach((row) => {
    const values = []
    row.querySelectorAll(':scope > c').forEach((cell) => {
      const ref = cell.getAttribute('r') || ''
      const match = ref.match(/^([A-Z]+)/)
      if (!match) return
      const idx = colIndex(match[1])
      const type = cell.getAttribute('t') || ''
      let value = clean(cell.querySelector('v')?.textContent)
      if (type === 's') value = sharedStrings[Number(value)] || ''
      else if (type === 'inlineStr') value = clean(Array.from(cell.querySelectorAll('is t')).map((node) => node.textContent || '').join(''))
      else if (type === 'b') value = value === '1' ? 'TRUE' : 'FALSE'
      values[idx] = value
    })
    rows.push(values)
  })
  return rows
}

async function parseXlsx(file) {
  const zip = await unzip(await file.arrayBuffer())
  const workbookXml = text(await zip.read('xl/workbook.xml') || new Uint8Array())
  const relsXml = text(await zip.read('xl/_rels/workbook.xml.rels') || new Uint8Array())
  if (!workbookXml || !relsXml) throw new Error('Workbook XLSX tidak lengkap.')
  const workbook = new DOMParser().parseFromString(workbookXml, 'application/xml')
  const rels = new DOMParser().parseFromString(relsXml, 'application/xml')
  const sharedStrings = []
  const shared = await zip.read('xl/sharedStrings.xml')
  if (shared) {
    const doc = new DOMParser().parseFromString(text(shared), 'application/xml')
    doc.querySelectorAll('si').forEach((si) => sharedStrings.push(clean(Array.from(si.querySelectorAll('t')).map((t) => t.textContent || '').join(''))))
  }
  const relMap = Object.fromEntries(Array.from(rels.querySelectorAll('Relationship')).map((r) => [r.getAttribute('Id'), r.getAttribute('Target')]))
  const sheets = []
  for (const sheet of Array.from(workbook.querySelectorAll('sheets > sheet'))) {
    const target0 = relMap[sheet.getAttribute('r:id')]
    if (!target0) continue
    const target = target0.startsWith('xl/') ? target0 : `xl/${target0.replace(/^\//, '')}`
    sheets.push({ name: sheet.getAttribute('name') || target, rows: parseSheetXml(text(await zip.read(target) || new Uint8Array()), sharedStrings) })
  }
  if (!sheets.length) throw new Error('Tidak ada sheet yang bisa dibaca dari file Excel.')
  return sheets
}

function findHeader(rows) {
  let best = { index: -1, row: [], score: -1 }
  rows.slice(0, 40).forEach((row, idx) => {
    const score = row.filter(Boolean).map(norm).filter(Boolean).length
    if (score > best.score) best = { index: idx, row, score }
  })
  return best.index >= 0 ? best : { index: 0, row: rows[0] || [], score: 0 }
}

function dataRows(sheet) { return sheet.rows.slice(sheet.headerIndex + 1).filter((row) => row.some((value) => clean(value))) }
function hasHeader(headers, key) { return headers.some((header) => (ALIASES[key] || []).includes(norm(header))) }
function valueOf(row, headers, key) { const aliases = ALIASES[key] || [key]; const index = headers.findIndex((header) => aliases.includes(norm(header))); return index >= 0 ? clean(row[index]) : '' }

function numberValue(value) {
  const v = clean(value)
  if (!v) return null
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(v)) return Number(v.replace(/\./g, '').replace(',', '.'))
  const n = Number(v.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

function excelDate(value) {
  const v = clean(value)
  if (!v) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(v)) { const [d, m, y] = v.split(/[/-]/); return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` }
  const serial = Number(v)
  if (Number.isFinite(serial) && serial > 20000 && serial < 80000) return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10)
  const date = new Date(v)
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
}

function addMonths(dateText, months) { const d = new Date(`${dateText}T00:00:00`); const day = d.getDate(); d.setMonth(d.getMonth() + months); if (d.getDate() !== day) d.setDate(0); return d.toISOString().slice(0, 10) }
function sixMonthEnd(start) { const end = addMonths(start, 6); const d = new Date(`${end}T00:00:00`); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10) }
function importFingerprint(item) { return [item.vehicle.id, item.date, upper(item.jenis), upper(item.complaint), item.km ?? ''].join('|') }

function sheetInfo(sheet) {
  const header = findHeader(sheet.rows)
  return { ...sheet, headerIndex: header.index, headers: header.row }
}

function requiredKeys(context) {
  return context === 'pengajuan' ? ['nomor_polisi', 'tanggal', 'keluhan'] : ['nomor_kontrak', 'nomor_polisi', 'pemilik', 'tanggal_mulai', 'tanggal_selesai', 'nilai_sewa_bulanan']
}

function scoreSheet(sheet, context) {
  const name = norm(sheet.name); const headers = sheet.headers.map(norm)
  if (BLOCKED_SHEETS[context]?.has(name)) return -100
  const required = requiredKeys(context)
  const hits = required.filter((key) => hasHeader(headers, key)).length
  return hits === required.length ? 100 + required.length : hits * 10
}

function validateSource(sheet, context) {
  const name = norm(sheet.name)
  if (BLOCKED_SHEETS[context]?.has(name)) {
    if (context === 'pengajuan') throw new Error('Sheet Pengajuan Perbaikan/PERMINTAAN PERBAIKAN pada FPD OPS adalah formulir blok historis, bukan tabel pengajuan. Import dihentikan agar data tidak salah mapping.')
    throw new Error('Sheet Sewa KEndaraan/SUMMERY RENTAL pada FPD OPS berisi formulir dana dan rekap pembayaran, bukan tabel kontrak sewa. Gunakan file kontrak sewa yang memiliki Nomor Kontrak + kendaraan + periode 6 bulan.')
  }
  const missing = requiredKeys(context).filter((key) => !hasHeader(sheet.headers, key))
  if (missing.length) {
    const names = { nomor_polisi: 'Nomor Polisi', tanggal: 'Tanggal', keluhan: 'Keluhan', nomor_kontrak: 'Nomor Kontrak', pemilik: 'Pemilik', tanggal_mulai: 'Tanggal Mulai', tanggal_selesai: 'Tanggal Selesai', nilai_sewa_bulanan: 'Nilai Sewa Bulanan' }
    throw new Error(`Format Excel ${LABELS[context]} tidak sesuai. Kolom wajib belum ada: ${missing.map((key) => names[key]).join(', ')}.`)
  }
  const rows = dataRows(sheet)
  if (!rows.length) throw new Error('Sheet yang dipilih tidak memiliki baris data.')
  return rows
}

async function importPengajuan(sheet, profile) {
  const rows = validateSource(sheet, 'pengajuan')
  const headers = sheet.headers
  const vehicles = await supabase.from('kendaraan').select('id,nomor_polisi,kilometer_terakhir,status')
  if (vehicles.error) throw new Error(`Tidak bisa membaca Master Kendaraan: ${vehicles.error.message}`)
  const vehicleMap = Object.fromEntries((vehicles.data || []).map((v) => [upper(v.nomor_polisi), v]))
  const valid = []
  const invalid = []
  const seen = new Set()
  for (const row of rows) {
    const plate = upper(valueOf(row, headers, 'nomor_polisi'))
    const complaint = valueOf(row, headers, 'keluhan')
    const date = excelDate(valueOf(row, headers, 'tanggal'))
    const jenis = valueOf(row, headers, 'jenis_permintaan') || 'SERVICE'
    const km = numberValue(valueOf(row, headers, 'kilometer')) ?? vehicleMap[plate]?.kilometer_terakhir ?? 0
    const vehicle = vehicleMap[plate]
    if (!plate || !complaint || !date || !vehicle || vehicle.status === 'TIDAK_AKTIF') {
      invalid.push({ plate, reason: !vehicle ? 'Plat belum ada di Master Kendaraan' : vehicle.status === 'TIDAK_AKTIF' ? 'Kendaraan tidak aktif' : 'Tanggal/Keluhan kosong atau tidak valid' })
      continue
    }
    const fingerprint = importFingerprint({ vehicle, date, jenis, complaint, km })
    if (seen.has(fingerprint)) {
      invalid.push({ plate, reason: 'Duplikat di file Excel' })
      continue
    }
    seen.add(fingerprint)
    valid.push({ row, plate, complaint, date, jenis, km, vehicle, fingerprint })
  }
  if (!valid.length) throw new Error('Tidak ada baris Pengajuan Service yang valid. Pastikan plat sudah ada di Master Kendaraan dan Tanggal/Keluhan terisi benar.')

  const existing = await supabase.from('permintaan_service').select('kendaraan_id,tanggal_pengajuan,kilometer_pengajuan,jenis_permintaan,keluhan')
  if (existing.error) throw new Error(`Tidak bisa memeriksa pengajuan lama: ${existing.error.message}`)
  const existingKeys = new Set((existing.data || []).map((item) => importFingerprint({ vehicle: { id: item.kendaraan_id }, date: item.tanggal_pengajuan, jenis: item.jenis_permintaan || 'SERVICE', complaint: item.keluhan || '', km: item.kilometer_pengajuan ?? 0 })))
  let added = 0
  let duplicate = 0
  for (const item of valid) {
    if (existingKeys.has(item.fingerprint)) { duplicate += 1; continue }
    const result = await supabase.from('permintaan_service').insert({ pemohon_id: profile.id, kendaraan_id: item.vehicle.id, tanggal_pengajuan: item.date, kilometer_pengajuan: item.km, jenis_permintaan: item.jenis, keluhan: item.complaint, prioritas: upper(valueOf(item.row, headers, 'prioritas') || 'NORMAL'), status: 'MENUNGGU_TRANSPORT' })
    if (result.error) throw new Error(`Gagal menyimpan pengajuan ${item.plate}: ${result.error.message}`)
    existingKeys.add(item.fingerprint)
    added += 1
  }
  const skipped = invalid.length + duplicate
  const unknownPlates = [...new Set(invalid.filter((item) => item.reason === 'Plat belum ada di Master Kendaraan').map((item) => item.plate).filter(Boolean))]
  return { imported: added, skipped, unknownPlates, duplicate, message: `${added} pengajuan ditambahkan, ${skipped} baris dilewati (${duplicate} sudah ada/duplikat). Tidak ada pengajuan ganda dari import yang sama.` }
}

async function importSewa(sheet, profile) {
  const rows = validateSource(sheet, 'sewa')
  const headers = sheet.headers
  const vehicles = await supabase.from('kendaraan').select('id,nomor_polisi,kepemilikan').eq('kepemilikan', 'SEWA')
  if (vehicles.error) throw new Error(`Tidak bisa membaca Master Kendaraan Sewa: ${vehicles.error.message}`)
  const vehicleMap = Object.fromEntries((vehicles.data || []).map((v) => [upper(v.nomor_polisi), v]))
  const candidates = []
  const invalid = []
  const seenContracts = new Set()
  for (const row of rows) {
    const plate = upper(valueOf(row, headers, 'nomor_polisi'))
    const nomorKontrak = valueOf(row, headers, 'nomor_kontrak')
    const ownerName = valueOf(row, headers, 'pemilik')
    const start = excelDate(valueOf(row, headers, 'tanggal_mulai'))
    const end = excelDate(valueOf(row, headers, 'tanggal_selesai'))
    const monthly = numberValue(valueOf(row, headers, 'nilai_sewa_bulanan'))
    const vehicle = vehicleMap[plate]
    if (!vehicle || !nomorKontrak || !ownerName || !start || !end || !monthly || monthly <= 0) { invalid.push({ plate, reason: !vehicle ? 'Plat belum ada di Master Kendaraan Sewa' : 'Kolom kontrak/pemilik/periode/nilai sewa tidak lengkap' }); continue }
    if (end !== sixMonthEnd(start)) throw new Error(`Kontrak ${nomorKontrak} tidak tepat 6 bulan. Tanggal selesai yang valid untuk ${start} adalah ${sixMonthEnd(start)}.`)
    const contractKey = upper(nomorKontrak)
    if (seenContracts.has(contractKey)) { invalid.push({ plate, reason: 'Nomor kontrak duplikat di file Excel' }); continue }
    seenContracts.add(contractKey)
    candidates.push({ row, plate, nomorKontrak, ownerName, start, end, monthly, vehicle })
  }
  if (!candidates.length) throw new Error('Tidak ada kontrak sewa yang valid. Setiap baris wajib memiliki Nomor Kontrak, Plat Sewa, Pemilik, periode 6 bulan, dan Nilai Sewa Bulanan > 0.')
  let added = 0
  let duplicate = 0
  for (const item of candidates) {
    const duplicateCheck = await supabase.from('kontrak_sewa').select('id').eq('nomor_kontrak', item.nomorKontrak).maybeSingle()
    if (duplicateCheck.error) throw new Error(`Gagal mengecek kontrak ${item.nomorKontrak}: ${duplicateCheck.error.message}`)
    if (duplicateCheck.data) { duplicate += 1; continue }

    let owner = await supabase.from('pemilik_sewa').select('id,jenis_pemilik,nama_perusahaan,nomor_identitas').eq('nama_pemilik', item.ownerName).maybeSingle()
    if (owner.error) throw new Error(`Gagal membaca pemilik ${item.ownerName}: ${owner.error.message}`)
    if (!owner.data) {
      const ownerType = upper(valueOf(item.row, headers, 'jenis_pemilik')).replace(/\s+/g, '_') || 'SEWA_PERORANGAN'
      if (!['SEWA_PERORANGAN', 'SEWA_RENTAL'].includes(ownerType)) throw new Error(`Jenis pemilik ${ownerType} pada kontrak ${item.nomorKontrak} tidak valid.`)
      if (ownerType === 'SEWA_RENTAL' && !valueOf(item.row, headers, 'nama_perusahaan')) throw new Error(`Nama perusahaan wajib diisi untuk pemilik rental pada kontrak ${item.nomorKontrak}.`)
      const created = await supabase.from('pemilik_sewa').insert({ jenis_pemilik: ownerType, nama_pemilik: item.ownerName, nama_perusahaan: valueOf(item.row, headers, 'nama_perusahaan') || null, aktif: true }).select('id').single()
      if (created.error) throw new Error(`Gagal membuat pemilik ${item.ownerName}: ${created.error.message}`)
      owner = { data: created.data, error: null }
    }
    const result = await supabase.from('kontrak_sewa').insert({ nomor_kontrak: item.nomorKontrak, kendaraan_id: item.vehicle.id, pemilik_sewa_id: owner.data.id, tanggal_mulai: item.start, tanggal_selesai: item.end, periode_bulan: 6, nilai_sewa_bulanan: item.monthly, tanggal_jatuh_tempo_bulanan: excelDate(valueOf(item.row, headers, 'tanggal_jatuh_tempo_bulanan')), status: 'AKTIF', catatan: `Import Excel: ${sheet.name}`, dibuat_oleh: profile.id })
    if (result.error) throw new Error(`Gagal menyimpan kontrak ${item.nomorKontrak}: ${result.error.message}`)
    added += 1
  }
  const skipped = invalid.length + duplicate
  return { imported: added, skipped, unknownPlates: [...new Set(invalid.filter((item) => item.reason === 'Plat belum ada di Master Kendaraan Sewa').map((item) => item.plate).filter(Boolean))], duplicate, message: `${added} kontrak sewa ditambahkan, ${skipped} baris dilewati (${duplicate} kontrak sudah ada/duplikat). Sistem tidak mengubah rekap pembayaran menjadi kontrak.` }
}

const IMPORTERS = { pengajuan: importPengajuan, sewa: importSewa }

function previewText(context) {
  return context === 'pengajuan'
    ? 'Template tabel wajib: Nomor Polisi, Tanggal, Keluhan. Kolom KM/Jenis/Prioritas boleh ditambahkan.'
    : 'Template kontrak wajib: Nomor Kontrak, Nomor Polisi, Pemilik, Tanggal Mulai, Tanggal Selesai, Nilai Sewa Bulanan. Kontrak harus 6 bulan.'
}

function displayCell(value, header) {
  const raw = clean(value)
  if (!raw) return '-'
  const key = norm(header)
  if (/^(tanggal|tgl|tanggal_pengajuan|tanggal_mulai|tanggal_selesai|tanggal_jatuh_tempo_bulanan)$/.test(key)) {
    const d = excelDate(raw)
    if (d) return formatDateSafe(d, { day: '2-digit', month: '2-digit', year: 'numeric' })
  }
  return raw
}

export default function UnifiedExcelImportModal({ context, profile, onDone, onClose }) {
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const canImport = ['ADMIN', 'TRANSPORT'].includes(profile?.role)

  const scan = async (nextFile) => {
    setFile(nextFile || null); setSelected(null); setError(''); setMessage('')
    if (!nextFile) return
    if (!/\.xlsx$/i.test(nextFile.name)) { setError('Gunakan file Excel .xlsx. Format .xls lama belum didukung.'); return }
    if (nextFile.size > MAX_FILE_SIZE) { setError('Ukuran file maksimal 25 MB.'); return }
    setLoading(true)
    try {
      if (!IMPORTERS[context]) throw new Error(`Import ${LABELS[context] || 'data ini'} belum memiliki format aman.`)
      const sheets = (await parseXlsx(nextFile)).map(sheetInfo).map((sheet) => ({ ...sheet, score: scoreSheet(sheet, context) })).sort((a, b) => b.score - a.score)
      const candidate = sheets[0]
      if (!candidate || candidate.score < 100) {
        const name = candidate?.name ? ` Sheet teratas: “${candidate.name}”.` : ''
        throw new Error(`Format Excel ${LABELS[context]} belum cocok dengan template sistem.${name} ${previewText(context)}`)
      }
      validateSource(candidate, context)
      setSelected(candidate)
      setMessage(`Sheet “${candidate.name}” valid • ${dataRows(candidate).length} baris data. ${previewText(context)}`)
    } catch (e) { setError(e.message || 'File Excel tidak dapat dibaca.') } finally { setLoading(false) }
  }

  const start = async () => {
    if (!selected || !canImport || saving) return
    setSaving(true); setError(''); setMessage('Memproses import...')
    try {
      const result = await IMPORTERS[context](selected, profile)
      const report = { context, sourceRows: dataRows(selected).length, validRows: Math.max(0, dataRows(selected).length - (result.skipped || 0)), imported: result.imported || 0, skipped: result.skipped || 0, duplicate: result.duplicate || 0, unknownPlates: result.unknownPlates || [], message: result.message, fileName: file?.name || '', completedAt: new Date().toISOString() }
      sessionStorage.setItem('transport_import_report', JSON.stringify(report))
      setMessage(`Import ${LABELS[context]} selesai. ${result.message}`)
      onDone?.(report)
    } catch (e) {
      setError(e?.message || 'Import gagal. Data tidak dilanjutkan ke langkah berikutnya.')
      setMessage('')
    } finally { setSaving(false) }
  }

  return <div className="dpt-overlay" role="dialog" aria-modal="true" aria-label={`Import ${LABELS[context] || 'Excel'}`}>
    <section className="dpt-modal">
      <header className="dpt-modal-head"><div><span className="eyebrow">IMPORT EXCEL</span><h3>Import {LABELS[context] || 'Excel'}</h3><p>Upload → deteksi format → validasi header → preview → cek data master → cek duplikat → simpan.</p></div><button type="button" className="dpt-icon" onClick={onClose} aria-label="Tutup">×</button></header>
      {error && <div className="dpt-alert error">{error}</div>}
      {message && <div className="dpt-alert success">{message}</div>}
      <div className="dpt-upload"><input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => scan(e.target.files?.[0])}/><button type="button" className="dpt-upload-button" onClick={() => inputRef.current?.click()} disabled={loading || saving}>{loading ? 'Membaca Excel…' : file ? 'Ganti File' : 'Pilih File Excel'}</button>{file ? <div className="dpt-file-meta"><strong title={file.name}>{file.name}</strong><span>✓ .xlsx • {(file.size / 1024 / 1024).toFixed(2)} MB</span></div> : <div className="dpt-file-meta"><span>Hanya .xlsx • maksimal 25 MB</span></div>}</div>
      {file && selected && <><div className="dpt-selection"><div><b>Sheet: {selected.name}</b><span>Format cocok</span></div><span>{dataRows(selected).length} baris data</span></div><div className="dpt-preview"><div className="dpt-sheet-title"><div><b>Preview Data</b><span className="dpt-preview-note">Sistem hanya menerima tabel dengan header wajib yang sesuai.</span></div><span>Semua baris sumber</span></div><div className="dpt-preview-wrap"><table><thead><tr>{selected.headers.map((header, index) => <th key={`${header}-${index}`}>{header || `Kolom ${index + 1}`}</th>)}</tr></thead><tbody>{selected.rows.slice(selected.headerIndex + 1).map((row, rowIndex) => <tr key={rowIndex}>{selected.headers.map((header, columnIndex) => <td key={columnIndex}>{displayCell(row[columnIndex], header)}</td>)}</tr>)}</tbody></table></div></div></>}
      <div className="dpt-actions"><button type="button" className="dpt-button" onClick={onClose} disabled={saving}>Batal</button><button type="button" className="dpt-button primary" onClick={start} disabled={!selected || saving || !canImport}>{saving ? 'Mengimport…' : `Import ${LABELS[context] || 'Excel'}`}</button></div>
    </section>
  </div>
}
