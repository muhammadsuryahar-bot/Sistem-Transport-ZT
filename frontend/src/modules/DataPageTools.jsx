import { useEffect, useState } from 'react'
import UnifiedExcelImportModalSafe from './UnifiedExcelImportModalSafe.jsx'
import VehicleExcelImportModal from './VehicleExcelImportModal.jsx'
import EditableServiceExcelImportModal from './EditableServiceExcelImportModal.jsx'
import VehicleDocumentsImportModal from './VehicleDocumentsImportModal.jsx'
import PengajuanExcelImportModal from './PengajuanExcelImportModal.jsx'
import RentalHistoryImportModal from './RentalHistoryImportModal.jsx'
import './DataPageTools.css'

const CONTEXT_LABEL = {
  kendaraan: 'Kendaraan',
  pengajuan: 'Pengajuan Service',
  service: 'Service & Perbaikan',
  sewa: 'Kendaraan Sewa',
  dokumen: 'Dokumen Kendaraan',
}

const ROW_MARKS = {
  NONE: { label: 'Belum ditandai', className: '' },
  TODO: { label: 'Perlu dikerjakan', className: 'dpt-row-mark-todo' },
  PROCESS: { label: 'Sedang dikerjakan', className: 'dpt-row-mark-process' },
  DONE: { label: 'Sudah selesai', className: 'dpt-row-mark-done' },
  CHECKED: { label: 'Sudah dicek', className: 'dpt-row-mark-checked' },
}

const ROW_MARK_STORAGE = 'transport_excel_row_marks_v2'

const hasReport = (value) => value && typeof value === 'object' && value.context

function normalizeImportPreviewTables() {
  const tables = document.querySelectorAll('.dpt-preview table')
  tables.forEach((table) => {
    const headers = Array.from(table.querySelectorAll('thead th')).map((cell) => cell.textContent.trim().toLowerCase())
    table.querySelectorAll('tbody tr').forEach((row) => {
      Array.from(row.children).forEach((cell, index) => {
        const raw = cell.textContent.trim()
        if (!raw) return
        const header = headers[index] || ''
        if (/tanggal|tgl|date/.test(header)) {
          const serial = Number(raw)
          if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
            const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000)
            if (!Number.isNaN(date.getTime())) {
              cell.textContent = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
              return
            }
          }
        }
        if (/^-?\d+\.0+$/.test(raw) && !cell.querySelector('input,select,textarea')) cell.textContent = raw.replace(/\.0+$/, '')
      })
    })
  })
}

