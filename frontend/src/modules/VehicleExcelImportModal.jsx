import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import './DataPageTools.css'
import './VehicleExcelImportModal.css'

const LABELS = {
  no: ['no', 'nomor', 'nomor_urut'],
  merk: ['merk', 'brand'],
  tipe: ['type', 'tipe'],
  jenis: ['jenis', 'jenis_kendaraan', 'jenis_unit'],
  tahun: ['tahun', 'tahun_kendaraan'],
  nomor_polisi: ['no_pol', 'no_polisi', 'nomor_polisi', 'plat', 'nomor_kendaraan'],
  nomor_mesin: ['no_mesin', 'nomor_mesin'],
  nomor_rangka: ['no_rangka', 'nomor_rangka'],
  pemilik: ['pemilik', 'nama_pemilik', 'pemilik_pic'],
  status: ['status', 'kepemilikan', 'status_kepemilikan', 'ownership'],
  masa_pajak: ['masa_berlaku_pajak', 'masa_pajak', 'jatuh_tempo_pajak', 'pajak_jatuh_tempo'],
  status_pajak: ['status_pajak'],
  unit_kerja: ['unit_kerja', 'pengunaan_unit', 'penggunaan_unit'],
  driver: ['driver', 'nama_driver', 'driver_pic'],
  lokasi: ['lokasi_kerja', 'lokasi', 'home_base', 'homebase'],
  keterangan: ['keterangan', 'catatan'],
  catatan_hutang: ['catatan_hutang'],
}

const EXPECTED_HEADERS = [
  ['No', 'Urutan sumber'],
  ['Merk', 'Merk'],
  ['Type', 'Tipe'],
  ['Jenis', 'Jenis kendaraan'],
  ['Tahun', 'Tahun'],
  ['No. Pol', 'Nomor polisi'],
  ['No. Mesin', 'Nomor mesin'],
  ['No. Rangka', 'Nomor rangka'],
  ['Pemilik', 'Pemilik'],
  ['Status', 'Kepemilikan: Aset/Sewa'],
  ['Masa Berlaku Pajak', 'Jatuh tempo pajak'],
  ['Status Pajak', 'Hidup/Mati'],
  ['Unit Kerja', 'Unit kerja'],
  ['Driver', 'Driver/PIC'],
  ['Lokasi Kerja', 'Lokasi'],
  ['Keterangan', 'Keterangan'],
  ['Catatan Hutang', 'Catatan hutang'],
]

const PLACEHOLDER_DRIVERS = new Set(['', 'DRIVER', 'STANDBY', '-', 'N/A', 'NA', 'NONE', 'TIDAK ADA', 'TIDAK ADA DRIVER'])

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim()
const norm = (v) => clean(v).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
const upper = (v) => clean(v).toUpperCase()

function colIndex(name) {
  let n = 0
  for (const c of name) n = n * 26 + c.charCodeAt(0) - 64
  return n - 1
}

function excelDate(value) {
  const v = clean(value)
  if (!v) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(v)) {
    const [d, m, y] = v.split(/[-/]/)
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  const serial = Number(v)
  if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
    return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10)
  }
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

