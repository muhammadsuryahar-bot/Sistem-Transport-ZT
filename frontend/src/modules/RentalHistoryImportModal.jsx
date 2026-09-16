import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import './DataPageTools.css'

const MONTHS = {
  januari: 1, january: 1, februari: 2, february: 2, maret: 3, march: 3,
  april: 4, mei: 5, may: 5, juni: 6, june: 6, juli: 7, july: 7,
  agustus: 8, august: 8, september: 9, oktober: 10, october: 10,
  november: 11, desember: 12, december: 12,
}
const clean = v => String(v ?? '').replace(/\s+/g, ' ').trim()
const norm = v => clean(v).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
const upper = v => clean(v).toUpperCase()
const MAX_FILE_SIZE = 25 * 1024 * 1024

function text(bytes) { return new TextDecoder('utf-8').decode(bytes) }
function readU16(view, offset) { return view.getUint16(offset, true) }
function readU32(view, offset) { return view.getUint32(offset, true) }
async function inflate(bytes) {
  if (typeof DecompressionStream === 'undefined') throw new Error('Browser belum mendukung pembacaan XLSX. Gunakan Chrome/Edge terbaru.')
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}
async function unzip(buffer) {
  const view = new DataView(buffer); const bytes = new Uint8Array(buffer); let eocd = -1
  for (let i = bytes.length - 22; i >= 0; i -= 1) if (readU32(view, i) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) throw new Error('File bukan XLSX yang valid atau file rusak.')
  const count = readU16(view, eocd + 10); const centralOffset = readU32(view, eocd + 16); const entries = new Map(); let p = centralOffset
  for (let i = 0; i < count; i += 1) {
    if (readU32(view, p) !== 0x02014b50) throw new Error('Struktur ZIP XLSX tidak valid.')
    const method = readU16(view, p + 10); const compSize = readU32(view, p + 20); const nameLen = readU16(view, p + 28); const extraLen = readU16(view, p + 30); const commentLen = readU16(view, p + 32); const localOffset = readU32(view, p + 42)
    const name = text(bytes.slice(p + 46, p + 46 + nameLen)); const local = new DataView(buffer, localOffset); const localNameLen = readU16(local, 26); const localExtraLen = readU16(local, 28); const start = localOffset + 30 + localNameLen + localExtraLen
    entries.set(name, { method, bytes: bytes.slice(start, start + compSize) }); p += 46 + nameLen + extraLen + commentLen
  }
  return { read: async name => { const entry = entries.get(name); if (!entry) return null; if (entry.method === 0) return entry.bytes; if (entry.method === 8) return inflate(entry.bytes); throw new Error(`Metode kompresi XLSX ${entry.method} belum didukung.`) } }
}
function colIndex(name) { let n = 0; for (const c of name) n = n * 26 + c.charCodeAt(0) - 64; return n - 1 }
function parseSheetXml(xml, sharedStrings) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml'); if (doc.querySelector('parsererror')) throw new Error('Sheet XLSX tidak dapat dibaca.')
  const rows = []
  doc.querySelectorAll('sheetData > row').forEach(row => {
    const values = []
    row.querySelectorAll(':scope > c').forEach(cell => {
      const ref = cell.getAttribute('r') || ''; const match = ref.match(/^([A-Z]+)/); if (!match) return
      const idx = colIndex(match[1]); const type = cell.getAttribute('t') || ''; let value = clean(cell.querySelector('v')?.textContent)
      if (type === 's') value = sharedStrings[Number(value)] || ''
      else if (type === 'inlineStr') value = clean(Array.from(cell.querySelectorAll('is t')).map(n => n.textContent || '').join(''))
      else if (type === 'b') value = value === '1' ? 'TRUE' : 'FALSE'
      values[idx] = value
    })
    if (values.some(v => clean(v))) rows.push({ excelRow: Number(row.getAttribute('r') || rows.length + 1), values })
  })
  return rows
}
async function parseXlsx(file) {
  const zip = await unzip(await file.arrayBuffer())
  const workbook = new DOMParser().parseFromString(text(await zip.read('xl/workbook.xml') || new Uint8Array()), 'application/xml')
  const rels = new DOMParser().parseFromString(text(await zip.read('xl/_rels/workbook.xml.rels') || new Uint8Array()), 'application/xml')
  const sharedStrings = []; const shared = await zip.read('xl/sharedStrings.xml')
  if (shared) { const doc = new DOMParser().parseFromString(text(shared), 'application/xml'); doc.querySelectorAll('si').forEach(si => sharedStrings.push(clean(Array.from(si.querySelectorAll('t')).map(t => t.textContent || '').join('')))) }
  const relMap = Object.fromEntries(Array.from(rels.querySelectorAll('Relationship')).map(r => [r.getAttribute('Id'), r.getAttribute('Target')]))
  const sheets = []
  for (const sheet of Array.from(workbook.querySelectorAll('sheets > sheet'))) {
    const target0 = relMap[sheet.getAttribute('r:id')]; if (!target0) continue
    const target = target0.startsWith('xl/') ? target0 : `xl/${target0.replace(/^\//, '')}`
    sheets.push({ name: sheet.getAttribute('name') || target, rows: parseSheetXml(text(await zip.read(target) || new Uint8Array()), sharedStrings) })
  }
  if (!sheets.length) throw new Error('Tidak ada sheet yang bisa dibaca dari file Excel.')
  return sheets
}
function findHeader(sheet) { let best = { index: -1, row: [], score: -1 }; sheet.rows.slice(0, 15).forEach((row, idx) => { const score = row.values.filter(Boolean).map(norm).filter(Boolean).length; if (score > best.score) best = { index: idx, row: row.values, score } }); return best }
function valueOf(row, headers, aliases) { const idx = headers.findIndex(h => aliases.includes(norm(h))); return idx >= 0 ? clean(row.values[idx]) : '' }
function numberValue(value) { const v = clean(value).replace(/Rp\.?/ig, ''); if (!v) return null; if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(v)) return Number(v.replace(/\./g, '').replace(',', '.')); const n = Number(v.replace(/,/g, '')); return Number.isFinite(n) ? n : null }
function monthDate(year, monthName) { const month = MONTHS[norm(monthName)]; const y = Number(String(year).replace(/\D/g, '')); return month && y >= 2000 && y <= 2100 ? `${y}-${String(month).padStart(2, '0')}-01` : null }
function monthDiff(start, target) { const a = new Date(`${start}T00:00:00`); const b = new Date(`${target}T00:00:00`); return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) }

