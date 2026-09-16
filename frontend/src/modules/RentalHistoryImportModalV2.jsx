import { useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { clearDeletedExcelRows, filterDeletedExcelRows } from '../utils/excelPreviewControls.js'
import { parseXlsx } from '../utils/xlsxParser.js'
import './DataPageTools.css'

const MAX_FILE_SIZE = 25 * 1024 * 1024
const PAGE_OPTIONS = [25, 50, 100]
const MONTHS = {
  januari: 1, january: 1, februari: 2, february: 2, maret: 3, march: 3,
  april: 4, mei: 5, may: 5, juni: 6, june: 6, juli: 7, july: 7,
  agustus: 8, august: 8, september: 9, oktober: 10, october: 10,
  november: 11, desember: 12, december: 12,
}
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim()
const norm = value => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
const upper = value => clean(value).toUpperCase()

function findHeader(sheet) {
  let best = { index: -1, row: [], score: -1 }
  sheet.rows.slice(0, 40).forEach((item, idx) => {
    const score = item.values.filter(Boolean).map(norm).filter(Boolean).length
    if (score > best.score) best = { index: idx, row: item.values, score }
  })
  return best
}

function valueOf(row, headers, aliases) {
  const index = headers.findIndex(header => aliases.includes(norm(header)))
  return index >= 0 ? clean(row.values[index]) : ''
}

function numberValue(value) {
  const v = clean(value).replace(/Rp\.?/ig, '')
  if (!v) return null
  if (/^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(v)) return Number(v.replace(/\./g, '').replace(',', '.'))
  const n = Number(v.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

function monthDate(year, monthName) {
  const month = MONTHS[norm(monthName)]
  const y = Number(String(year).replace(/\D/g, ''))
  return month && y >= 2000 && y <= 2100 ? `${y}-${String(month).padStart(2, '0')}-01` : null
}

function monthDiff(start, target) {
  const a = new Date(`${start}T00:00:00`)
  const b = new Date(`${target}T00:00:00`)
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth())
}

function parseRows(sheet) {
  const header = findHeader(sheet)
  if (header.index < 0) throw new Error('Header SUMMERY RENTAL tidak ditemukan.')
  return {
    header,
    rows: sheet.rows.slice(header.index + 1)
      .filter(row => row.values.some(value => clean(value)))
      .map(row => ({
        id: `${row.excelRow}`,
        excelRow: row.excelRow,
        tahun: valueOf(row, header.row, ['Tahun', 'Year']),
        supplier: valueOf(row, header.row, ['Supplier', 'Pemilik', 'Nama Supplier']),
        uraian: valueOf(row, header.row, ['Uraian', 'Keterangan', 'Deskripsi']),
        periode: valueOf(row, header.row, ['Periode Tagihan', 'Periode', 'Bulan']),
        nilai_invoice: valueOf(row, header.row, ['Nilai Invoice', 'Nilai Invoice (Rp)', 'Invoice', 'Nilai']),
      }))
  }
}

async function importSummary(rows, profile) {
  const ownersRes = await supabase.from('pemilik_sewa').select('id,nama_pemilik,nama_perusahaan')
  const contractsRes = await supabase.from('kontrak_sewa').select('id,pemilik_sewa_id,kendaraan_id,tanggal_mulai,tanggal_selesai,periode_bulan,nilai_sewa_bulanan')
  const existingRes = await supabase.from('pembayaran_sewa').select('id,kontrak_sewa_id,bulan_pembayaran')
  if (ownersRes.error) throw new Error(`Tidak bisa membaca pemilik rental: ${ownersRes.error.message}`)
  if (contractsRes.error) throw new Error(`Tidak bisa membaca kontrak rental: ${contractsRes.error.message}`)
  if (existingRes.error) throw new Error(`Tidak bisa membaca pembayaran rental: ${existingRes.error.message}`)

  const owners = ownersRes.data || []
  const contracts = contractsRes.data || []
  const existing = new Set((existingRes.data || []).map(item => `${item.kontrak_sewa_id}|${item.bulan_pembayaran}`))
  let imported = 0
  let duplicate = 0
  const skipped = []
  const payloads = []

  for (const row of rows) {
    const payMonth = monthDate(row.tahun, row.periode)
    const invoice = numberValue(row.nilai_invoice)
    if (!row.tahun || !row.supplier || !row.periode || !payMonth || invoice == null || invoice <= 0) {
      skipped.push(`Baris ${row.excelRow}: Tahun/Supplier/Periode/Nilai Invoice tidak lengkap atau tidak valid`)
      continue
    }
    const supplierKey = upper(row.supplier)
    const matchingOwners = owners.filter(owner => upper(owner.nama_pemilik) === supplierKey || upper(owner.nama_perusahaan || '') === supplierKey)
    if (matchingOwners.length !== 1) {
      skipped.push(`Baris ${row.excelRow}: Supplier “${row.supplier}” tidak cocok tepat ke satu pemilik rental`)
      continue
    }
    const ownerId = matchingOwners[0].id
    const matchingContracts = contracts.filter(contract => Number(contract.pemilik_sewa_id) === Number(ownerId) && contract.tanggal_mulai <= payMonth && contract.tanggal_selesai >= payMonth)
    if (matchingContracts.length !== 1) {
      skipped.push(`Baris ${row.excelRow}: Supplier “${row.supplier}” memiliki ${matchingContracts.length} kontrak yang cocok untuk ${payMonth.slice(0, 7)}`)
      continue
    }
    const contract = matchingContracts[0]
    const periodNo = monthDiff(contract.tanggal_mulai, payMonth) + 1
    if (periodNo < 1 || periodNo > 6) {
      skipped.push(`Baris ${row.excelRow}: ${row.supplier} berada di luar periode kontrak 1–6`)
      continue
    }
    const key = `${contract.id}|${payMonth}`
    if (existing.has(key)) {
      duplicate += 1
      continue
    }
    existing.add(key)
    payloads.push({
      kontrak_sewa_id: contract.id,
      periode_ke: periodNo,
      bulan_pembayaran: payMonth,
      tanggal_jatuh_tempo: null,
      tanggal_pembayaran: null,
      jumlah_tagihan: invoice,
      jumlah_dibayar: 0,
      status: 'BELUM_LUNAS',
      metode_pembayaran: null,
      nomor_referensi: null,
      bukti_pembayaran_path: null,
      catatan: `Import SUMMERY RENTAL ${row.tahun} • ${row.periode} • ${row.supplier} • ${row.uraian}`,
      diproses_oleh: profile?.id || null,
    })
  }

  if (payloads.length) {
    const result = await supabase.from('pembayaran_sewa').insert(payloads)
    if (result.error) throw new Error(`Gagal menyimpan pembayaran rental historis: ${result.error.message}`)
    imported = payloads.length
  }
  return { imported, duplicate, skipped, message: `${imported} pembayaran historis ditambahkan, ${duplicate} sudah ada, ${skipped.length} perlu verifikasi. Sistem tidak mengubah kontrak.` }
}

export default function RentalHistoryImportModalV2({ profile, onClose, onDone }) {
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [rows, setRows] = useState([])
  const [sheetName, setSheetName] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const canImport = ['ADMIN', 'TRANSPORT'].includes(profile?.role)

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const pageRows = useMemo(() => rows.slice((page - 1) * pageSize, page * pageSize), [rows, page, pageSize])

  const updateRow = (id, field, value) => {
    setRows(current => current.map(row => row.id === id ? { ...row, [field]: value } : row))
  }

  const scan = async nextFile => {
    clearDeletedExcelRows('sewa')
    setFile(nextFile || null)
    setRows([])
    setSheetName('')
    setError('')
    setMessage('')
    setPage(1)
    if (!nextFile) return
    if (!/\.xlsx$/i.test(nextFile.name)) return setError('Gunakan file Excel .xlsx.')
    if (nextFile.size > MAX_FILE_SIZE) return setError('Ukuran file maksimal 25 MB.')
    setLoading(true)
    try {
      const sheets = await parseXlsx(nextFile)
      const chosen = sheets.find(sheet => norm(sheet.name) === 'summery_rental') || sheets.find(sheet => norm(sheet.name).includes('summery_rental'))
      if (!chosen) throw new Error('Sheet SUMMERY RENTAL tidak ditemukan di workbook.')
      const parsed = parseRows(chosen)
      setRows(parsed.rows)
      setSheetName(chosen.name)
      setMessage(`Sheet “${chosen.name}” terdeteksi • ${parsed.rows.length} baris sumber. Semua baris dimuat; tabel dibagi per halaman agar tetap ringan.`)
    } catch (e) {
      setError(e.message || 'File Excel tidak dapat dibaca.')
    } finally {
      setLoading(false)
    }
  }

  const start = async () => {
    if (!rows.length || !canImport || saving) return
    setSaving(true)
    setError('')
    setMessage('Memproses pembayaran rental historis...')
    try {
      const activeRows = filterDeletedExcelRows('sewa', rows)
      const result = await importSummary(activeRows, profile)
      const report = {
        context: 'sewa',
        sourceRows: rows.length,
        validRows: result.imported + result.duplicate,
        imported: result.imported,
        skipped: result.skipped.length,
        duplicate: result.duplicate,
        message: result.message,
        fileName: file?.name || '',
        completedAt: new Date().toISOString(),
      }
      sessionStorage.setItem('transport_import_report', JSON.stringify(report))
      onDone?.(report)
      setMessage(result.message)
      if (result.skipped.length) setError(`Perlu verifikasi ${result.skipped.length} baris. Contoh: ${result.skipped.slice(0, 3).join(' | ')}`)
    } catch (e) {
      setError(e.message || 'Import pembayaran rental gagal.')
      setMessage('')
    } finally {
      setSaving(false)
    }
  }

  return <div className="dpt-overlay" role="dialog" aria-modal="true" aria-label="Import Pembayaran Rental Historis">
    <section className="dpt-modal">
      <header className="dpt-modal-head">
        <div>
          <span className="eyebrow">IMPORT EXCEL RENTAL</span>
          <h3>Import SUMMERY RENTAL</h3>
          <p>Format mengikuti workbook lama: Tahun, Supplier, Uraian, Periode Tagihan, dan Nilai Invoice. Data dapat dikoreksi langsung sebelum import.</p>
        </div>
        <button type="button" className="dpt-icon" onClick={onClose}>×</button>
      </header>
      {error && <div className="dpt-alert error">{error}</div>}
      {message && <div className="dpt-alert success">{message}</div>}
      <div className="dpt-upload">
        <input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={event => scan(event.target.files?.[0])} />
        <button type="button" className="dpt-upload-button" onClick={() => inputRef.current?.click()} disabled={loading || saving}>{loading ? 'Membaca Excel…' : file ? 'Ganti File' : 'Pilih File Excel'}</button>
        <div className="dpt-file-meta"><strong title={file?.name}>{file?.name || 'Belum ada file'}</strong><span>{file ? `✓ .xlsx • ${(file.size / 1024 / 1024).toFixed(2)} MB` : 'Maksimal 25 MB'}</span></div>
      </div>
      {rows.length > 0 && <>
        <div className="dpt-selection"><div><b>Sheet: {sheetName}</b><span>Format pembayaran historis</span></div><span>{rows.length} baris data</span></div>
        <div className="dpt-preview">
          <div className="dpt-sheet-title"><div><b>Preview Data Rental</b><span className="dpt-preview-note">Semua baris tersedia. Edit sebelum import bila ada koreksi.</span></div><span>{pageRows.length} dari {rows.length} ditampilkan</span></div>
          <div className="dpt-preview-wrap">
            <table>
              <thead><tr><th>Baris</th><th>Tahun</th><th>Supplier</th><th>Uraian</th><th>Periode Tagihan</th><th>Nilai Invoice</th></tr></thead>
              <tbody>
                {pageRows.map(row => <tr data-excel-row={row.excelRow} key={row.id}>
                  <td>{row.excelRow}</td>
                  <td><input className="dpt-editable-input" value={row.tahun} onChange={e => updateRow(row.id, 'tahun', e.target.value)} /></td>
                  <td><input className="dpt-editable-input" value={row.supplier} onChange={e => updateRow(row.id, 'supplier', e.target.value)} /></td>
                  <td><input className="dpt-editable-input" value={row.uraian} onChange={e => updateRow(row.id, 'uraian', e.target.value)} /></td>
                  <td><input className="dpt-editable-input" value={row.periode} onChange={e => updateRow(row.id, 'periode', e.target.value)} /></td>
                  <td><input className="dpt-editable-input" value={row.nilai_invoice} onChange={e => updateRow(row.id, 'nilai_invoice', e.target.value)} inputMode="decimal" /></td>
                </tr>)}
              </tbody>
            </table>
          </div>
          <div className="dpt-pagination"><label>Baris/halaman <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}>{PAGE_OPTIONS.map(size => <option key={size} value={size}>{size}</option>)}</select></label><button type="button" className="dpt-button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>‹</button><span>Halaman {page} / {pageCount}</span><button type="button" className="dpt-button" onClick={() => setPage(p => Math.min(pageCount, p + 1))} disabled={page >= pageCount}>›</button></div>
        </div>
      </>}
      <div className="dpt-actions"><button type="button" className="dpt-button" onClick={onClose} disabled={saving}>Batal</button><button type="button" className="dpt-button primary" onClick={start} disabled={!rows.length || saving || !canImport}>{saving ? 'Mengimport…' : `Import ${rows.length || ''} Baris`}</button></div>
    </section>
  </div>
}
