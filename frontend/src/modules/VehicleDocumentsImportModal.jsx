import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import './DataPageTools.css'
import './VehicleDocumentsImportModal.css'

const ALIASES = {
  nomor_polisi: ['no_polisi', 'nomor_polisi', 'no_pol', 'plat'],
  merk: ['merk', 'brand'],
  tipe: ['type', 'tipe'],
  tahun: ['tahun'],
  stnk: ['stnk', 'jatuh_tempo_stnk'],
  kir: ['kir', 'jatuh_tempo_kir'],
  lima_tahun: ['5_tahun', '5_tahunan', 'lima_tahun', 'jatuh_tempo_5_tahun'],
  nomor_dokumen: ['nomor_dokumen', 'no_dokumen', 'nomor_stnk', 'nomor_kir'],
  pemilik: ['pemilik', 'nama_pemilik'],
}
const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim()
const norm = (v) => clean(v).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
const upper = (v) => clean(v).toUpperCase()
const MAX_FILE_SIZE = 10 * 1024 * 1024

function colIndex(name) { let n = 0; for (const c of name) n = n * 26 + c.charCodeAt(0) - 64; return n - 1 }
function text(bytes) { return new TextDecoder('utf-8').decode(bytes) }
async function inflate(bytes) { const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')); return new Uint8Array(await new Response(stream).arrayBuffer()) }
async function unzip(buffer) {
  const view = new DataView(buffer); const bytes = new Uint8Array(buffer); let eocd = -1
  for (let i = bytes.length - 22; i >= 0; i -= 1) if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) throw new Error('File bukan XLSX yang valid atau file rusak.')
  const count = view.getUint16(eocd + 10, true); const centralOffset = view.getUint32(eocd + 16, true); const entries = new Map(); let p = centralOffset
  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('Struktur ZIP XLSX tidak valid.')
    const method = view.getUint16(p + 10, true); const compSize = view.getUint32(p + 20, true); const nameLen = view.getUint16(p + 28, true); const extraLen = view.getUint16(p + 30, true); const commentLen = view.getUint16(p + 32, true); const localOffset = view.getUint32(p + 42, true)
    const name = text(bytes.slice(p + 46, p + 46 + nameLen)); const local = new DataView(buffer, localOffset); const localNameLen = local.getUint16(26, true); const localExtraLen = local.getUint16(28, true); const start = localOffset + 30 + localNameLen + localExtraLen
    entries.set(name, { method, bytes: bytes.slice(start, start + compSize) }); p += 46 + nameLen + extraLen + commentLen
  }
  return { read: async (name) => { const e = entries.get(name); if (!e) return null; if (e.method === 0) return e.bytes; if (e.method === 8) return inflate(e.bytes); throw new Error(`Metode kompresi XLSX ${e.method} belum didukung.`) } }
}
async function parseXlsx(file) {
  const zip = await unzip(await file.arrayBuffer()); const workbook = new DOMParser().parseFromString(text(await zip.read('xl/workbook.xml') || new Uint8Array()), 'application/xml'); const rels = new DOMParser().parseFromString(text(await zip.read('xl/_rels/workbook.xml.rels') || new Uint8Array()), 'application/xml')
  const sharedStrings = []; const shared = await zip.read('xl/sharedStrings.xml')
  if (shared) { const doc = new DOMParser().parseFromString(text(shared), 'application/xml'); doc.querySelectorAll('si').forEach((si) => sharedStrings.push(clean(Array.from(si.querySelectorAll('t')).map((t) => t.textContent || '').join('')))) }
  const relMap = Object.fromEntries(Array.from(rels.querySelectorAll('Relationship')).map((r) => [r.getAttribute('Id'), r.getAttribute('Target')]))
  const sheets = []
  for (const sheet of Array.from(workbook.querySelectorAll('sheets > sheet'))) {
    const target0 = relMap[sheet.getAttribute('r:id')]; if (!target0) continue
    const target = target0.startsWith('xl/') ? target0 : `xl/${target0.replace(/^\//, '')}`; const doc = new DOMParser().parseFromString(text(await zip.read(target) || new Uint8Array()), 'application/xml'); const rows = []
    doc.querySelectorAll('sheetData > row').forEach((row) => { const values = []; row.querySelectorAll(':scope > c').forEach((cell) => { const ref = cell.getAttribute('r') || ''; const match = ref.match(/^([A-Z]+)/); if (!match) return; const idx = colIndex(match[1]); const type = cell.getAttribute('t') || ''; let value = clean(cell.querySelector('v')?.textContent); if (type === 's') value = sharedStrings[Number(value)] || ''; else if (type === 'inlineStr') value = clean(Array.from(cell.querySelectorAll('is t')).map((n) => n.textContent || '').join('')); values[idx] = value }); if (values.some((v) => clean(v))) rows.push({ excelRow: Number(row.getAttribute('r') || rows.length + 1), values }) })
    sheets.push({ name: sheet.getAttribute('name') || target, rows })
  }
  if (!sheets.length) throw new Error('Tidak ada sheet yang bisa dibaca dari file Excel.'); return sheets
}
function findHeader(sheet) { let best = { index: -1, row: [], score: -1 }; sheet.rows.slice(0, 50).forEach((item, idx) => { const score = item.values.filter(Boolean).map(norm).filter(Boolean).length; if (score > best.score) best = { index: idx, row: item.values, score } }); return best }
function valueOf(row, headers, key) { const aliases = ALIASES[key] || [key]; const i = headers.findIndex((h) => aliases.includes(norm(h))); return i >= 0 ? clean(row.values[i]) : '' }
function excelDate(value) { const v = clean(value); if (!v) return null; if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v; if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(v)) { const [d, m, y] = v.split(/[/-]/); return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` }; const serial = Number(v); if (Number.isFinite(serial) && serial > 20000 && serial < 80000) return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10); const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10) }
function formatDate(v) { return v ? new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${v}T00:00:00`)) : '-' }
function chooseSheet(sheets) { return sheets.map((sheet) => { const h = findHeader(sheet); const headers = h.row.map(norm); let score = 0; const name = norm(sheet.name); if (name.includes('stnk_dan_kir')) score += 12; if (name === 'stnk_dan_kir') score += 6; if (headers.includes('no_polisi')) score += 5; if (headers.includes('stnk')) score += 4; if (headers.includes('kir')) score += 3; if (headers.includes('5_tahun')) score += 3; return { sheet, header: h, score } }).sort((a, b) => b.score - a.score)[0] }