async function importSummary(rows, profile) {
  const ownersRes = await supabase.from('pemilik_sewa').select('id,nama_pemilik,nama_perusahaan')
  const contractsRes = await supabase.from('kontrak_sewa').select('id,pemilik_sewa_id,kendaraan_id,tanggal_mulai,tanggal_selesai,periode_bulan,nilai_sewa_bulanan')
  const existingRes = await supabase.from('pembayaran_sewa').select('id,kontrak_sewa_id,bulan_pembayaran')
  if (ownersRes.error) throw new Error(`Tidak bisa membaca pemilik rental: ${ownersRes.error.message}`)
  if (contractsRes.error) throw new Error(`Tidak bisa membaca kontrak rental: ${contractsRes.error.message}`)
  if (existingRes.error) throw new Error(`Tidak bisa membaca pembayaran rental: ${existingRes.error.message}`)

  const owners = ownersRes.data || []; const contracts = contractsRes.data || []; const existing = new Set((existingRes.data || []).map(x => `${x.kontrak_sewa_id}|${x.bulan_pembayaran}`))
  let imported = 0; let duplicate = 0; const skipped = []; const payloads = []
  for (const row of rows) {
    const year = valueOf(row, row.headers, ['Tahun','Year']); const supplier = valueOf(row, row.headers, ['Supplier','Pemilik','Nama Supplier']); const period = valueOf(row, row.headers, ['Periode Tagihan','Periode','Bulan']); const invoice = numberValue(valueOf(row, row.headers, ['Nilai Invoice','Nilai Invoice (Rp)','Invoice','Nilai']))
    const payMonth = monthDate(year, period)
    if (!year || !supplier || !payMonth || !invoice || invoice <= 0) { skipped.push(`Baris ${row.excelRow}: Tahun/Supplier/Periode/Nilai Invoice tidak lengkap`); continue }
    const supplierKey = upper(supplier)
    const matchingOwners = owners.filter(o => upper(o.nama_pemilik) === supplierKey || upper(o.nama_perusahaan || '') === supplierKey)
    if (matchingOwners.length !== 1) { skipped.push(`Baris ${row.excelRow}: Supplier “${supplier}” tidak cocok tepat ke satu pemilik rental`); continue }
    const ownerId = matchingOwners[0].id
    const matchingContracts = contracts.filter(c => Number(c.pemilik_sewa_id) === Number(ownerId) && c.tanggal_mulai <= payMonth && c.tanggal_selesai >= payMonth)
    if (matchingContracts.length !== 1) { skipped.push(`Baris ${row.excelRow}: Supplier “${supplier}” memiliki ${matchingContracts.length} kontrak yang cocok untuk ${payMonth.slice(0, 7)}`); continue }
    const contract = matchingContracts[0]; const periodNo = monthDiff(contract.tanggal_mulai, payMonth) + 1
    if (periodNo < 1 || periodNo > 6) { skipped.push(`Baris ${row.excelRow}: ${supplier} berada di luar periode kontrak 1–6`); continue }
    const key = `${contract.id}|${payMonth}`
    if (existing.has(key)) { duplicate += 1; continue }
    existing.add(key)
    payloads.push({ kontrak_sewa_id: contract.id, periode_ke: periodNo, bulan_pembayaran: payMonth, tanggal_jatuh_tempo: null, tanggal_pembayaran: null, jumlah_tagihan: invoice, jumlah_dibayar: 0, status: 'BELUM_LUNAS', metode_pembayaran: null, nomor_referensi: null, bukti_pembayaran_path: null, catatan: `Import SUMMERY RENTAL ${year} • ${period} • ${supplier} • ${valueOf(row, row.headers, ['Uraian'])}`, diproses_oleh: profile?.id || null })
  }
  if (payloads.length) { const result = await supabase.from('pembayaran_sewa').insert(payloads); if (result.error) throw new Error(`Gagal menyimpan pembayaran rental historis: ${result.error.message}`); imported = payloads.length }
  return { imported, duplicate, skipped, message: `${imported} pembayaran historis ditambahkan, ${duplicate} sudah ada, ${skipped.length} perlu verifikasi. Sistem tidak mengubah kontrak.` }
}

