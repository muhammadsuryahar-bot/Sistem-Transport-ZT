import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import './ImportExcelPage.css'

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim()
const norm = value => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

const KEYWORDS = {
  kendaraan: ['nomor_polisi', 'no_polisi', 'plat', 'no_plat', 'kode_kendaraan'],
  dokumen: ['stnk', 'kir', 'jatuh_tempo', 'masa_pajak', 'nomor_dokumen'],
  service: ['jenis_pekerjaan', 'uraian', 'harga_satuan', 'nilai_dpp', 'ppn', 'nama_bengkel'],
  pengajuan: ['keluhan_kerusakan', 'keluhan', 'driver', 'unit_kerja', 'home_base'],
  rental: ['supplier', 'periode_tagihan', 'nilai_invoice', 'sewa_kendaraan'],
}

function readU16(view, offset) { return view.getUint16(offset, true) }
function readU32(view, offset) { return view.getUint32(offset, true) }
function bytesToText(bytes) { return new TextDecoder('utf-8').decode(bytes) }

async function inflate(bytes) {
  if (typeof DecompressionStream === 'undefined') throw new Error('Browser ini belum mendukung pembacaan XLSX. Gunakan Chrome/Edge terbaru.')
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function unzip(arrayBuffer) {
  const view = new DataView(arrayBuffer)
  const bytes = new Uint8Array(arrayBuffer)
  let eocd = -1
  for (let i = bytes.length - 22; i >= 0; i -= 1) if (readU32(view, i) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) throw new Error('File bukan XLSX yang valid atau file rusak.')
  const count = readU16(view, eocd + 10)
  const centralOffset = readU32(view, eocd + 16)
  const files = new Map()
  let p = centralOffset
  for (let i = 0; i < count; i += 1) {
    if (readU32(view, p) !== 0x02014b50) throw new Error('Struktur ZIP XLSX tidak valid.')
    const method = readU16(view, p + 10)
    const compSize = readU32(view, p + 20)
    const nameLen = readU16(view, p + 28)
    const extraLen = readU16(view, p + 30)
    const commentLen = readU16(view, p + 32)
    const localOffset = readU32(view, p + 42)
    const name = bytesToText(bytes.slice(p + 46, p + 46 + nameLen))
    const lv = new DataView(arrayBuffer, localOffset)
    const localNameLen = readU16(lv, 26)
    const localExtraLen = readU16(lv, 28)
    const dataStart = localOffset + 30 + localNameLen + localExtraLen
    const compressed = bytes.slice(dataStart, dataStart + compSize)
    files.set(name, { method, compressed })
    p += 46 + nameLen + extraLen + commentLen
  }
  const read = async name => {
    const entry = files.get(name)
    if (!entry) return null
    if (entry.method === 0) return entry.compressed
    if (entry.method === 8) return inflate(entry.compressed)
    throw new Error(`Metode kompresi XLSX tidak didukung: ${entry.method}`)
  }
  return { read }
}

function columnNameToIndex(name) {
  let n = 0
  for (const c of name) n = n * 26 + c.charCodeAt(0) - 64
  return n - 1
}
function parseXmlCells(xml, sharedStrings) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const bad = doc.querySelector('parsererror')
  if (bad) throw new Error('Sheet XLSX tidak dapat dibaca.')
  const rows = []
  doc.querySelectorAll('sheetData > row').forEach(row => {
    const values = []
    row.querySelectorAll(':scope > c').forEach(cell => {
      const ref = cell.getAttribute('r') || ''
      const m = ref.match(/^([A-Z]+)/)
      if (!m) return
      const idx = columnNameToIndex(m[1])
      const type = cell.getAttribute('t') || ''
      let value = clean(cell.querySelector('v')?.textContent)
      if (type === 's') value = sharedStrings[Number(value)] || ''
      else if (type === 'inlineStr') value = clean(cell.querySelector('is t')?.textContent)
      else if (type === 'b') value = value === '1' ? 'TRUE' : 'FALSE'
      values[idx] = value
    })
    rows.push(values)
  })
  return rows
}
async function parseXlsx(file) {
  const zip = await unzip(await file.arrayBuffer())
  const workbookXml = bytesToText(await zip.read('xl/workbook.xml') || new Uint8Array())
  const relsXml = bytesToText(await zip.read('xl/_rels/workbook.xml.rels') || new Uint8Array())
  if (!workbookXml || !relsXml) throw new Error('Workbook XLSX tidak lengkap.')
  const workbook = new DOMParser().parseFromString(workbookXml, 'application/xml')
  const rels = new DOMParser().parseFromString(relsXml, 'application/xml')
  const sharedXml = await zip.read('xl/sharedStrings.xml')
  const sharedStrings = []
  if (sharedXml) {
    const doc = new DOMParser().parseFromString(bytesToText(sharedXml), 'application/xml')
    doc.querySelectorAll('si').forEach(si => sharedStrings.push(clean(Array.from(si.querySelectorAll('t')).map(t => t.textContent).join(''))))
  }
  const relMap = Object.fromEntries(Array.from(rels.querySelectorAll('Relationship')).map(r => [r.getAttribute('Id'), r.getAttribute('Target')]))
  const sheets = []
  for (const s of Array.from(workbook.querySelectorAll('sheets > sheet'))) {
    const id = s.getAttribute('r:id')
    let target = relMap[id]
    if (!target) continue
    if (!target.startsWith('xl/')) target = `xl/${target.replace(/^\//, '')}`
    const rows = parseXmlCells(bytesToText(await zip.read(target) || new Uint8Array()), sharedStrings)
    sheets.push({ name: s.getAttribute('name') || target, rows })
  }
  return sheets
}