async function importDocuments(rows, profile, sheetName) {
  const valid = rows.filter((row) => row.nomor_polisi && (row.stnk || row.kir || row.lima_tahun))
  if (!valid.length) throw new Error('Tidak ada data dokumen valid. Pastikan ada No. Polisi dan tanggal STNK/KIR/5 Tahun.')
  const { data: vehicles, error: vehicleError } = await supabase.from('kendaraan').select('id,nomor_polisi,masa_berlaku_pajak')
  if (vehicleError) throw new Error(`Tidak bisa membaca master kendaraan: ${vehicleError.message}`)
  const vehicleMap = Object.fromEntries((vehicles || []).map((v) => [upper(v.nomor_polisi), v]))
  let inserted = 0; let skipped = 0; let unknown = []; let taxUpdated = 0
  for (const row of valid) {
    const vehicle = vehicleMap[row.nomor_polisi]
    if (!vehicle) { unknown.push(row.nomor_polisi); continue }
    for (const [key, type] of [['stnk', 'STNK'], ['kir', 'KIR'], ['lima_tahun', '5_TAHUNAN']]) {
      const due = row[key]; if (!due) continue
      const existing = await supabase.from('dokumen_kendaraan').select('id').eq('kendaraan_id', vehicle.id).eq('jenis_dokumen', type).eq('tanggal_jatuh_tempo', due).limit(1)
      if (existing.error) throw new Error(`Gagal mengecek ${type} ${row.nomor_polisi}: ${existing.error.message}`)
      if (existing.data?.length) { skipped += 1; continue }
      const result = await supabase.from('dokumen_kendaraan').insert({ kendaraan_id: vehicle.id, jenis_dokumen: type, nomor_dokumen: row.nomor_dokumen || null, tanggal_jatuh_tempo: due, keterangan: `Import Excel: ${sheetName}` })
      if (result.error) throw new Error(`Gagal menyimpan ${type} ${row.nomor_polisi}: ${result.error.message}`)
      inserted += 1
    }
    if (row.stnk && (!vehicle.masa_berlaku_pajak || row.stnk > vehicle.masa_berlaku_pajak)) {
      const update = await supabase.from('kendaraan').update({ masa_berlaku_pajak: row.stnk }).eq('id', vehicle.id)
      if (update.error) throw new Error(`Dokumen masuk tetapi masa pajak ${row.nomor_polisi} gagal disinkronkan: ${update.error.message}`)
      vehicle.masa_berlaku_pajak = row.stnk; taxUpdated += 1
    }
  }
  return { sourceRows: rows.length, inserted, skipped, unknown: [...new Set(unknown)], taxUpdated }
}

