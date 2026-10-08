import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatDateSafe } from '../utils/dateSafe'
import { clearDeletedExcelRows, filterDeletedExcelRows } from '../utils/excelPreviewControls.js'
import './DataPageTools.css'
import './VehicleDocumentsImportModal.css'

const ALIASES = {
  nomor_polisi: ['no_polisi', 'nomor_polisi', 'no_pol', 'plat'],
  merk: ['merk', 'brand'],
  tipe: ['type', 'tipe'],
  tahun: ['tahun'],
  stnk: ['stnk', 'jatuh_tempo_stnk'],
  lima_tahun: ['5_tahun', '5_tahunan', 'lima_tahun', 'jatuh_tempo_5_tahun'],
  nomor_dokumen: ['nomor_dokumen', 'no_dokumen', 'nomor_stnk'],
  pemilik: ['pemilik', 'nama_pemilik'],
  source_no: ['no', 'nomor', 'nomor_urut'],
  nomor_rangka: ['no_rangka', 'no_ranka', 'nomor_rangka'],
  pajak: ['pajak', 'jatuh_tempo_pajak', 'masa_berlaku_pajak', 'tanggal_jatuh_tempo_pajak'],
}
const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim()
const norm = (v) => clean(v).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
const upper = (v) => clean(v).toUpperCase()
const MAX_FILE_SIZE = 25 * 1024 * 1024

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
function findHeader(sheet, required = ['source_no', 'merk', 'tipe', 'nomor_polisi', 'tahun']) {
  let best = { index: -1, row: [], score: -1 }
  sheet.rows.slice(0, 50).forEach((item, idx) => {
    const headers = item.values.map(norm)
    const score = required.reduce((total, key) => total + (headers.some(header => (ALIASES[key] || []).includes(header)) ? 1 : 0), 0)
    if (score > best.score) best = { index: idx, row: item.values, score }
  })
  return best
}
function valueOf(row, headers, key) { const aliases = ALIASES[key] || [key]; const i = headers.findIndex((h) => aliases.includes(norm(h))); return i >= 0 ? clean(row.values[i]) : '' }
function excelDate(value) { const v = clean(value); if (!v) return null; if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v; if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(v)) { const [d, m, y] = v.split(/[/-]/); return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` }; const serial = Number(v); if (Number.isFinite(serial) && serial > 20000 && serial < 80000) return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10); const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10) }
function formatDate(v) { return formatDateSafe(v, { day: '2-digit', month: '2-digit', year: 'numeric' }) }
function chooseDocumentSheet(sheets) {
  return sheets.map((sheet) => {
    const h = findHeader(sheet, ['source_no', 'merk', 'tipe', 'nomor_polisi', 'tahun', 'stnk', 'lima_tahun'])
    const headers = h.row.map(norm)
    let score = h.score
    const name = norm(sheet.name)
    if (name === 'stnk' || name === 'stnk_dan_kir') score += 20
    if (name.includes('stnk')) score += 8
    if (headers.includes('stnk')) score += 5
    if (headers.includes('5_tahun')) score += 5
    return { sheet, header: h, score }
  }).sort((a, b) => b.score - a.score)[0]
}

function chooseTaxSheet(sheets) {
  return sheets.map((sheet) => {
    const h = findHeader(sheet, ['source_no', 'nomor_polisi', 'merk', 'tipe', 'tahun', 'pajak'])
    const headers = h.row.map(norm)
    let score = h.score
    const name = norm(sheet.name)
    if (name === 'data_kendaraan' || name === 'list_kendaraan') score += 20
    if (name.includes('kendaraan')) score += 8
    if (headers.includes('masa_berlaku_pajak') || headers.includes('masa_pajak')) score += 8
    if (headers.includes('pajak')) score += 4
    return { sheet, header: h, score }
  }).sort((a, b) => b.score - a.score)[0]
}

function sourceRows(source, kind) {
  if (!source || source.header.index < 0) return []
  return source.sheet.rows
    .slice(source.header.index + 1)
    .map((r) => ({
      excelRow: r.excelRow,
      source_no: valueOf(r, source.header.row, 'source_no'),
      nomor_polisi: upper(valueOf(r, source.header.row, 'nomor_polisi')),
      merk: valueOf(r, source.header.row, 'merk'),
      tipe: valueOf(r, source.header.row, 'tipe'),
      tahun: valueOf(r, source.header.row, 'tahun'),
      nomor_rangka: valueOf(r, source.header.row, 'nomor_rangka'),
      pemilik: valueOf(r, source.header.row, 'pemilik'),
      stnk: kind === 'doc' ? excelDate(valueOf(r, source.header.row, 'stnk')) : null,
      pajak: kind === 'tax' ? excelDate(valueOf(r, source.header.row, 'pajak')) : null,
      lima_tahun: kind === 'doc' ? excelDate(valueOf(r, source.header.row, 'lima_tahun')) : null,
      nomor_dokumen: kind === 'doc' ? valueOf(r, source.header.row, 'nomor_dokumen') : '',
    }))
    .filter((r) => r.nomor_polisi)
}

function mergeSourceRows(documentSource, taxSource) {
  const merged = new Map()
  for (const row of sourceRows(taxSource, 'tax')) {
    const current = merged.get(row.nomor_polisi) || { ...row }
    merged.set(row.nomor_polisi, {
      ...current,
      ...row,
      nomor_polisi: row.nomor_polisi || current.nomor_polisi,
      merk: row.merk || current.merk,
      tipe: row.tipe || current.tipe,
      tahun: row.tahun || current.tahun,
      nomor_rangka: row.nomor_rangka || current.nomor_rangka,
      pemilik: row.pemilik || current.pemilik,
      source_no: current.source_no || row.source_no || null,
      stnk: current.stnk || null,
      lima_tahun: current.lima_tahun || null,
      pajak: row.pajak || current.pajak || null,
      nomor_dokumen: current.nomor_dokumen || '',
    })
  }
  for (const row of sourceRows(documentSource, 'doc')) {
    const current = merged.get(row.nomor_polisi) || {}
    merged.set(row.nomor_polisi, {
      ...current,
      ...row,
      nomor_polisi: row.nomor_polisi || current.nomor_polisi,
      merk: row.merk || current.merk,
      tipe: row.tipe || current.tipe,
      tahun: row.tahun || current.tahun,
      nomor_rangka: row.nomor_rangka || current.nomor_rangka,
      pemilik: row.pemilik || current.pemilik,
      source_no: row.source_no || current.source_no || null,
      stnk: row.stnk || current.stnk || null,
      lima_tahun: row.lima_tahun || current.lima_tahun || null,
      pajak: current.pajak || null,
      nomor_dokumen: row.nomor_dokumen || current.nomor_dokumen || '',
    })
  }
  return Array.from(merged.values()).map((row, index) => ({ ...row, source_no: row.source_no || String(index + 1) }))
}

async function importDocuments(rows, profile, sheetName) {
  const valid = rows.filter(row => row.nomor_polisi && (row.stnk || row.lima_tahun || row.pajak))
  if (!valid.length) throw new Error('Tidak ada data dokumen valid. Pastikan ada No. Polisi dan minimal salah satu tanggal STNK, Pajak, atau 5 Tahun.')

  const { data: vehicles, error: vehicleError } = await supabase
    .from('kendaraan')
    .select('id,nomor_polisi,kepemilikan').eq('kepemilikan','ASET')
  if (vehicleError) throw new Error(`Tidak bisa membaca master kendaraan: ${vehicleError.message}`)

  const vehicleMap = Object.fromEntries((vehicles || []).map(v => [upper(v.nomor_polisi), v]))
  const unknown = [...new Set(valid.filter(row => !vehicleMap[upper(row.nomor_polisi)]).map(row => upper(row.nomor_polisi)))]

  const payload = valid.map(row => ({
    source_no: row.source_no || null,
    nomor_polisi: upper(row.nomor_polisi),
    merk: row.merk || null,
    tipe: row.tipe || null,
    tahun: row.tahun || null,
    nomor_rangka: row.nomor_rangka || null,
    pemilik: row.pemilik || null,
    stnk: row.stnk || null,
    lima_tahun: row.lima_tahun || null,
    pajak: row.pajak || null,
    nomor_dokumen: row.nomor_dokumen || null,
  }))

  const { data, error } = await supabase.rpc('import_transport_documents', {
    p_rows: payload,
    p_sheet_name: sheetName,
  })
  if (error) throw new Error(`Import dokumen dibatalkan sepenuhnya: ${error.message}`)

  return {
    sourceRows: rows.length,
    inserted: Number(data?.inserted || 0),
    skipped: Number(data?.skipped || 0),
    unknown,
    taxUpdated: Number(data?.taxUpdated || 0),
  }
}

export default function VehicleDocumentsImportModal({ profile, onDone, onClose }) {
  const inputRef = useRef(null); const [file, setFile] = useState(null); const [workbook, setWorkbook] = useState(null); const [loading, setLoading] = useState(false); const [saving, setSaving] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('')
  const canImport = ['ADMIN', 'TRANSPORT'].includes(profile?.role)
  const scan = async (nextFile) => {
    clearDeletedExcelRows('dokumen')
    setFile(nextFile || null); setWorkbook(null); setError(''); setMessage(''); if (!nextFile) return
    if (!/\.xlsx$/i.test(nextFile.name)) return setError('Gunakan file Excel .xlsx.')
    if (nextFile.size > MAX_FILE_SIZE) return setError('Ukuran file maksimal 25 MB.')
    setLoading(true)
    try {
      const sheets = await parseXlsx(nextFile)
      const documentSource = chooseDocumentSheet(sheets)
      const taxSource = chooseTaxSheet(sheets)
      if ((!documentSource || documentSource.score < 10) && (!taxSource || taxSource.score < 9)) throw new Error('Sheet STNK dan/atau sheet pajak kendaraan tidak ditemukan secara meyakinkan.')
      const data = mergeSourceRows(
        documentSource && documentSource.score >= 10 ? documentSource : null,
        taxSource && taxSource.score >= 9 ? taxSource : null,
      )
      const valid = data.filter((r) => r.nomor_polisi && (r.stnk || r.lima_tahun || r.pajak))
      const missing = data.length - valid.length
      const docCount = valid.reduce((n, r) => n + [r.stnk, r.pajak, r.lima_tahun].filter(Boolean).length, 0)
      const docSheetName = documentSource?.score >= 10 ? documentSource.sheet.name : ''
      const taxSheetName = taxSource?.score >= 9 ? taxSource.sheet.name : ''
      setWorkbook({ documentSource, taxSource, data, valid, missing, docCount, docSheetName, taxSheetName })
      setMessage(`Sumber terdeteksi: ${[docSheetName, taxSheetName].filter(Boolean).join(' + ')} • ${data.length} kendaraan teridentifikasi • ${docCount} tanggal dokumen/pajak ditemukan.`)
    } catch (e) { setError(e.message || 'File Excel tidak dapat dibaca.') } finally { setLoading(false) }
  }
  const start = async () => { if (!workbook || !canImport || saving) return; setSaving(true); setError(''); setMessage('Import dokumen berjalan...'); try { const activeRows = filterDeletedExcelRows('dokumen', workbook.valid)
      const sourceLabel = [workbook.docSheetName, workbook.taxSheetName].filter(Boolean).join(' + ') || file?.name || 'Excel'
      const result = await importDocuments(activeRows, profile, sourceLabel); const unknownText = result.unknown.length ? ` • ${result.unknown.length} plat tidak ada di master dan dilewati` : ''; setMessage(`Import selesai: ${result.inserted} dokumen baru • ${result.skipped} sudah ada • ${result.taxUpdated} masa pajak master diperbarui${unknownText}.`); const report = { context: 'dokumen', ...result, validRows: workbook.valid.length, addedCount: Number(result.inserted || 0), updatedCount: Number(result.taxUpdated || 0), skippedCount: Number(result.skipped || 0) + Number(result.unknown?.length || 0), errorCount: Number(workbook.missing || 0), imported: result.inserted, skipped: Number(result.skipped || 0) + Number(result.unknown?.length || 0), unknownPlates: result.unknown, documentCount: workbook.docCount, fileName: file?.name || '', completedAt: new Date().toISOString() }; sessionStorage.setItem('transport_import_report', JSON.stringify(report)); onDone?.(report) } catch (e) { setError(e.message || 'Import dokumen gagal.'); setMessage('') } finally { setSaving(false) } }
  return <div className="dpt-overlay" role="dialog" aria-modal="true" aria-label="Import Dokumen Kendaraan"><section className="dpt-modal vehicle-docs-import-modal"><header className="dpt-modal-head"><div><span className="eyebrow">IMPORT EXCEL DOKUMEN</span><h3>STNK, Pajak & 5 Tahunan</h3><p>Mapping mengikuti data STNK/5 tahunan berasal dari sheet STNK, sedangkan pajak berasal dari Masa Berlaku Pajak/Masa Pajak pada sheet kendaraan.</p></div><button type="button" className="dpt-icon" onClick={onClose}>×</button></header>{error&&<div className="dpt-alert error">{error}</div>}{message&&<div className="dpt-alert success">{message}</div>}<div className="dpt-upload"><input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e)=>scan(e.target.files?.[0])}/><button type="button" className="dpt-upload-button" onClick={()=>inputRef.current?.click()} disabled={loading||saving}>{loading?'Membaca Excel…':file?'Ganti File':'Pilih File Excel'}</button><div className="dpt-file-meta"><strong title={file?.name}>{file?.name||'Belum ada file'}</strong><span>{file?`✓ .xlsx • ${(file.size/1024/1024).toFixed(2)} MB`:'Maksimal 25 MB'}</span></div></div>{workbook&&<><div className="docs-import-stats"><div><b>{workbook.data.length}</b><span>baris sumber</span></div><div><b>{workbook.valid.length}</b><span>baris valid</span></div><div><b>{workbook.docCount}</b><span>dokumen</span></div><div><b>{workbook.missing}</b><span>baris dilewati</span></div></div><div className="docs-import-note"><b>Penyesuaian sistem</b><span>STNK → jenis dokumen STNK.</span><span>PAJAK → jenis dokumen PAJAK dari kolom Masa Berlaku Pajak/Masa Pajak.</span><span>5 TAHUN → jenis dokumen 5_TAHUNAN.</span><span>STNK tidak pernah dipakai sebagai sumber pajak.</span><span>Plat rental tidak diimpor; hanya kendaraan ASET. Nomor polisi yang berbeda antar-sheet tidak digabung otomatis.</span></div><div className="dpt-preview"><div className="dpt-sheet-title"><b>Preview Sumber: {workbook.docSheetName || workbook.taxSheetName || file?.name}</b><span>Semua baris sumber</span></div><div className="dpt-preview-wrap"><table><thead><tr><th>No</th><th>Merk</th><th>Type</th><th>No. Polisi</th><th>Tahun</th><th>No Rangka</th><th>STNK</th><th>PAJAK</th><th>5 TAHUN</th><th>Pemilik</th></tr></thead><tbody>{workbook.data.map(r=><tr key={r.excelRow}><td>{r.source_no||'-'}</td><td>{r.merk||'-'}</td><td>{r.tipe||'-'}</td><td>{r.nomor_polisi||'-'}</td><td>{r.tahun||'-'}</td><td>{r.nomor_rangka||'-'}</td><td>{formatDate(r.stnk)}</td><td>{formatDate(r.pajak)}</td><td>{formatDate(r.lima_tahun)}</td><td>{r.pemilik||'-'}</td></tr>)}</tbody></table></div></div></> }<div className="dpt-actions"><button type="button" className="dpt-button" onClick={onClose} disabled={saving}>Batal</button><button type="button" className="dpt-button primary" onClick={start} disabled={!workbook||saving||!canImport}>{saving?'Mengimport…':'Import Dokumen Kendaraan'}</button></div></section></div>
}
