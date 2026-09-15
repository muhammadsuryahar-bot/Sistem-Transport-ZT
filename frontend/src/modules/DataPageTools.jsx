import { useEffect, useState } from 'react'
import UnifiedExcelImportModalSafe from './UnifiedExcelImportModalSafe.jsx'
import VehicleExcelImportModal from './VehicleExcelImportModal.jsx'
import ServiceHistoryImportModalSafe from './ServiceHistoryImportModalSafe.jsx'
import VehicleDocumentsImportModal from './VehicleDocumentsImportModal.jsx'
import './DataPageTools.css'

const CONTEXT_LABEL = {
  kendaraan: 'Kendaraan',
  pengajuan: 'Pengajuan Service',
  service: 'Service & Perbaikan',
  sewa: 'Kendaraan Sewa',
  dokumen: 'Dokumen Kendaraan',
}

const hasReport = (value) => value && typeof value === 'object' && value.context

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
      : context === 'service'
        ? <ServiceHistoryImportModalSafe profile={profile} onClose={closeImport} onDone={finishImport} />
        : context === 'dokumen'
          ? <VehicleDocumentsImportModal profile={profile} onClose={closeImport} onDone={finishImport} />
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

        {importReport.context === 'kendaraan' && <div className="vehicle-import-note">
          <b>Kenapa jumlah Excel dan Master bisa berbeda?</b>
          <span>Excel menghitung baris sumber, sedangkan Master Kendaraan menghitung No. Polisi unik.</span>
          <span>Baris dengan No. Polisi yang sama digabung menjadi satu kendaraan.</span>
          <span>Jadi angka yang lebih kecil pada Master tidak otomatis berarti data hilang.</span>
        </div>}

        {importReport.missingSourceNumbers?.length > 0 && <div className="vehicle-import-warning">
          Nomor urut sumber yang tidak ditemukan: <b>{importReport.missingSourceNumbers.join(', ')}</b>.
        </div>}

        {importReport.unknownPlates?.length > 0 && <div className="vehicle-import-warning">
          Plat belum ada di Master Kendaraan: <b>{importReport.unknownPlates.slice(0, 20).join(', ')}</b>{importReport.unknownPlates.length > 20 ? ' …' : ''}
        </div>}

        <div className="dpt-actions">
          <button type="button" className="dpt-button" onClick={closeReport}>Tutup</button>
          <button type="button" className="dpt-button primary" onClick={refreshAfterImport}>Refresh Data Sistem</button>
        </div>
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
