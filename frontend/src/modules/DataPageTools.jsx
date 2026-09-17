import { useEffect, useState } from 'react'
import UnifiedExcelImportModalSafe from './UnifiedExcelImportModalSafe.jsx'
import VehicleExcelImportFinal from './VehicleExcelImportFinal.jsx'
import EditableServiceExcelImportModal from './EditableServiceExcelImportModal.jsx'
import VehicleDocumentsImportModal from './VehicleDocumentsImportModal.jsx'
import PengajuanExcelImportModal from './PengajuanExcelImportModal.jsx'
import RentalHistoryImportModalV2 from './RentalHistoryImportModalV2.jsx'
import './DataPageTools.css'

const CONTEXT_LABEL = { kendaraan: 'Kendaraan', pengajuan: 'Pengajuan Service', service: 'Service & Perbaikan', sewa: 'Kendaraan Sewa', dokumen: 'Dokumen Kendaraan' }
const DATA_TABLE_SELECTOR = {
  kendaraan: '.mep-table',
  pengajuan: '.request-table',
  service: '.x-table',
  sewa: '.x-table',
  dokumen: '.x-table',
}
const ROW_MARKS = {
  NONE: { label: 'Belum ditandai', className: '' },
  TODO: { label: 'Perlu dikerjakan', className: 'dpt-row-mark-todo' },
  PROCESS: { label: 'Sedang dikerjakan', className: 'dpt-row-mark-process' },
  DONE: { label: 'Sudah selesai', className: 'dpt-row-mark-done' },
  CHECKED: { label: 'Sudah dicek', className: 'dpt-row-mark-checked' },
}
const ROW_MARK_STORAGE = 'transport_excel_row_marks_v2'
const hasReport = value => value && typeof value === 'object' && value.context

function readRowMarks() {
  try {
    const raw = localStorage.getItem(ROW_MARK_STORAGE)
    const value = raw ? JSON.parse(raw) : {}
    return value && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}
function writeRowMarks(value) {
  try { localStorage.setItem(ROW_MARK_STORAGE, JSON.stringify(value)); return true } catch { return false }
}
function simpleHash(value) { let hash = 2166136261; for (let i = 0; i < value.length; i += 1) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619) } return (hash >>> 0).toString(16) }
function rowKey(context, row) { const cells = Array.from(row.children).filter(cell => !cell.classList.contains('dpt-row-mark-cell')); const values = cells.map(cell => { const control = cell.querySelector('input,select,textarea'); return control ? `${control.tagName}:${control.defaultValue || control.value}` : cell.textContent.trim() }); return `${context}:${simpleHash(values.join('\u241f') || `row-${row.rowIndex}`)}` }
function applyMark(row, mark) { Object.values(ROW_MARKS).forEach(item => { if (item.className) row.classList.remove(item.className) }); if (ROW_MARKS[mark]?.className) row.classList.add(ROW_MARKS[mark].className) }
function createRowMarkToolbar() { const toolbar = document.createElement('div'); toolbar.className = 'dpt-row-mark-toolbar'; toolbar.innerHTML = '<div class="dpt-row-mark-title"><b>Penanda kerja</b><span>Tandai status tiap baris.</span></div><div class="dpt-row-mark-controls"><label>Filter <select class="dpt-row-mark-filter"><option value="ALL">Semua</option><option value="NONE">Belum ditandai</option><option value="TODO">Perlu dikerjakan</option><option value="PROCESS">Sedang dikerjakan</option><option value="DONE">Sudah selesai</option><option value="CHECKED">Sudah dicek</option></select></label><button type="button" class="dpt-row-mark-clear">Hapus semua tanda</button></div>'; return toolbar }
function ensureTableMarks(context, table, scope) {
  if (!table || table.dataset.dptRowMarksReady === '1') return
  const marks = readRowMarks()
  table.dataset.dptRowMarksReady = '1'
  let toolbar = scope.querySelector('.dpt-row-mark-toolbar')
  if (!toolbar) {
    toolbar = createRowMarkToolbar()
    const tableHost = table.closest('.x-table-wrap, .request-table-wrap, .dpt-preview') || table.parentElement
    tableHost?.parentElement?.insertBefore(toolbar, tableHost)
  }
  const header = table.querySelector('thead tr')
  if (header && !header.querySelector('.dpt-row-mark-head')) { const th = document.createElement('th'); th.className = 'dpt-row-mark-head'; th.textContent = 'Tanda'; header.insertBefore(th, header.firstChild) }
  table.querySelectorAll('tbody tr').forEach(row => {
    if (row.querySelector('.dpt-row-mark-cell') || row.querySelector('td[colspan]')) return
    const key = rowKey(context, row); row.dataset.dptRowMarkKey = key
    const td = document.createElement('td'); td.className = 'dpt-row-mark-cell'
    const select = document.createElement('select'); select.className = 'dpt-row-mark-select'
    Object.entries(ROW_MARKS).forEach(([value, item]) => { const option = document.createElement('option'); option.value = value; option.textContent = item.label; select.appendChild(option) })
    const current = marks[key] || 'NONE'; select.value = current; applyMark(row, current)
    select.addEventListener('change', () => { const latest = readRowMarks(); if (select.value === 'NONE') delete latest[key]; else latest[key] = select.value; writeRowMarks(latest); applyMark(row, select.value) })
    td.appendChild(select); row.insertBefore(td, row.firstChild)
  })
  const filter = toolbar.querySelector('.dpt-row-mark-filter')
  if (filter && !filter.dataset.bound) { filter.dataset.bound = '1'; filter.addEventListener('change', () => { const latest = readRowMarks(); table.querySelectorAll('tbody tr').forEach(row => { const key = row.dataset.dptRowMarkKey; const value = filter.value; row.style.display = value === 'ALL' || (latest[key] || 'NONE') === value ? '' : 'none' }) }) }
  const clear = toolbar.querySelector('.dpt-row-mark-clear')
  if (clear && !clear.dataset.bound) { clear.dataset.bound = '1'; clear.addEventListener('click', () => { const latest = readRowMarks(); table.querySelectorAll('tbody tr').forEach(row => { const key = row.dataset.dptRowMarkKey; if (key) delete latest[key]; const select = row.querySelector('.dpt-row-mark-select'); if (select) select.value = 'NONE'; row.style.display = ''; applyMark(row, 'NONE') }); writeRowMarks(latest); if (filter) filter.value = 'ALL' }) }
}
function ensureRowMarks(context) {
  const previewTables = Array.from(document.querySelectorAll('.dpt-preview table')).map(table => ({ table, scope: table.closest('.dpt-preview') || document.body }))
  const selector = DATA_TABLE_SELECTOR[context]
  const dataTables = selector ? Array.from(document.querySelectorAll(selector)).filter(table => !table.closest('.dpt-preview') && !table.matches('.m-table') && !table.hasAttribute('data-no-row-marks')).map(table => ({ table, scope: table.closest('.x-card, .request-panel, .master-excel-page') || table.parentElement || document.body })) : []
  ;[...previewTables, ...dataTables].forEach(({ table, scope }) => ensureTableMarks(context, table, scope))
}

