import { useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { clearDeletedExcelRows, filterDeletedExcelRows } from '../utils/excelPreviewControls.js'
import { parseXlsx } from '../utils/xlsxParser.js'
import './DataPageTools.css'
import './VehicleExcelImportModal.css'

const MAX_FILE_SIZE = 25 * 1024 * 1024
const PAGE_OPTIONS = [25, 50, 100]
const PLACEHOLDER_DRIVERS = new Set(['', 'DRIVER', 'STANDBY', '-', 'N/A', 'NA', 'NONE', 'TIDAK ADA', 'TIDAK ADA DRIVER'])
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
  keterangan: ['keterangan'],
  catatan_hutang: ['catatan_hutang'],
}
const EXPECTED_HEADERS = [
  ['No', 'Urutan sumber'], ['Merk', 'Merk'], ['Type', 'Tipe'], ['Jenis', 'Jenis kendaraan'],
  ['Tahun', 'Tahun'], ['No. Pol', 'Nomor polisi'], ['No. Mesin', 'Nomor mesin'], ['No. Rangka', 'Nomor rangka'],
  ['Pemilik', 'Pemilik'], ['Status', 'Kepemilikan: Aset/Sewa'], ['Masa Berlaku Pajak', 'Jatuh tempo pajak'],
  ['Status Pajak', 'Hidup/Mati'], ['Unit Kerja', 'Unit kerja'], ['Driver', 'Driver/PIC'], ['Lokasi Kerja', 'Lokasi'],
  ['Keterangan', 'Keterangan'], ['Catatan Hutang', 'Catatan hutang'],
]
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim()
const norm = value => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
const upper = value => clean(value).toUpperCase()

