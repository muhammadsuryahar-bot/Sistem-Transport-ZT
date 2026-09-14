import { useState } from 'react'
import UnifiedExcelImportModal from './UnifiedExcelImportModal.jsx'
import VehicleExcelImportModal from './VehicleExcelImportModal.jsx'
import ServiceHistoryImportModal from './ServiceHistoryImportModal.jsx'
import VehicleDocumentsImportModal from './VehicleDocumentsImportModal.jsx'
import './DataPageTools.css'

const CONTEXT_LABEL = {
  kendaraan: 'Kendaraan',
  pengajuan: 'Pengajuan Service',
  service: 'Service & Perbaikan',
  sewa: 'Kendaraan Sewa',
  dokumen: 'Dokumen Kendaraan',
}

export default function DataPageTools({ context, profile, onExport }) {
  const [showImport, setShowImport] = useState(false)
  const [exporting, setExporting] = useState(false)
  const canImport = ['ADMIN', 'TRANSPORT'].includes(profile?.role)
  if (!CONTEXT_LABEL[context]) return null

  const doExport = async () => {
    if (!onExport || exporting) return
    setExporting(true)
    try { await onExport() } finally { setExporting(false) }
  }

  const closeImport = () => setShowImport(false)
  const finishImport = () => {
    setShowImport(false)
    window.setTimeout(() => window.location.reload(), 500)
  }

  return <>
    {showImport && (context === 'kendaraan'
      ? <VehicleExcelImportModal profile={profile} onClose={closeImport} onDone={finishImport} />
      : context === 'service'
        ? <ServiceHistoryImportModal profile={profile} onClose={closeImport} onDone={finishImport} />
        : context === 'dokumen'
          ? <VehicleDocumentsImportModal profile={profile} onClose={closeImport} onDone={finishImport} />
          : <UnifiedExcelImportModal context={context} profile={profile} onClose={closeImport} onDone={finishImport} />
    )}
    <div className="dpt-toolbar">
      <div><span className="eyebrow">DATA</span><b>{CONTEXT_LABEL[context]}</b></div>
      <div className="dpt-toolbar-actions">
        {canImport && <button className="dpt-button secondary" type="button" onClick={() => setShowImport(true)}>⇧ Import Excel</button>}
        <button className="dpt-button primary" type="button" onClick={doExport} disabled={exporting}>{exporting ? 'Exporting…' : '⇩ Export Excel'}</button>
      </div>
    </div>
  </>
}