function readRowMarks() {
  try {
    const raw = localStorage.getItem(ROW_MARK_STORAGE)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeRowMarks(marks) {
  try { localStorage.setItem(ROW_MARK_STORAGE, JSON.stringify(marks)) } catch { /* localStorage may be unavailable */ }
}

function simpleHash(value) {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

function getRowKey(context, row) {
  const cells = Array.from(row.children).filter((cell) => !cell.classList.contains('dpt-row-mark-cell'))
  const text = cells.map((cell) => cell.textContent.trim()).join('\u241f')
  return `${context}:${simpleHash(text || `row-${row.rowIndex}`)}`
}

function applyRowMark(row, mark) {
  Object.values(ROW_MARKS).forEach((item) => { if (item.className) row.classList.remove(item.className) })
  const className = ROW_MARKS[mark]?.className
  if (className) row.classList.add(className)
}

function ensureRowMarkControls(context) {
  const tables = document.querySelectorAll('.dpt-preview table')
  const marks = readRowMarks()

  tables.forEach((table) => {
    const preview = table.closest('.dpt-preview')
    if (!preview) return

    let toolbar = preview.querySelector('.dpt-row-mark-toolbar')
    if (!toolbar) {
      toolbar = document.createElement('div')
      toolbar.className = 'dpt-row-mark-toolbar'
      toolbar.innerHTML = `
        <div class="dpt-row-mark-title"><b>Penanda kerja</b><span>Berikan status per baris supaya tim Transport cepat mengetahui pekerjaan yang sudah dikerjakan.</span></div>
        <div class="dpt-row-mark-controls">
          <label>Filter
            <select class="dpt-row-mark-filter">
              <option value="ALL">Semua</option>
              <option value="NONE">Belum ditandai</option>
              <option value="TODO">Perlu dikerjakan</option>
              <option value="PROCESS">Sedang dikerjakan</option>
              <option value="DONE">Sudah selesai</option>
              <option value="CHECKED">Sudah dicek</option>
            </select>
          </label>
          <button type="button" class="dpt-row-mark-clear">Hapus semua tanda</button>
        </div>`
      table.parentElement?.parentElement?.insertBefore(toolbar, table.parentElement)
    }

    const filter = toolbar.querySelector('.dpt-row-mark-filter')
    const rows = Array.from(table.querySelectorAll('tbody tr'))
    const headerRow = table.querySelector('thead tr')
    if (headerRow && !headerRow.querySelector('.dpt-row-mark-head')) {
      const th = document.createElement('th')
      th.className = 'dpt-row-mark-head'
      th.textContent = 'Tanda'
      headerRow.insertBefore(th, headerRow.firstChild)
    }

    rows.forEach((row) => {
      if (row.querySelector('.dpt-row-mark-cell')) return
      const key = getRowKey(context, row)
      row.dataset.dptRowMarkKey = key
      const cell = document.createElement('td')
      cell.className = 'dpt-row-mark-cell'
      const select = document.createElement('select')
      select.className = 'dpt-row-mark-select'
      Object.entries(ROW_MARKS).forEach(([value, item]) => {
        const option = document.createElement('option')
        option.value = value
        option.textContent = item.label
        select.appendChild(option)
      })
      const current = marks[key] || 'NONE'
      select.value = current
      applyRowMark(row, current)
      select.addEventListener('change', () => {
        const nextMarks = readRowMarks()
        if (select.value === 'NONE') delete nextMarks[key]
        else nextMarks[key] = select.value
        writeRowMarks(nextMarks)
        applyRowMark(row, select.value)
      })
      cell.appendChild(select)
      row.insertBefore(cell, row.firstChild)
    })

    if (filter && !filter.dataset.bound) {
      filter.dataset.bound = '1'
      filter.addEventListener('change', () => {
        const value = filter.value
        table.querySelectorAll('tbody tr').forEach((row) => {
          const key = row.dataset.dptRowMarkKey
          const current = marks[key] || 'NONE'
          row.style.display = value === 'ALL' || current === value ? '' : 'none'
        })
      })
    }

    const clear = toolbar.querySelector('.dpt-row-mark-clear')
    if (clear && !clear.dataset.bound) {
      clear.dataset.bound = '1'
      clear.addEventListener('click', () => {
        const nextMarks = readRowMarks()
        rows.forEach((row) => {
          const key = row.dataset.dptRowMarkKey
          if (key) delete nextMarks[key]
          const select = row.querySelector('.dpt-row-mark-select')
          if (select) select.value = 'NONE'
          row.style.display = ''
          applyRowMark(row, 'NONE')
        })
        writeRowMarks(nextMarks)
        if (filter) filter.value = 'ALL'
      })
    }
  })
}

export default function DataPageTools({ context, profile, onExport }) {
  const [showImport, setShowImport] = useState(false)
  const [importReport, setImportReport] = useState(null)
  const [exporting, setExporting] = useState(false)
  const canImport = ['ADMIN', 'TRANSPORT'].includes(profile?.role)

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('transport_import_report')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (hasReport(parsed) && parsed.context === context) setImportReport(parsed)
        sessionStorage.removeItem('transport_import_report')
      }
    } catch {
      sessionStorage.removeItem('transport_import_report')
    }
  }, [context])

  useEffect(() => {
    let timer = null
    const run = () => {
      normalizeImportPreviewTables()
      if (showImport) ensureRowMarkControls(context)
    }
    run()
    const observer = new MutationObserver(() => {
      window.clearTimeout(timer)
      timer = window.setTimeout(run, 40)
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      window.clearTimeout(timer)
      observer.disconnect()
    }
  }, [context, showImport])

  if (!CONTEXT_LABEL[context]) return null

  const doExport = async () => {
    if (!onExport || exporting) return
    setExporting(true)
    try { await onExport() } finally { setExporting(false) }
  }

  const closeImport = () => setShowImport(false)
  const finishImport = (report) => { setShowImport(false); if (hasReport(report)) setImportReport(report) }
  const refreshAfterImport = () => { setImportReport(null); window.location.reload() }
  const closeReport = () => setImportReport(null)

  return <>
    {showImport && (context === 'kendaraan'
      ? <VehicleExcelImportModal profile={profile} onClose={closeImport} onDone={finishImport} />
      : context === 'pengajuan'
        ? <PengajuanExcelImportModal profile={profile} onClose={closeImport} onDone={finishImport} />
        : context === 'service'
          ? <EditableServiceExcelImportModal profile={profile} onClose={closeImport} onDone={finishImport} />
          : context === 'dokumen'
            ? <VehicleDocumentsImportModal profile={profile} onClose={closeImport} onDone={finishImport} />
            : context === 'sewa'
              ? <RentalHistoryImportModal profile={profile} onClose={closeImport} onDone={finishImport} />
              : <UnifiedExcelImportModalSafe context={context} profile={profile} onClose={closeImport} onDone={finishImport} />
    )}

    {importReport && <div className="dpt-overlay" role="dialog" aria-modal="true" aria-label="Laporan hasil import">
      <section className="dpt-modal import-result-modal">
        <header className="dpt-modal-head">
          <div>
            <span className="eyebrow">IMPORT SELESAI</span>
            <h3>Rekonsiliasi Data {CONTEXT_LABEL[importReport.context] || 'Excel'}</h3>
            <p>Perbedaan jumlah antara Excel dan data sistem dijelaskan di sini supaya Admin dapat memastikan tidak ada data yang hilang tanpa alasan.</p>
          </div>
          <button type="button" className="dpt-icon" onClick={closeReport}>×</button>
        </header>
        <div className="service-import-stats">
          <div><b>{importReport.sourceRows ?? 0}</b><span>baris sumber</span></div>
          <div><b>{importReport.validRows ?? importReport.sourceRows ?? 0}</b><span>baris valid</span></div>
          <div><b>{importReport.uniqueVehicles ?? importReport.transactions ?? importReport.imported ?? 0}</b><span>data unik</span></div>
          <div><b>{importReport.mergedDuplicates ?? importReport.skipped ?? 0}</b><span>duplikat/skip</span></div>
        </div>
        <div className="vehicle-import-explanation">
          <b>Hasil penyimpanan</b>
          {importReport.added != null && <span>Data baru: <strong>{importReport.added}</strong></span>}
          {importReport.updated != null && <span>Data diperbarui: <strong>{importReport.updated}</strong></span>}
          {importReport.driversCreated != null && <span>Driver dibuat: <strong>{importReport.driversCreated}</strong></span>}
          {importReport.items != null && <span>Item detail tersimpan: <strong>{importReport.items}</strong></span>}
          {importReport.kmUpdated != null && <span>KM kendaraan diperbarui: <strong>{importReport.kmUpdated}</strong></span>}
          {importReport.unknownPlates?.length > 0 && <span>Plat belum ada di Master Kendaraan: <strong>{importReport.unknownPlates.length}</strong></span>}
        </div>
        {importReport.message && <div className="vehicle-import-note"><b>Detail hasil import</b><span>{importReport.message}</span></div>}
        {importReport.context === 'kendaraan' && <div className="vehicle-import-note"><b>Catatan rekonsiliasi kendaraan</b><span>Excel menghitung baris sumber, sedangkan Master Kendaraan menggunakan No. Polisi sebagai identitas unik.</span><span>Baris dengan No. Polisi yang sama dapat diperbarui, bukan dibuat sebagai kendaraan baru kedua.</span></div>}
        {importReport.missingSourceNumbers?.length > 0 && <div className="vehicle-import-warning">Nomor urut sumber yang tidak ditemukan: <b>{importReport.missingSourceNumbers.join(', ')}</b>.</div>}
        {importReport.unknownPlates?.length > 0 && <div className="vehicle-import-warning">Plat belum ada di Master Kendaraan: <b>{importReport.unknownPlates.slice(0, 20).join(', ')}</b>{importReport.unknownPlates.length > 20 ? ' …' : ''}</div>}
        <div className="dpt-actions"><button type="button" className="dpt-button" onClick={closeReport}>Tutup</button><button type="button" className="dpt-button primary" onClick={refreshAfterImport}>Refresh Data Sistem</button></div>
      </section>
    </div>}

    <div className="dpt-toolbar">
      <div><span className="eyebrow">DATA</span><b>{CONTEXT_LABEL[context]}</b></div>
      <div className="dpt-toolbar-actions">
        {canImport && <button className="dpt-button secondary" type="button" onClick={() => setShowImport(true)}>⇧ Import Excel</button>}
        <button className="dpt-button primary" type="button" onClick={doExport} disabled={exporting}>{exporting ? 'Exporting…' : '⇩ Export Excel'}</button>
      </div>
    </div>
  </>
}