export default function VehicleDocumentsImportModal({ profile, onDone, onClose }) {
  const inputRef = useRef(null); const [file, setFile] = useState(null); const [workbook, setWorkbook] = useState(null); const [loading, setLoading] = useState(false); const [saving, setSaving] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('')
  const canImport = ['ADMIN', 'TRANSPORT'].includes(profile?.role)
  const scan = async (nextFile) => {
    setFile(nextFile || null); setWorkbook(null); setError(''); setMessage(''); if (!nextFile) return
    if (!/\.xlsx$/i.test(nextFile.name)) return setError('Gunakan file Excel .xlsx.')
    if (nextFile.size > MAX_FILE_SIZE) return setError('Ukuran file maksimal 10 MB.')
    setLoading(true)
    try {
      const sheets = await parseXlsx(nextFile); const chosen = chooseSheet(sheets); if (!chosen || chosen.score < 10) throw new Error('Sheet STNK/KIR tidak ditemukan secara meyakinkan.')
      const data = chosen.sheet.rows.slice(chosen.header.index + 1).filter((r) => r.values.some((v) => clean(v))).map((r) => ({ excelRow: r.excelRow, nomor_polisi: upper(valueOf(r, chosen.header.row, 'nomor_polisi')), stnk: excelDate(valueOf(r, chosen.header.row, 'stnk')), kir: excelDate(valueOf(r, chosen.header.row, 'kir')), lima_tahun: excelDate(valueOf(r, chosen.header.row, 'lima_tahun')), nomor_dokumen: valueOf(r, chosen.header.row, 'nomor_dokumen') }))
      const valid = data.filter((r) => r.nomor_polisi && (r.stnk || r.kir || r.lima_tahun)); const missing = data.length - valid.length; const docCount = valid.reduce((n, r) => n + [r.stnk, r.kir, r.lima_tahun].filter(Boolean).length, 0)
      setWorkbook({ sheet: chosen.sheet, header: chosen.header, data, valid, missing, docCount }); setMessage(`Sheet “${chosen.sheet.name}” terdeteksi: ${data.length} baris sumber • ${valid.length} kendaraan memiliki dokumen • ${docCount} dokumen terdeteksi.`)
    } catch (e) { setError(e.message || 'File Excel tidak dapat dibaca.') } finally { setLoading(false) }
  }
  const start = async () => { if (!workbook || !canImport || saving) return; setSaving(true); setError(''); setMessage('Import dokumen berjalan...'); try { const result = await importDocuments(workbook.valid, profile, workbook.sheet.name); const unknownText = result.unknown.length ? ` • ${result.unknown.length} plat tidak ada di master` : ''; setMessage(`Import selesai: ${result.inserted} dokumen baru • ${result.skipped} sudah ada • ${result.taxUpdated} masa pajak master disinkronkan${unknownText}.`); if (result.unknown.length) setError(`Plat belum ada di Master Kendaraan: ${result.unknown.slice(0, 20).join(', ')}${result.unknown.length > 20 ? ' …' : ''}. Data dokumen tersebut tidak dibuat.`); onDone?.() } catch (e) { setError(e.message || 'Import dokumen gagal.'); setMessage('') } finally { setSaving(false) } }
  return <div className="dpt-overlay" role="dialog" aria-modal="true" aria-label="Import Dokumen Kendaraan"><section className="dpt-modal vehicle-docs-import-modal"><header className="dpt-modal-head"><div><span className="eyebrow">IMPORT EXCEL DOKUMEN</span><h3>STNK, KIR & 5 Tahunan</h3><p>Mapping mengikuti sheet monitoring dokumen kendaraan dan menyesuaikan enum yang dipakai halaman Dokumen.</p></div><button type="button" className="dpt-icon" onClick={onClose}>×</button></header>{error&&<div className="dpt-alert error">{error}</div>}{message&&<div className="dpt-alert success">{message}</div>}<div className="dpt-upload"><input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e)=>scan(e.target.files?.[0])}/><button type="button" className="dpt-upload-button" onClick={()=>inputRef.current?.click()} disabled={loading||saving}>{loading?'Membaca Excel…':file?'Ganti File':'Pilih File Excel'}</button><div className="dpt-file-meta"><strong title={file?.name}>{file?.name||'Belum ada file'}</strong><span>{file?`✓ .xlsx • ${(file.size/1024/1024).toFixed(2)} MB`:'Maksimal 10 MB'}</span></div></div>{workbook&&<><div className="docs-import-stats"><div><b>{workbook.data.length}</b><span>baris sumber</span></div><div><b>{workbook.valid.length}</b><span>baris valid</span></div><div><b>{workbook.docCount}</b><span>dokumen</span></div><div><b>{workbook.missing}</b><span>baris dilewati</span></div></div><div className="docs-import-note"><b>Penyesuaian sistem</b><span>STNK → jenis dokumen STNK.</span><span>KIR → jenis dokumen KIR.</span><span>5 TAHUN → jenis dokumen 5_TAHUNAN.</span><span>Jatuh tempo STNK juga menyinkronkan Masa Berlaku Pajak di Master Kendaraan.</span><span>Plat yang belum ada di Master tidak dibuat otomatis.</span></div><div className="dpt-preview"><div className="dpt-sheet-title"><b>Preview Sumber: {workbook.sheet.name}</b><span>8 baris pertama</span></div><div className="dpt-preview-wrap"><table><thead><tr>{workbook.header.row.map((h,i)=><th key={`${h}-${i}`}>{h||`Kolom ${i+1}`}</th>)}</tr></thead><tbody>{workbook.data.slice(0,8).map(r=><tr key={r.excelRow}><td>{r.nomor_polisi||'-'}</td><td>{formatDate(r.stnk)}</td><td>{formatDate(r.kir)}</td><td>{formatDate(r.lima_tahun)}</td></tr>)}</tbody></table></div></div></> }<div className="dpt-actions"><button type="button" className="dpt-button" onClick={onClose} disabled={saving}>Batal</button><button type="button" className="dpt-button primary" onClick={start} disabled={!workbook||saving||!canImport}>{saving?'Mengimport…':'Import Dokumen Kendaraan'}</button></div></section></div>
}