export default function RentalHistoryImportModal({ profile, onClose, onDone }) {
  const inputRef = useRef(null); const [file, setFile] = useState(null); const [workbook, setWorkbook] = useState(null); const [loading, setLoading] = useState(false); const [saving, setSaving] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('')
  const canImport = ['ADMIN', 'TRANSPORT'].includes(profile?.role)
  const scan = async nextFile => {
    setFile(nextFile || null); setWorkbook(null); setError(''); setMessage(''); if (!nextFile) return
    if (!/\.xlsx$/i.test(nextFile.name)) return setError('Gunakan file Excel .xlsx.')
    if (nextFile.size > MAX_FILE_SIZE) return setError('Ukuran file maksimal 25 MB.')
    setLoading(true)
    try {
      const sheets = await parseXlsx(nextFile); const chosen = sheets.find(s => norm(s.name) === 'summery_rental') || sheets.find(s => norm(s.name).includes('summery_rental'))
      if (!chosen) throw new Error('Sheet SUMMERY RENTAL tidak ditemukan di workbook.')
      const header = findHeader(chosen); const rows = chosen.rows.slice(header.index + 1).filter(r => r.values.some(v => clean(v))).map(r => ({ excelRow: r.excelRow, values: r.values, headers: header.row }))
      setWorkbook({ sheet: chosen, header, rows }); setMessage(`Sheet “${chosen.name}” terdeteksi • ${rows.length} baris sumber.`)
    } catch (e) { setError(e.message || 'File Excel tidak dapat dibaca.') } finally { setLoading(false) }
  }
  const start = async () => {
    if (!workbook || !canImport || saving) return
    setSaving(true); setError(''); setMessage('Memproses pembayaran rental historis...')
    try {
      const result = await importSummary(workbook.rows, profile)
      const report = { context: 'sewa', sourceRows: workbook.rows.length, validRows: result.imported + result.duplicate, imported: result.imported, skipped: result.skipped.length, duplicate: result.duplicate, message: result.message, fileName: file?.name || '', completedAt: new Date().toISOString() }
      sessionStorage.setItem('transport_import_report', JSON.stringify(report)); onDone?.(report)
      setMessage(result.message)
      if (result.skipped.length) setError(`Perlu verifikasi ${result.skipped.length} baris. Contoh: ${result.skipped.slice(0, 3).join(' | ')}`)
    } catch (e) { setError(e.message || 'Import pembayaran rental gagal.'); setMessage('') } finally { setSaving(false) }
  }
  return <div className="dpt-overlay" role="dialog" aria-modal="true" aria-label="Import Pembayaran Rental Historis"><section className="dpt-modal"><header className="dpt-modal-head"><div><span className="eyebrow">IMPORT EXCEL RENTAL</span><h3>Import SUMMERY RENTAL</h3><p>Excel lama berisi rekap pembayaran, bukan kontrak. Sistem hanya memasukkan baris yang bisa dicocokkan dengan tepat ke kontrak rental yang sudah ada.</p></div><button type="button" className="dpt-icon" onClick={onClose}>×</button></header>{error&&<div className="dpt-alert error">{error}</div>}{message&&<div className="dpt-alert success">{message}</div>}<div className="dpt-upload"><input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e=>scan(e.target.files?.[0])}/><button type="button" className="dpt-upload-button" onClick={()=>inputRef.current?.click()} disabled={loading||saving}>{loading?'Membaca Excel…':file?'Ganti File':'Pilih File Excel'}</button><div className="dpt-file-meta"><strong title={file?.name}>{file?.name||'Belum ada file'}</strong><span>{file?`✓ .xlsx • ${(file.size/1024/1024).toFixed(2)} MB`:'Maksimal 25 MB'}</span></div></div>{workbook&&<div className="dpt-selection"><div><b>Sheet: {workbook.sheet.name}</b><span>Format pembayaran historis</span></div><span>{workbook.rows.length} baris data</span></div>}<div className="dpt-actions"><button type="button" className="dpt-button" onClick={onClose} disabled={saving}>Batal</button><button type="button" className="dpt-button primary" onClick={start} disabled={!workbook||saving||!canImport}>{saving?'Mengimport…':'Import Pembayaran Historis'}</button></div></section></div>
}
