import { useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { clearDeletedExcelRows, filterDeletedExcelRows } from '../utils/excelPreviewControls.js'
import { parseXlsx } from '../utils/xlsxParser.js'
import './DataPageTools.css'

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim()
const norm = (v) => clean(v).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
const upper = (v) => clean(v).toUpperCase()
const MAX_FILE_SIZE = 25 * 1024 * 1024

const ALIASES = {
  nomor_polisi: ['no_polisi', 'nomor_polisi', 'no_pol', 'no_plat', 'plat'],
  tanggal: ['tanggal', 'tgl', 'tanggal_pengajuan'],
  keluhan: ['keluhan', 'keluhan_kerusakan', 'uraian', 'keterangan', 'deskripsi'],
  jenis: ['jenis_permintaan', 'jenis_perbaikan', 'jenis_service'],
  prioritas: ['prioritas'],
  kilometer: ['km', 'kilometer', 'kilometer_pengajuan'],
}

const valueOf = (row, headers, key) => {
  const aliases = ALIASES[key] || [key]
  const index = headers.findIndex((h) => aliases.includes(norm(h)))
  return index >= 0 ? clean(row.values[index]) : ''
}

function excelDate(value) {
  const v = clean(value)
  if (!v) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(v)) {
    const [d, m, y] = v.split(/[/-]/)
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  const serial = Number(v)
  if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
    return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10)
  }
  const date = new Date(v)
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
}