export default function DataPageTools({ context, profile, onExport }) {
  const [showImport, setShowImport] = useState(false)
  const [importReport, setImportReport] = useState(null)
  const [exporting, setExporting] = useState(false)
  const canImport = ['ADMIN', 'TRANSPORT'].includes(profile?.role)

  useEffect(() => {
    try { const saved = sessionStorage.getItem('transport_import_report'); if (saved) { const parsed = JSON.parse(saved); if (hasReport(parsed) && parsed.context === context) setImportReport(parsed); sessionStorage.removeItem('transport_import_report') } }
    catch { sessionStorage.removeItem('transport_import_report') }
  }, [context])

  useEffect(() => {
    let timer
    const run = () => ensureRowMarks(context)
    run()
    const observer = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(run, 40) })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => { clearTimeout(timer); observer.disconnect() }
  }, [context])

  if (!CONTEXT_LABEL[context]) return null
  const doExport = async () => { if (!onExport || exporting) return; setExporting(true); try { await onExport() } finally { setExporting(false) } }
  const closeImport = () => setShowImport(false)
  const finishImport = report => { setShowImport(false); if (hasReport(report)) setImportReport(report) }
  const refreshAfterImport = () => { setImportReport(null); window.location.reload() }
  const modal = showImport && (context === 'kendaraan' ? <VehicleExcelImportFinal profile={profile} onClose={closeImport} onDone={finishImport} /> : context === 'pengajuan' ? <PengajuanExcelImportModal profile={profile} onClose={closeImport} onDone={finishImport} /> : context === 'service' ? <EditableServiceExcelImportModal profile={profile} onClose={closeImport} onDone={finishImport} /> : context === 'dokumen' ? <VehicleDocumentsImportModal profile={profile} onClose={closeImport} onDone={finishImport} /> : context === 'sewa' ? <RentalHistoryImportModalV2 profile={profile} onClose={closeImport} onDone={finishImport} /> : <UnifiedExcelImportModalSafe context={context} profile={profile} onClose={closeImport} onDone={finishImport} />)

  return <>
    {modal}
    {importReport && <div className="dpt-overlay" role="dialog" aria-modal="true"><section className="dpt-modal import-result-modal"><header className="dpt-modal-head"><div><span className="eyebrow">IMPORT SELESAI</span><h3>Rekonsiliasi Data {CONTEXT_LABEL[importReport.context] || 'Excel'}</h3><p>Perbedaan jumlah antara Excel dan data sistem dijelaskan di sini.</p></div><button type="button" className="dpt-icon" onClick={() => setImportReport(null)}>×</button></header><div className="service-import-stats"><div><b>{importReport.sourceRows ?? 0}</b><span>baris sumber</span></div><div><b>{importReport.validRows ?? importReport.sourceRows ?? 0}</b><span>baris valid</span></div><div><b>{importReport.uniqueVehicles ?? importReport.imported ?? 0}</b><span>data unik</span></div><div><b>{importReport.mergedDuplicates ?? importReport.skipped ?? 0}</b><span>duplikat/skip</span></div></div><div className="vehicle-import-explanation"><b>Hasil penyimpanan</b>{importReport.added != null && <span>Data baru: <strong>{importReport.added}</strong></span>}{importReport.updated != null && <span>Data diperbarui: <strong>{importReport.updated}</strong></span>}{importReport.driversCreated != null && <span>Driver dibuat: <strong>{importReport.driversCreated}</strong></span>}</div>{importReport.message && <div className="vehicle-import-note"><b>Detail hasil import</b><span>{importReport.message}</span></div>}<div className="dpt-actions"><button type="button" className="dpt-button" onClick={() => setImportReport(null)}>Tutup</button><button type="button" className="dpt-button primary" onClick={refreshAfterImport}>Refresh Data Sistem</button></div></section></div>}
    <div className="dpt-toolbar"><div><span className="eyebrow">DATA</span><b>{CONTEXT_LABEL[context]}</b></div><div className="dpt-toolbar-actions">{canImport && <button className="dpt-button secondary" type="button" onClick={() => setShowImport(true)}>⇧ Import Excel</button>}<button className="dpt-button primary" type="button" onClick={doExport} disabled={exporting}>{exporting ? 'Exporting…' : '⇩ Export Excel'}</button></div></div>
  </>
}