function numberValue(value) {
  const v = clean(value)
  if (!v) return null
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(v)) return Number(v.replace(/\./g, '').replace(',', '.'))
  const n = Number(v.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

function text(bytes) { return new TextDecoder('utf-8').decode(bytes) }
async function inflate(bytes) {
  if (typeof DecompressionStream === 'undefined') throw new Error('Browser belum mendukung pembacaan XLSX. Gunakan Chrome/Edge terbaru.')
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

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
  const zip = await unzip(await file.arrayBuffer())
  const workbook = new DOMParser().parseFromString(text(await zip.read('xl/workbook.xml') || new Uint8Array()), 'application/xml')
  const rels = new DOMParser().parseFromString(text(await zip.read('xl/_rels/workbook.xml.rels') || new Uint8Array()), 'application/xml')
  const sharedStrings = []; const shared = await zip.read('xl/sharedStrings.xml')
  if (shared) {
    const doc = new DOMParser().parseFromString(text(shared), 'application/xml')
    doc.querySelectorAll('si').forEach((si) => sharedStrings.push(clean(Array.from(si.querySelectorAll('t')).map((t) => t.textContent || '').join(''))))
  }
  const relMap = Object.fromEntries(Array.from(rels.querySelectorAll('Relationship')).map((r) => [r.getAttribute('Id'), r.getAttribute('Target')]))
  const sheets = []
  for (const sheet of Array.from(workbook.querySelectorAll('sheets > sheet'))) {
    const target0 = relMap[sheet.getAttribute('r:id')]; if (!target0) continue
    const target = target0.startsWith('xl/') ? target0 : `xl/${target0.replace(/^\//, '')}`
    const doc = new DOMParser().parseFromString(text(await zip.read(target) || new Uint8Array()), 'application/xml'); const rows = []
    doc.querySelectorAll('sheetData > row').forEach((row) => {
      const values = []; row.querySelectorAll(':scope > c').forEach((cell) => {
        const ref = cell.getAttribute('r') || ''; const match = ref.match(/^([A-Z]+)/); if (!match) return
        const idx = colIndex(match[1]); const type = cell.getAttribute('t') || ''; let value = clean(cell.querySelector('v')?.textContent)
        if (type === 's') value = sharedStrings[Number(value)] || ''
        else if (type === 'inlineStr') value = clean(Array.from(cell.querySelectorAll('is t')).map((n) => n.textContent || '').join(''))
        else if (type === 'b') value = value === '1' ? 'TRUE' : 'FALSE'
        values[idx] = value
      })
      if (values.some((v) => clean(v))) rows.push({ excelRow: Number(row.getAttribute('r') || rows.length + 1), values })
    })
    sheets.push({ name: sheet.getAttribute('name') || target, rows })
  }
  if (!sheets.length) throw new Error('Tidak ada sheet yang bisa dibaca dari file Excel.')
  return sheets
}

function findHeader(sheet) {
  let best = { index: -1, row: [], score: -1 }
  sheet.rows.slice(0, 50).forEach((item, idx) => { const score = item.values.filter(Boolean).map(norm).filter(Boolean).length; if (score > best.score) best = { index: idx, row: item.values, score } })
  return best.index >= 0 ? { ...best, excelRow: sheet.rows[best.index].excelRow } : { index: 0, row: sheet.rows[0]?.values || [], score: 0, excelRow: sheet.rows[0]?.excelRow || 1 }
}

function getValue(row, headers, key) {
  const aliases = LABELS[key] || [key]; const idx = headers.findIndex((h) => aliases.includes(norm(h))); return idx >= 0 ? clean(row.values[idx]) : ''
}
function repairRow(row, headers) {
  const out = { excelRow: row.excelRow, sourceNo: getValue(row, headers, 'no'), merk: getValue(row, headers, 'merk'), tipe: getValue(row, headers, 'tipe'), jenis: getValue(row, headers, 'jenis'), tahun: getValue(row, headers, 'tahun'), nomor_polisi: getValue(row, headers, 'nomor_polisi'), nomor_mesin: getValue(row, headers, 'nomor_mesin'), nomor_rangka: getValue(row, headers, 'nomor_rangka'), pemilik: getValue(row, headers, 'pemilik'), ownership: getValue(row, headers, 'status'), masa_pajak_raw: getValue(row, headers, 'masa_pajak'), status_pajak: getValue(row, headers, 'status_pajak'), unit_kerja: getValue(row, headers, 'unit_kerja'), driver: getValue(row, headers, 'driver'), lokasi: getValue(row, headers, 'lokasi'), keterangan: getValue(row, headers, 'keterangan'), catatan_hutang: getValue(row, headers, 'catatan_hutang') }
  const rawTax = out.masa_pajak_raw; const rawTaxStatus = upper(out.status_pajak)
  if (rawTax && !excelDate(rawTax)) { if (!out.unit_kerja) out.unit_kerja = rawTax; out.masa_pajak_raw = '' }
  if (rawTaxStatus && !['HIDUP', 'MATI'].includes(rawTaxStatus)) { if (!out.driver) out.driver = out.status_pajak; out.status_pajak = '' }
  out.masa_pajak = excelDate(out.masa_pajak_raw)
  out.ownership = upper(out.ownership)
  if (out.ownership === 'ASET' || out.ownership === 'MILIK' || out.ownership === 'MILIK KANTOR' || out.ownership === 'ASET KANTOR') out.kepemilikan = 'ASET_KANTOR'
  else if (/^(SEWA|RENTAL|KENDARAAN SEWA)$/.test(out.ownership)) out.kepemilikan = 'SEWA'
  else if (!out.ownership) out.kepemilikan = 'ASET_KANTOR'
  else out.kepemilikan = null
  return out
}

function completeness(row) {
  return ['merk','tipe','jenis','tahun','nomor_polisi','nomor_mesin','nomor_rangka','pemilik','ownership','masa_pajak','status_pajak','unit_kerja','driver','lokasi','keterangan','catatan_hutang'].reduce((n, key) => n + (clean(row[key]) ? 1 : 0), 0)
}

function mergeRows(group) {
  const sorted = [...group].sort((a, b) => completeness(b) - completeness(a) || a.excelRow - b.excelRow)
  const base = { ...sorted[0] }
  for (const row of sorted.slice(1)) {
    for (const key of ['merk','tipe','jenis','tahun','nomor_mesin','nomor_rangka','pemilik','masa_pajak','status_pajak','unit_kerja','driver','lokasi']) if (!clean(base[key]) && clean(row[key])) base[key] = row[key]
    for (const key of ['keterangan','catatan_hutang']) {
      const values = [base[key], row[key]].map(clean).filter(Boolean); base[key] = [...new Set(values)].join(' | ')
    }
    if (!base.kepemilikan && row.kepemilikan) base.kepemilikan = row.kepemilikan
  }
  return { ...base, mergedRows: group.length - 1, sourceRows: group.map((x) => x.excelRow) }
}

function formatDate(v) { if (!v) return '-'; return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${v}T00:00:00`)) }
function displayCell(value, header) { const raw = clean(value); if (!raw) return '-'; const k = norm(header); if (/masa_pajak|masa_berlaku_pajak|jatuh_tempo_pajak/.test(k)) { const d = excelDate(raw); if (d) return formatDate(d) } return /^\d+\.0$/.test(raw) ? raw.slice(0, -2) : raw }

async function importVehicleRows(rows) {
  const repaired = rows.filter((r) => r.nomor_polisi && r.merk)
  if (!repaired.length) throw new Error('Tidak ada baris Kendaraan yang valid untuk diimport.')
  const invalid = repaired.filter((r) => !r.kepemilikan)
  if (invalid.length) throw new Error(`Ada ${invalid.length} baris dengan Status kepemilikan selain Aset/Sewa. Perbaiki kolom Status pada baris Excel: ${invalid.map((r) => r.excelRow).join(', ')}.`)
  const groups = new Map()
  repaired.forEach((row) => { const key = upper(row.nomor_polisi); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row) })
  const merged = [...groups.values()].map(mergeRows)
  const vehiclesResult = await supabase.from('kendaraan').select('id,kode_kendaraan,nomor_polisi,merk,tipe,jenis_kendaraan,tahun,warna,nomor_rangka,nomor_mesin,kepemilikan,jenis_sewa,pemilik,driver_id,lokasi,unit_kerja,kilometer_terakhir,status,kondisi,keterangan,masa_berlaku_pajak,status_pajak,catatan_hutang')
  const driversResult = await supabase.from('driver').select('id,nama_lengkap,lokasi,status,keterangan')
  if (vehiclesResult.error) throw new Error(`Tidak bisa membaca master kendaraan: ${vehiclesResult.error.message}`)
  if (driversResult.error) throw new Error(`Tidak bisa membaca master driver: ${driversResult.error.message}`)
  const existingByPlate = Object.fromEntries((vehiclesResult.data || []).map((v) => [upper(v.nomor_polisi), v])); const existingCodes = new Set((vehiclesResult.data || []).map((v) => upper(v.kode_kendaraan)).filter(Boolean)); const driverByName = Object.fromEntries((driversResult.data || []).map((d) => [upper(d.nama_lengkap), d]))
  let added = 0; let updated = 0; let driversCreated = 0
  for (const row of merged) {
    const plate = upper(row.nomor_polisi); const current = existingByPlate[plate]; const owner = row.pemilik || current?.pemilik || null
    const driverSource = clean(row.driver); let driverId = driverByName[upper(driverSource)]?.id || current?.driver_id || null
    if (driverSource && !PLACEHOLDER_DRIVERS.has(upper(driverSource)) && !driverId) {
      const created = await supabase.from('driver').insert({ nama_lengkap: driverSource, lokasi: row.lokasi || null, status: 'AKTIF', keterangan: 'Dibuat dari import Excel Kendaraan.' }).select('id,nama_lengkap,lokasi,status,keterangan').single()
      if (created.error) throw new Error(`Gagal membuat driver ${driverSource} (baris ${row.excelRow}): ${created.error.message}`)
      driverId = created.data.id; driverByName[upper(driverSource)] = created.data; driversCreated += 1
    }
    let code = upper(current?.kode_kendaraan || `KND-${plate.replace(/[^A-Z0-9]+/g, '')}`); if (!current && existingCodes.has(code)) code = `${code}-${plate.replace(/[^A-Z0-9]+/g, '')}`; existingCodes.add(code)
    const payload = { kode_kendaraan: code, nomor_polisi: plate, merk: row.merk || current?.merk || null, tipe: row.tipe || current?.tipe || null, jenis_kendaraan: row.jenis || current?.jenis_kendaraan || null, tahun: numberValue(row.tahun) ?? current?.tahun ?? null, warna: current?.warna || null, nomor_rangka: row.nomor_rangka || current?.nomor_rangka || null, nomor_mesin: row.nomor_mesin || current?.nomor_mesin || null, kepemilikan: row.kepemilikan, jenis_sewa: row.kepemilikan === 'SEWA' ? (current?.jenis_sewa || (/^(PT|CV|UD|PD)\b/i.test(owner || '') ? 'SEWA_RENTAL' : 'SEWA_PERORANGAN')) : null, pemilik: owner, driver_id: driverId, lokasi: row.lokasi || current?.lokasi || null, unit_kerja: row.unit_kerja || current?.unit_kerja || null, kilometer_terakhir: current?.kilometer_terakhir ?? 0, status: current?.status || 'ACTIVE', kondisi: current?.kondisi || null, keterangan: row.keterangan || current?.keterangan || null, masa_berlaku_pajak: row.masa_pajak || current?.masa_berlaku_pajak || null, status_pajak: row.status_pajak || current?.status_pajak || null, catatan_hutang: row.catatan_hutang || current?.catatan_hutang || null }
    const result = current ? await supabase.from('kendaraan').update(payload).eq('id', current.id) : await supabase.from('kendaraan').insert(payload).select('id').single()
    if (result.error) throw new Error(`Gagal menyimpan kendaraan ${plate} (baris ${row.excelRow}): ${result.error.message}`)
    if (current) updated += 1; else added += 1; existingByPlate[plate] = { ...(current || {}), ...payload }
  }
  return { added, updated, mergedDuplicates: repaired.length - merged.length, driversCreated, sourceRows: repaired.length, uniqueVehicles: merged.length }
}

export default function VehicleExcelImportModal({ profile, onDone, onClose }) {
  const inputRef = useRef(null); const [file, setFile] = useState(null); const [workbook, setWorkbook] = useState(null); const [loading, setLoading] = useState(false); const [saving, setSaving] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('')
  const canImport = ['ADMIN', 'TRANSPORT'].includes(profile?.role); const selected = workbook?.sheet
  const scan = async (nextFile) => {
    setFile(nextFile || null); setWorkbook(null); setError(''); setMessage(''); if (!nextFile) return
    if (!/\.xlsx$/i.test(nextFile.name)) return setError('Gunakan file Excel .xlsx. Format .xls lama belum didukung.')
    if (nextFile.size > 25 * 1024 * 1024) return setError('Ukuran file maksimal 25 MB.')
    setLoading(true)
    try {
      const sheets = await parseXlsx(nextFile); const chosen = sheets.find((s) => /data\s*kendaraan|kendaraan|armada/i.test(s.name)) || sheets.find((s) => { const h = findHeader(s).row.map(norm); return h.includes('no_pol') && h.includes('merk') })
      if (!chosen) throw new Error('Sheet Data Kendaraan tidak ditemukan.')
      const header = findHeader(chosen); const data = chosen.rows.filter((r, idx) => idx > header.index && r.values.some((v) => clean(v))); const valid = data.map((r) => repairRow(r, header.row)).filter((r) => r.nomor_polisi && r.merk); const groups = new Map(); valid.forEach((r) => { const k = upper(r.nomor_polisi); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r) })
      const nums = valid.map((r) => Number(r.sourceNo)).filter(Number.isFinite).map((n) => Math.trunc(n)); const maxNo = nums.length ? Math.max(...nums) : 0; const missing = []; for (let n = 1; n <= maxNo; n += 1) if (!nums.includes(n)) missing.push(n)
      const previewRows = data.slice(0, 8)
      setWorkbook({ sheet: chosen, header, data, valid, uniqueCount: groups.size, duplicateCount: valid.length - groups.size, missingSourceNumbers: missing, previewRows })
      setMessage(`Pemeriksaan awal selesai: ${data.length} baris sumber • ${valid.length} baris valid • ${groups.size} kendaraan unik • ${valid.length - groups.size} baris duplikat yang akan digabung.`)
    } catch (e) { setError(e.message || 'File Excel tidak dapat dibaca.') } finally { setLoading(false) }
  }
  const start = async () => {
    if (!workbook || !canImport || saving) return
    setSaving(true); setError(''); setMessage('Import berjalan...')
    try { const result = await importVehicleRows(workbook.valid, profile); const report = { context: 'kendaraan', ...result, sourceRows: workbook.data.length, validRows: workbook.valid.length, uniqueVehicles: workbook.uniqueCount, mergedDuplicates: workbook.duplicateCount, missingSourceNumbers: workbook.missingSourceNumbers, fileName: file?.name || '', completedAt: new Date().toISOString() }; sessionStorage.setItem('transport_import_report', JSON.stringify(report)); setMessage(`Import selesai: ${result.uniqueVehicles} kendaraan unik diproses • ${result.added} baru • ${result.updated} diperbarui • ${result.mergedDuplicates} duplikat digabung • ${result.driversCreated} driver dibuat.`); onDone?.(report) } catch (e) { setError(e.message || 'Import gagal.') } finally { setSaving(false) }
  }
  return <div className="dpt-overlay" role="dialog" aria-modal="true"><section className="dpt-modal vehicle-import-modal">
    <header className="dpt-modal-head"><div><span className="eyebrow">IMPORT EXCEL KENDARAAN</span><h3>Data Kendaraan</h3><p>Mapping dibuat berdasarkan kolom sumber yang benar-benar ada di workbook. Tidak ada kolom sistem yang diisi asal.</p></div><button type="button" className="dpt-icon" onClick={onClose}>×</button></header>
    {error && <div className="dpt-alert error">{error}</div>}{message && <div className="dpt-alert success">{message}</div>}
    <div className="dpt-upload"><input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => scan(e.target.files?.[0])}/><button type="button" className="dpt-upload-button" onClick={() => inputRef.current?.click()} disabled={loading || saving}>{loading ? 'Membaca Excel…' : file ? 'Ganti File' : 'Pilih File Excel'}</button><div className="dpt-file-meta"><strong title={file?.name}>{file?.name || 'Belum ada file'}</strong><span>{file ? `✓ .xlsx • ${(file.size / 1024 / 1024).toFixed(2)} MB` : 'Maksimal 25 MB'}</span></div></div>
    {selected && <>
      <div className="vehicle-import-stats"><div><b>{selected.data.length}</b><span>baris sumber</span></div><div><b>{selected.valid.length}</b><span>baris valid</span></div><div><b>{selected.uniqueCount}</b><span>kendaraan unik</span></div><div><b>{selected.duplicateCount}</b><span>duplikat digabung</span></div></div>
      {selected.missingSourceNumbers.length > 0 && <div className="vehicle-import-warning">Nomor urut sumber yang tidak ada: <b>{selected.missingSourceNumbers.join(', ')}</b>. Ini masalah pada file sumber, bukan sistem.</div>}
      <div className="vehicle-import-explanation"><b>Kenapa jumlah kendaraan bisa lebih sedikit?</b><span>Excel menghitung baris sumber, sedangkan Master Kendaraan menghitung No. Polisi unik.</span><span>File ini: {selected.data.length} baris sumber → {selected.valid.length} baris valid → {selected.uniqueCount} No. Polisi unik → {selected.duplicateCount} baris duplikat digabung.</span><span>{selected.duplicateCount > 0 ? 'Baris dengan No. Polisi yang sama digabung menjadi satu kendaraan; bukan berarti kendaraan hilang.' : 'Tidak ada duplikat No. Polisi pada file ini.'}</span></div><div className="vehicle-import-note"><b>Penyesuaian yang dilakukan:</b><span>Status = Aset/Sewa → Kepemilikan.</span><span>Masa Berlaku Pajak hanya diterima bila benar-benar tanggal.</span><span>Baris yang kolomnya bergeser diperbaiki berdasarkan pola data.</span><span>Duplikat No. Pol digabung tanpa membuat kendaraan ganda.</span><span>Informasi Keterangan/Catatan Hutang dari baris duplikat digabung, bukan dibuang.</span><span>Data STNK tidak dibuat otomatis dari import Kendaraan.</span></div>
      <div className="vehicle-import-map">{EXPECTED_HEADERS.map(([src, target]) => <div key={src}><b>{src}</b><span>→</span><span>{target}</span></div>)}</div>
      <div className="dpt-preview"><div className="dpt-sheet-title"><b>Preview Sumber: {selected.sheet.name}</b><span>Semua baris sumber • nilai tanggal diperbaiki saat simpan</span></div><div className="dpt-preview-wrap"><table><thead><tr>{selected.header.row.map((h, i) => <th key={`${h}-${i}`}>{h || `Kolom ${i + 1}`}</th>)}</tr></thead><tbody>{selected.previewRows.map((row) => <tr key={row.excelRow}>{selected.header.row.map((h, i) => <td key={i}>{displayCell(row.values[i], h)}</td>)}</tr>)}</tbody></table></div></div>
    </>}
    <div className="dpt-actions"><button type="button" className="dpt-button" onClick={onClose} disabled={saving}>Batal</button><button type="button" className="dpt-button primary" onClick={start} disabled={!selected || saving || !canImport}>{saving ? 'Mengimport…' : 'Import Kendaraan'}</button></div>
  </section></div>
}