function detectSheet(name, rows) {
  const headerRow = rows.slice(0, 12).reduce((best, row, idx) => {
    const score = row.filter(Boolean).map(norm).filter(Boolean).length
    return score > best.score ? { idx, score, row } : best
  }, { idx: 0, score: 0, row: [] })
  const headers = headerRow.row.map(norm)
  const joined = `${norm(name)} ${headers.join(' ')}`
  const score = Object.fromEntries(Object.keys(KEYWORDS).map(type => [type, KEYWORDS[type].reduce((n, key) => n + (headers.includes(key) || joined.includes(key) ? 1 : 0), 0)]))
  const best = Object.entries(score).sort((a, b) => b[1] - a[1])[0]
  return { type: best[1] > 0 ? best[0] : 'tidak_relevan', headerIndex: headerRow.idx, headers: headerRow.row, score: best[1] }
}

const mapValue = (row, headers, aliases) => {
  const idx = headers.findIndex(h => aliases.includes(norm(h)))
  return idx >= 0 ? clean(row[idx]) : ''
}

function ImportExcelPage({ profile }) {
  const [file, setFile] = useState(null)
  const [sheets, setSheets] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const canImport = ['ADMIN', 'TRANSPORT'].includes(profile?.role)

  const scan = async selectedFile => {
    setFile(selectedFile); setSheets([]); setSelected(null); setError(''); setMessage('')
    if (!selectedFile) return
    if (!/\.xlsx$/i.test(selectedFile.name)) { setError('Gunakan file Excel .xlsx. Format .xls lama belum didukung untuk import aman.'); return }
    setLoading(true)
    try {
      const parsed = await parseXlsx(selectedFile)
      setSheets(parsed.map(s => ({ ...s, detection: detectSheet(s.name, s.rows) })))
      setMessage(`${parsed.length} sheet berhasil dibaca. Periksa pemetaan sebelum import.`)
    } catch (e) { setError(e.message || 'File Excel tidak dapat dibaca.') } finally { setLoading(false) }
  }

  const summary = useMemo(() => sheets.map(s => ({ name: s.name, type: s.detection.type, rows: Math.max(0, s.rows.length - s.detection.headerIndex - 1) })), [sheets])

  const importVehicles = async sheet => {
    if (!canImport) throw new Error('Hanya ADMIN atau TRANSPORT yang boleh mengimport master kendaraan.')
    const { headers, headerIndex } = sheet.detection
    const dataRows = sheet.rows.slice(headerIndex + 1).filter(r => r.some(v => clean(v)))
    let added = 0; let updated = 0; let skipped = 0
    for (const row of dataRows) {
      const plate = mapValue(row, headers, ['Nomor Polisi','No Polisi','No. Polisi','No_Polisi','Nomor_Polisi','Plat','No Plat'])
      const brand = mapValue(row, headers, ['Merk','Brand'])
      if (!plate || !brand) { skipped += 1; continue }
      const payload = {
        nomor_polisi: plate.toUpperCase(), merk: brand,
        tipe: mapValue(row, headers, ['Type','Tipe']) || null,
        jenis_kendaraan: mapValue(row, headers, ['Jenis','Jenis Kendaraan']) || null,
        tahun: Number(mapValue(row, headers, ['Tahun'])) || null,
        nomor_mesin: mapValue(row, headers, ['No Mesin','Nomor Mesin']) || null,
        nomor_rangka: mapValue(row, headers, ['No Rangka','Nomor Rangka']) || null,
        pemilik: mapValue(row, headers, ['Pemilik','Nama Pemilik']) || null,
        lokasi: mapValue(row, headers, ['Lokasi Kerja','Lokasi','Home Base']) || null,
        keterangan: mapValue(row, headers, ['Keterangan','Catatan']) || null,
        kilometer_terakhir: 0,
        kepemilikan: clean(mapValue(row, headers, ['Kepemilikan','Status Kepemilikan'])).toUpperCase().includes('SEWA') ? 'SEWA' : 'ASET_KANTOR',
      }
      const { data: existing, error: findError } = await supabase.from('kendaraan').select('id').eq('nomor_polisi', plate.toUpperCase()).maybeSingle()
      if (findError) throw findError
      if (existing?.id) {
        const { error: updateError } = await supabase.from('kendaraan').update(payload).eq('id', existing.id)
        if (updateError) throw updateError
        updated += 1
      } else {
        payload.kode_kendaraan = mapValue(row, headers, ['Kode Kendaraan','Kode']) || `IMP-${plate.replace(/\W+/g, '')}`
        const { error: insertError } = await supabase.from('kendaraan').insert(payload)
        if (insertError) throw insertError
        added += 1
      }
    }
    return `${added} kendaraan baru, ${updated} diperbarui, ${skipped} dilewati.`
  }

  const startImport = async sheet => {
    setSaving(true); setError(''); setMessage('')
    try {
      if (sheet.detection.type === 'kendaraan') setMessage(await importVehicles(sheet))
      else throw new Error('Import transaksi sheet ini belum diaktifkan pada tahap awal karena membutuhkan pemetaan transaksi dan aturan database. Data tetap aman dalam preview dan belum ditulis.')
      setTimeout(() => window.location.reload(), 900)
    } catch (e) { setError(e.message || 'Import gagal.') } finally { setSaving(false) }
  }

  return <div className="import-page">
    <div className="import-head">
      <div><span className="eyebrow">DATA MIGRASI</span><h2>Import Excel</h2><p>Masukkan data Excel lama Transport dengan preview, pemetaan sheet, validasi, dan pengecekan duplikat sebelum data ditulis.</p></div>
      <label className="import-upload"><input type="file" accept=".xlsx" onChange={e => scan(e.target.files?.[0])}/><span>{loading ? 'Membaca Excel...' : 'Pilih File Excel'}</span></label>
    </div>
    {message && <div className="import-alert success">{message}</div>}{error && <div className="import-alert error">{error}</div>}
    {!file ? <div className="import-empty"><b>Belum ada file Excel.</b><span>Upload file .xlsx untuk melihat seluruh sheet sebelum import.</span></div> : <>
      <section className="import-card"><div className="import-card-head"><div><span className="eyebrow">WORKBOOK</span><h3>{file.name}</h3></div><span className="import-badge">{sheets.length} sheet</span></div><div className="import-table-wrap"><table className="import-table"><thead><tr><th>Sheet</th><th>Terdeteksi</th><th>Baris Data</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{summary.map((s, idx) => <tr key={`${s.name}-${idx}`}><td><b>{s.name}</b></td><td>{({ kendaraan:'Kendaraan', dokumen:'Dokumen', service:'Service', pengajuan:'Pengajuan Service', rental:'Rental', tidak_relevan:'Tidak relevan' })[s.type]}</td><td>{s.rows}</td><td><span className={`import-status ${s.type}`}>{s.type === 'tidak_relevan' ? 'Lewati' : s.type === 'kendaraan' ? 'Siap import' : 'Perlu verifikasi'}</span></td><td><button className="import-btn" onClick={() => setSelected(sheets[idx])}>Preview</button></td></tr>)}</tbody></table></div></section>
      {selected && <section className="import-card"><div className="import-card-head"><div><span className="eyebrow">PREVIEW</span><h3>{selected.name}</h3><p>{summary.find(s => s.name === selected.name)?.type}</p></div><button className="import-btn" onClick={() => setSelected(null)}>Tutup</button></div><div className="import-preview"><table><thead><tr>{selected.detection.headers.map((h, i) => <th key={`${h}-${i}`}>{h || `Kolom ${i + 1}`}</th>)}</tr></thead><tbody>{selected.rows.slice(selected.detection.headerIndex + 1, selected.detection.headerIndex + 9).map((row, r) => <tr key={r}>{selected.detection.headers.map((_, c) => <td key={c}>{clean(row[c]) || '-'}</td>)}</tr>)}</tbody></table></div><div className="import-actions"><span>{selected.detection.type === 'kendaraan' ? 'Pengecekan nomor polisi akan dilakukan sebelum insert/update.' : 'Sheet belum ditulis sampai pemetaan transaksi diselesaikan.'}</span>{selected.detection.type === 'kendaraan' && <button className="import-btn primary" onClick={() => startImport(selected)} disabled={saving}>{saving ? 'Mengimport...' : 'Import Kendaraan'}</button>}</div></section>}
    </>}
  </div>
}

export default ImportExcelPage