function numberValue(value) {
  const v = clean(value)
  if (!v) return null
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(v)) return Number(v.replace(/\./g, '').replace(',', '.'))
  const n = Number(v.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

function findHeader(sheet) {
  let best = { index: -1, row: [], score: -1 }
  sheet.rows.slice(0, 50).forEach((item, idx) => {
    const score = item.values.filter(Boolean).map(norm).filter(Boolean).length
    if (score > best.score) best = { index: idx, row: item.values, score }
  })
  return best.index >= 0 ? best : { index: 0, row: sheet.rows[0]?.values || [], score: 0 }
}

function scoreSheet(sheet) {
  const name = norm(sheet.name)
  const header = findHeader(sheet)
  const headers = header.row.map(norm)
  let score = 0
  if (name === 'rekapan_permintaan') score += 50
  if (name.includes('rekapan_permintaan')) score += 20
  if (headers.includes('no_polisi')) score += 10
  if (headers.includes('tanggal')) score += 8
  if (headers.includes('keterangan') || headers.includes('keluhan')) score += 8
  if (headers.includes('biaya_rp') || headers.includes('biaya')) score += 2
  return { sheet, header, score }
}

export default function PengajuanExcelImportModal({ profile, onDone, onClose }) {
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [vehicles, setVehicles] = useState([])
  const [rows, setRows] = useState([])

  const canImport = ['ADMIN', 'TRANSPORT'].includes(profile?.role)
  const previewRows = useMemo(() => rows.slice(0, 100), [rows])

  const scan = async (nextFile) => {
    clearDeletedExcelRows('pengajuan')
    setFile(nextFile || null); setSelected(null); setRows([]); setVehicles([]); setError(''); setMessage('')
    if (!nextFile) return
    if (!/\.xlsx$/i.test(nextFile.name)) return setError('Gunakan file Excel .xlsx.')
    if (nextFile.size > MAX_FILE_SIZE) return setError('Ukuran file maksimal 25 MB.')
    setLoading(true)
    try {
      const sheets = await parseXlsx(nextFile)
      const ranked = sheets.map(scoreSheet).sort((a, b) => b.score - a.score)
      const candidate = ranked[0]
      if (!candidate || candidate.score < 50) throw new Error('Sheet Pengajuan tidak ditemukan. Gunakan sheet “Rekapan Permintaan” atau tabel dengan No Polisi, Tanggal, dan Keterangan/Keluhan.')
      const headers = candidate.header.row
      const data = candidate.sheet.rows.slice(candidate.header.index + 1).filter((r) => r.values.some((v) => clean(v))).map((row) => ({
        excelRow: row.excelRow,
        nomor_polisi: upper(valueOf(row, headers, 'nomor_polisi')),
        tanggal: excelDate(valueOf(row, headers, 'tanggal')),
        keluhan: valueOf(row, headers, 'keluhan'),
        jenis: upper(valueOf(row, headers, 'jenis') || 'SERVICE'),
        prioritas: upper(valueOf(row, headers, 'prioritas') || 'NORMAL'),
        kilometer: numberValue(valueOf(row, headers, 'kilometer')),
      }))
      const v = await supabase.from('kendaraan').select('id,nomor_polisi,kilometer_terakhir,status').order('nomor_polisi')
      if (v.error) throw v.error
      setVehicles(v.data || [])
      setSelected(candidate)
      setRows(data)
      setMessage(`Sheet “${candidate.sheet.name}” terdeteksi: ${data.length} baris sumber.`)
    } catch (e) {
      setError(e.message || 'File Excel tidak dapat dibaca.')
    } finally { setLoading(false) }
  }

  const start = async () => {
    if (!selected || !canImport || saving) return
    setSaving(true); setError(''); setMessage('Memeriksa kendaraan, duplikat, dan menyimpan pengajuan...')
    try {
      const activeRows = filterDeletedExcelRows('pengajuan', rows)
      const vehicleMap = Object.fromEntries((vehicles || []).map((v) => [upper(v.nomor_polisi), v]))
      const invalid = []
      const seen = new Set()
      const valid = []
      for (const row of activeRows) {
        const vehicle = vehicleMap[row.nomor_polisi]
        if (!row.nomor_polisi || !row.tanggal || !row.keluhan) { invalid.push({ row: row.excelRow, reason: 'No Polisi/Tanggal/Keterangan belum lengkap' }); continue }
        if (!vehicle) { invalid.push({ row: row.excelRow, reason: `Plat ${row.nomor_polisi} belum ada di Master Kendaraan` }); continue }
        if (vehicle.status === 'TIDAK_AKTIF') { invalid.push({ row: row.excelRow, reason: 'Kendaraan tidak aktif' }); continue }
        const km = row.kilometer ?? Number(vehicle.kilometer_terakhir || 0)
        const key = [vehicle.id, row.tanggal, row.jenis, row.keluhan.toUpperCase(), km].join('|')
        if (seen.has(key)) { invalid.push({ row: row.excelRow, reason: 'Duplikat di file Excel' }); continue }
        seen.add(key)
        valid.push({ ...row, vehicle, km, key })
      }
      if (!valid.length) throw new Error('Tidak ada baris Pengajuan yang valid. Pastikan No Polisi sudah ada di Master Kendaraan dan tanggal/keterangan terisi.')

      const existing = await supabase.from('permintaan_service').select('kendaraan_id,tanggal_pengajuan,kilometer_pengajuan,jenis_permintaan,keluhan')
      if (existing.error) throw existing.error
      const existingKeys = new Set((existing.data || []).map((x) => [x.kendaraan_id, x.tanggal_pengajuan, x.jenis_permintaan || 'SERVICE', String(x.keluhan || '').toUpperCase(), x.kilometer_pengajuan ?? 0].join('|')))
      const toInsert = valid.filter((x) => !existingKeys.has(x.key))
      const duplicate = valid.length - toInsert.length

      if (toInsert.length) {
        const payload = toInsert.map((x) => ({
          pemohon_id: profile.id,
          kendaraan_id: x.vehicle.id,
          tanggal_pengajuan: x.tanggal,
          kilometer_pengajuan: x.km,
          jenis_permintaan: x.jenis,
          keluhan: x.keluhan,
          prioritas: ['RENDAH', 'NORMAL', 'TINGGI', 'URGENT'].includes(x.prioritas) ? x.prioritas : 'NORMAL',
          status: 'MENUNGGU_TRANSPORT',
        }))
        const insert = await supabase.from('permintaan_service').insert(payload)
        if (insert.error) throw insert.error
      }

      const report = {
        context: 'pengajuan',
        sourceRows: activeRows.length,
        validRows: valid.length,
        imported: toInsert.length,
        skipped: invalid.length + duplicate,
        duplicate,
        unknownPlates: [...new Set(invalid.filter((x) => x.reason.includes('belum ada')).map((x) => rows.find((r) => r.excelRow === x.row)?.nomor_polisi).filter(Boolean))],
        message: `${toInsert.length} pengajuan ditambahkan, ${invalid.length + duplicate} baris dilewati. Sumber: ${selected.sheet.name}.`,
        fileName: file?.name || '',
        completedAt: new Date().toISOString(),
      }
      sessionStorage.setItem('transport_import_report', JSON.stringify(report))
      onDone?.(report)
    } catch (e) {
      setError(e.message || 'Import pengajuan gagal.')
      setMessage('')
    } finally { setSaving(false) }
  }

  return <div className="dpt-overlay" role="dialog" aria-modal="true" aria-label="Import Pengajuan Service">
    <section className="dpt-modal">
      <header className="dpt-modal-head">
        <div><span className="eyebrow">IMPORT EXCEL</span><h3>Import Pengajuan Service</h3><p>Memakai format Excel nyata: “Rekapan Permintaan” dengan No Polisi, Tanggal, dan Keterangan.</p></div>
        <button type="button" className="dpt-icon" onClick={onClose}>×</button>
      </header>
      {error && <div className="dpt-alert error">{error}</div>}
      {message && <div className="dpt-alert success">{message}</div>}
      <div className="dpt-upload"><input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => scan(e.target.files?.[0])}/><button type="button" className="dpt-upload-button" onClick={() => inputRef.current?.click()} disabled={loading || saving}>{loading ? 'Membaca Excel…' : file ? 'Ganti File' : 'Pilih File Excel'}</button><div className="dpt-file-meta"><strong title={file?.name}>{file?.name || 'Belum ada file'}</strong><span>{file ? `✓ .xlsx • ${(file.size / 1024 / 1024).toFixed(2)} MB` : 'Maksimal 25 MB'}</span></div></div>
      {selected && <>
        <div className="dpt-selection"><div><b>Sheet: {selected.sheet.name}</b><span>Format cocok</span></div><span>{rows.length} baris data</span></div>
        <div className="dpt-preview"><div className="dpt-sheet-title"><div><b>Preview Data</b><span className="dpt-preview-note">Tabel sumber dibaca tanpa mengubah Excel asli.</span></div><span>{previewRows.length} baris ditampilkan</span></div><div className="dpt-preview-wrap"><table><thead><tr><th>Baris</th><th>No Polisi</th><th>Tanggal</th><th>Jenis</th><th>Keterangan</th><th>KM</th></tr></thead><tbody>{previewRows.map((row) => <tr data-excel-row={row.excelRow} key={row.excelRow}><td>{row.excelRow}</td><td>{row.nomor_polisi || '-'}</td><td>{row.tanggal || '-'}</td><td>{row.jenis}</td><td>{row.keluhan || '-'}</td><td>{row.kilometer ?? '-'}</td></tr>)}</tbody></table></div></div>
      </>}
      <div className="dpt-actions"><button type="button" className="dpt-button" onClick={onClose} disabled={saving}>Batal</button><button type="button" className="dpt-button primary" onClick={start} disabled={!selected || saving || !canImport}>{saving ? 'Mengimport…' : 'Import Pengajuan'}</button></div>
    </section>
  </div>
}