function findHeader(sheet) {
  const aliases = new Set(Object.values(LABELS).flat())
  let best = { index: -1, row: [], score: -1 }
  sheet.rows.slice(0, 80).forEach((item, idx) => {
    const values = item.values.map(norm)
    const score = values.reduce((n, value) => n + (aliases.has(value) ? 1 : 0), 0)
    if (score > best.score) best = { index: idx, row: item.values, score }
  })
  if (best.index < 0 || best.score < 8) throw new Error('Header Data Kendaraan tidak ditemukan. Pastikan file memakai format Excel Kendaraan yang benar.')
  return best
}
function valueOf(row, headers, key) {
  const index = headers.findIndex(header => (LABELS[key] || [key]).includes(norm(header)))
  return index >= 0 ? clean(row.values[index]) : ''
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
  if (Number.isFinite(serial) && serial > 20000 && serial < 80000) return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10)
  const date = new Date(v)
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
}
function numberValue(value) {
  const v = clean(value)
  if (!v) return null
  if (/^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(v)) return Number(v.replace(/\./g, '').replace(',', '.'))
  const n = Number(v.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}
function repairRow(row, headers) {
  const ownership = upper(valueOf(row, headers, 'status'))
  const statusPajak = upper(valueOf(row, headers, 'status_pajak'))
  const out = {
    excelRow: row.excelRow,
    sourceNo: valueOf(row, headers, 'no'),
    merk: valueOf(row, headers, 'merk'),
    tipe: valueOf(row, headers, 'tipe'),
    jenis: valueOf(row, headers, 'jenis'),
    tahun: valueOf(row, headers, 'tahun'),
    nomor_polisi: upper(valueOf(row, headers, 'nomor_polisi')),
    nomor_mesin: valueOf(row, headers, 'nomor_mesin'),
    nomor_rangka: valueOf(row, headers, 'nomor_rangka'),
    pemilik: valueOf(row, headers, 'pemilik'),
    ownership,
    masa_pajak_raw: valueOf(row, headers, 'masa_pajak'),
    status_pajak: statusPajak,
    unit_kerja: valueOf(row, headers, 'unit_kerja'),
    driver: valueOf(row, headers, 'driver'),
    lokasi: valueOf(row, headers, 'lokasi'),
    keterangan: valueOf(row, headers, 'keterangan'),
    catatan_hutang: valueOf(row, headers, 'catatan_hutang'),
    values: [...row.values],
  }
  out.masa_pajak = excelDate(out.masa_pajak_raw)
  if (out.masa_pajak_raw && !out.masa_pajak && !out.unit_kerja) out.unit_kerja = out.masa_pajak_raw
  if (out.status_pajak && !['HIDUP', 'MATI'].includes(out.status_pajak) && !out.driver) {
    out.driver = out.status_pajak
    out.status_pajak = ''
  }
  if (['ASET', 'MILIK', 'MILIK KANTOR', 'ASET KANTOR'].includes(ownership)) out.kepemilikan = 'ASET'
  else if (/^(SEWA|RENTAL|KENDARAAN SEWA)$/.test(ownership)) out.kepemilikan = 'SEWA'
  else if (!ownership) out.kepemilikan = null
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
      const values = [base[key], row[key]].map(clean).filter(Boolean)
      base[key] = [...new Set(values)].join(' | ')
    }
    if (!base.kepemilikan && row.kepemilikan) base.kepemilikan = row.kepemilikan
  }
  return base
}
function displayCell(value, header) {
  const raw = clean(value)
  if (!raw) return '-'
  if (/masa_pajak|masa_berlaku_pajak|jatuh_tempo_pajak/.test(norm(header))) {
    const date = excelDate(raw)
    if (date) return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${date}T00:00:00`))
  }
  return /^-?\d+\.0+$/.test(raw) ? raw.replace(/\.0+$/, '') : raw
}

async function importVehicleRows(rows) {
  const repaired = rows.filter(row => row.nomor_polisi && row.merk)
  if (!repaired.length) throw new Error('Tidak ada baris Kendaraan valid. Pastikan No. Pol dan Merk terisi.')
  const invalid = repaired.filter(row => !row.kepemilikan)
  if (invalid.length) throw new Error(`Ada ${invalid.length} baris dengan Status kepemilikan kosong/tidak valid. Gunakan hanya Aset atau Sewa (baris: ${invalid.map(row => row.excelRow).join(', ')}).`)
  const groups = new Map()
  repaired.forEach(row => { const key = upper(row.nomor_polisi); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row) })
  const merged = [...groups.values()].map(mergeRows)
  const vehiclesResult = await supabase.from('kendaraan').select('id,kode_kendaraan,nomor_polisi,merk,tipe,jenis_kendaraan,tahun,warna,nomor_rangka,nomor_mesin,kepemilikan,pemilik,driver_id,lokasi,unit_kerja,kilometer_terakhir,status,kondisi,keterangan,masa_berlaku_pajak,status_pajak,catatan_hutang')
  const driversResult = await supabase.from('driver').select('id,nama_lengkap,lokasi,status,keterangan')
  if (vehiclesResult.error) throw new Error(`Tidak bisa membaca master kendaraan: ${vehiclesResult.error.message}`)
  if (driversResult.error) throw new Error(`Tidak bisa membaca master driver: ${driversResult.error.message}`)
  const existingByPlate = Object.fromEntries((vehiclesResult.data || []).map(item => [upper(item.nomor_polisi), item]))
  const existingCodes = new Set((vehiclesResult.data || []).map(item => upper(item.kode_kendaraan)).filter(Boolean))
  const driverByName = Object.fromEntries((driversResult.data || []).map(item => [upper(item.nama_lengkap), item]))
  let added = 0; let updated = 0; let driversCreated = 0
  for (const row of merged) {
    const plate = upper(row.nomor_polisi)
    const current = existingByPlate[plate]
    const owner = row.pemilik || current?.pemilik || null
    const driverSource = clean(row.driver)
    let driverId = driverByName[upper(driverSource)]?.id || current?.driver_id || null
    if (driverSource && !PLACEHOLDER_DRIVERS.has(upper(driverSource)) && !driverId) {
      const created = await supabase.from('driver').insert({ nama_lengkap: driverSource, lokasi: row.lokasi || null, status: 'AKTIF', keterangan: 'Dibuat dari import Excel Kendaraan.' }).select('id,nama_lengkap,lokasi,status,keterangan').single()
      if (created.error) throw new Error(`Gagal membuat driver ${driverSource} (baris ${row.excelRow}): ${created.error.message}`)
      driverId = created.data.id
      driverByName[upper(driverSource)] = created.data
      driversCreated += 1
    }
    let code = upper(current?.kode_kendaraan || `KND-${plate.replace(/[^A-Z0-9]+/g, '')}`)
    if (!current && existingCodes.has(code)) code = `${code}-${plate.replace(/[^A-Z0-9]+/g, '')}`
    existingCodes.add(code)
    const payload = {
      kode_kendaraan: code,
      nomor_polisi: plate,
      merk: row.merk || current?.merk || null,
      tipe: row.tipe || current?.tipe || null,
      jenis_kendaraan: row.jenis || current?.jenis_kendaraan || null,
      tahun: numberValue(row.tahun) ?? current?.tahun ?? null,
      warna: current?.warna || null,
      nomor_rangka: row.nomor_rangka || current?.nomor_rangka || null,
      nomor_mesin: row.nomor_mesin || current?.nomor_mesin || null,
      kepemilikan: row.kepemilikan,
      pemilik: owner,
      driver_id: driverId,
      lokasi: row.lokasi || current?.lokasi || null,
      unit_kerja: row.unit_kerja || current?.unit_kerja || null,
      kilometer_terakhir: current?.kilometer_terakhir ?? 0,
      status: current?.status || 'ACTIVE',
      kondisi: current?.kondisi || null,
      keterangan: row.keterangan || current?.keterangan || null,
      masa_berlaku_pajak: row.masa_pajak || current?.masa_berlaku_pajak || null,
      status_pajak: row.status_pajak || current?.status_pajak || null,
      catatan_hutang: row.catatan_hutang || current?.catatan_hutang || null,
    }
    const result = current ? await supabase.from('kendaraan').update(payload).eq('id', current.id) : await supabase.from('kendaraan').insert(payload).select('id').single()
    if (result.error) throw new Error(`Gagal menyimpan kendaraan ${plate} (baris ${row.excelRow}): ${result.error.message}`)
    if (current) updated += 1
    else added += 1
    existingByPlate[plate] = { ...(current || {}), ...payload }
  }
  return { added, updated, mergedDuplicates: repaired.length - merged.length, driversCreated, sourceRows: repaired.length, uniqueVehicles: merged.length }
}

export default function VehicleExcelImportModalV2({ profile, onDone, onClose }) {
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [workbook, setWorkbook] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const canImport = ['ADMIN', 'TRANSPORT'].includes(profile?.role)
  const selected = workbook?.sheet
  const pageCount = Math.max(1, Math.ceil((workbook?.data?.length || 0) / pageSize))
  const pageRows = useMemo(() => (workbook?.data || []).slice((page - 1) * pageSize, page * pageSize), [workbook, page, pageSize])

  const scan = async nextFile => {
    clearDeletedExcelRows('kendaraan')
    setFile(nextFile || null); setWorkbook(null); setError(''); setMessage(''); setPage(1)
    if (!nextFile) return
    if (!/\.xlsx$/i.test(nextFile.name)) return setError('Gunakan file Excel .xlsx. Format .xls lama belum didukung.')
    if (nextFile.size > MAX_FILE_SIZE) return setError('Ukuran file maksimal 25 MB.')
    setLoading(true)
    try {
      
      
      
      
      
      
      const sheets = await parseXlsx(nextFile)
      const chosen = sheets.find(sheet => norm(sheet.name) === 'data_kendaraan') || sheets.find(sheet => /data\s*kendaraan/i.test(sheet.name))
      if (!chosen) throw new Error('Sheet Data Kendaraan tidak ditemukan.')
      const header = findHeader(chosen)
      const width = Math.max(header.row.length, EXPECTED_HEADERS.length)
      const data = chosen.rows.slice(header.index + 1)
        .filter(row => row.values.some(value => clean(value)))
        .map(row => ({ ...row, values: row.values.slice(0, width) }))
      const repaired = data.map(row => repairRow(row, header.row))
      const valid = repaired.filter(row => row.nomor_polisi && row.merk)
      const groups = new Map()
      valid.forEach(row => { const key = upper(row.nomor_polisi); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row) })
      const sourceNumbers = valid.map(row => Number(row.sourceNo)).filter(Number.isFinite).map(number => Math.trunc(number))
      const maxNo = sourceNumbers.length ? Math.max(...sourceNumbers) : 0
      const missingSourceNumbers = []
      for (let n = 1; n <= maxNo; n += 1) if (!sourceNumbers.includes(n)) missingSourceNumbers.push(n)
      setWorkbook({ sheet: chosen, header: { ...header, row: header.row.slice(0, width) }, data, valid, uniqueCount: groups.size, duplicateCount: valid.length - groups.size, missingSourceNumbers })
      setMessage(`Pemeriksaan selesai: ${data.length} baris sumber dibaca • ${valid.length} valid • ${groups.size} No. Polisi unik.`)
    } catch (e) { setError(e.message || 'File Excel tidak dapat dibaca.') }
    finally { setLoading(false) }
  }
  const start = async () => {
    if (!workbook || !canImport || saving) return
    
    setSaving(true); setError(''); setMessage('Import kendaraan berjalan...')
    try {
      const result = await importVehicleRows(filterDeletedExcelRows('kendaraan', workbook.valid))
      const report = { context: 'kendaraan', ...result, sourceRows: workbook.data.length, validRows: workbook.valid.length, uniqueVehicles: workbook.uniqueCount, mergedDuplicates: workbook.duplicateCount, missingSourceNumbers: workbook.missingSourceNumbers, fileName: file?.name || '', completedAt: new Date().toISOString() }
      sessionStorage.setItem('transport_import_report', JSON.stringify(report))
      setMessage(`Import selesai: ${result.uniqueVehicles} kendaraan unik • ${result.added} baru • ${result.updated} diperbarui • ${result.mergedDuplicates} duplikat digabung • ${result.driversCreated} driver dibuat.`)
      onDone?.(report)
    } catch (e) { setError(e.message || 'Import gagal.') }
    finally { setSaving(false) }
  }

  return <div className="dpt-overlay" role="dialog" aria-modal="true" aria-label="Import Excel Kendaraan">
    <section className="dpt-modal vehicle-import-modal">
      <header className="dpt-modal-head"><div><span className="eyebrow">IMPORT EXCEL KENDARAAN</span><h3>Data Kendaraan</h3><p>Preview membaca seluruh baris dari sheet Data Kendaraan.</p></div><button type="button" className="dpt-icon" onClick={onClose}>×</button></header>
      {error && <div className="dpt-alert error">{error}</div>}{message && <div className="dpt-alert success">{message}</div>}
      <div className="dpt-upload"><input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={event => scan(event.target.files?.[0])}/><button type="button" className="dpt-upload-button" onClick={() => inputRef.current?.click()} disabled={loading || saving}>{loading ? 'Membaca Excel…' : file ? 'Ganti File' : 'Pilih File Excel'}</button><div className="dpt-file-meta"><strong title={file?.name}>{file?.name || 'Belum ada file'}</strong><span>{file ? `✓ .xlsx • ${(file.size / 1024 / 1024).toFixed(2)} MB` : 'Maksimal 25 MB'}</span></div></div>
      {selected && <>
        <div className="vehicle-import-stats"><div><b>{workbook.data.length}</b><span>baris sumber</span></div><div><b>{workbook.valid.length}</b><span>baris valid</span></div><div><b>{workbook.uniqueCount}</b><span>kendaraan unik</span></div><div><b>{workbook.duplicateCount}</b><span>duplikat digabung</span></div></div>
        {workbook.missingSourceNumbers.length > 0 && <div className="vehicle-import-warning">Nomor urut sumber yang tidak ada: <b>{workbook.missingSourceNumbers.join(', ')}</b>.</div>}
        <div className="vehicle-import-explanation"><b>Rekonsiliasi</b><span>Semua baris Excel tetap tampil di preview. No. Polisi dipakai sebagai identitas unik saat penyimpanan.</span><span>{workbook.data.length} baris sumber → {workbook.valid.length} valid → {workbook.uniqueCount} kendaraan unik → {workbook.duplicateCount} duplikat digabung.</span></div>
        <div className="vehicle-import-map">{EXPECTED_HEADERS.map(([src, target]) => <div key={src}><b>{src}</b><span>→</span><span>{target}</span></div>)}</div>
        <div className="dpt-preview"><div className="dpt-sheet-title"><div><b>Preview Sumber: {selected.name}</b><span className="dpt-preview-note">Semua baris tersedia. Gunakan pagination untuk berpindah halaman.</span></div><span>{pageRows.length} dari {workbook.data.length} ditampilkan</span></div><div className="dpt-preview-wrap"><table><thead><tr>{workbook.header.row.map((header, index) => <th key={`${String(header)}-${index}`}>{header || `Kolom ${index + 1}`}</th>)}</tr></thead><tbody>{pageRows.map(row => <tr data-excel-row={row.excelRow} key={row.excelRow}>{workbook.header.row.map((header, index) => <td key={`${row.excelRow}-${index}`}>{displayCell(row.values[index], header)}</td>)}</tr>)}</tbody></table></div><div className="dpt-pagination"><label>Baris/halaman <select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1) }}>{PAGE_OPTIONS.map(size => <option key={size} value={size}>{size}</option>)}</select></label><button type="button" className="dpt-button" onClick={() => setPage(current => Math.max(1, current - 1))} disabled={page <= 1}>‹</button><span>Halaman {page} / {pageCount}</span><button type="button" className="dpt-button" onClick={() => setPage(current => Math.min(pageCount, current + 1))} disabled={page >= pageCount}>›</button></div></div>
      </>}
      <div className="dpt-actions"><button type="button" className="dpt-button" onClick={onClose} disabled={saving}>Batal</button><button type="button" className="dpt-button primary" onClick={start} disabled={!workbook || !workbook.valid.length || saving || !canImport}>{saving ? 'Mengimport…' : `Import ${workbook?.valid?.length || ''} Kendaraan`}</button></div>
    </section>
  </div>
}
