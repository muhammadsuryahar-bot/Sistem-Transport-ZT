import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const normalize = value => String(value ?? '').trim().toUpperCase()
const money = value => Number(value || 0).toLocaleString('id-ID')

export default function DataQualityPanel() {
  const [checks, setChecks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [vehicles, docs, requests, services, items, rental] = await Promise.all([
        supabase.from('kendaraan').select('id,nomor_polisi,kepemilikan,jenis_sewa,pemilik'),
        supabase.from('dokumen_kendaraan').select('id,kendaraan_id'),
        supabase.from('permintaan_service').select('id,kendaraan_id'),
        supabase.from('service').select('id,kendaraan_id,permintaan_service_id,nilai_dpp,ppn,total'),
        supabase.from('service_item').select('id,service_id,nama_item,kategori,satuan'),
        supabase.from('rental_historis_excel').select('id,source_sheet,excel_row'),
      ])
      const errors = [vehicles, docs, requests, services, items, rental].filter(result => result.error)
      if (errors.length) throw errors[0].error

      const vehicleRows = vehicles.data || []
      const vehicleIds = new Set(vehicleRows.map(row => row.id))
      const requestRows = requests.data || []
      const requestIds = new Set(requestRows.map(row => row.id))
      const serviceRows = services.data || []
      const serviceIds = new Set(serviceRows.map(row => row.id))
      const itemRows = items.data || []

      const duplicatePlateMap = new Map()
      vehicleRows.forEach(row => {
        const plate = normalize(row.nomor_polisi)
        if (!plate) return
        const current = duplicatePlateMap.get(plate) || []
        current.push(row)
        duplicatePlateMap.set(plate, current)
      })
      const duplicatePlates = [...duplicatePlateMap.entries()].filter(([, rows]) => rows.length > 1)

      const invalidOwnership = vehicleRows.filter(row => !['ASET', 'SEWA'].includes(normalize(row.kepemilikan)))
      const rentalMissingIdentity = vehicleRows.filter(row => normalize(row.kepemilikan) === 'SEWA' && (!String(row.pemilik || '').trim() || !['SEWA_PERORANGAN', 'SEWA_PERUSAHAAN'].includes(row.jenis_sewa)))
      const orphanDocs = (docs.data || []).filter(row => !vehicleIds.has(row.kendaraan_id))
      const orphanItems = itemRows.filter(row => !serviceIds.has(row.service_id))
      const orphanRequests = requestRows.filter(row => !vehicleIds.has(row.kendaraan_id))
      const orphanServices = serviceRows.filter(row => row.permintaan_service_id != null && !requestIds.has(row.permintaan_service_id))
      const financeMismatch = serviceRows.filter(row => {
        const dpp = Number(row.nilai_dpp || 0)
        const ppn = Number(row.ppn || 0)
        const total = Number(row.total ?? row.biaya_aktual ?? row.estimasi_biaya ?? 0)
        return Number.isFinite(dpp) && Number.isFinite(ppn) && Number.isFinite(total) && Math.abs((dpp + ppn) - total) > 1
      })

      const rentalKeyMap = new Map()
      ;(rental.data || []).forEach(row => {
        const key = String(row.source_sheet || '') + '|' + String(row.excel_row || '')
        const current = rentalKeyMap.get(key) || []
        current.push(row)
        rentalKeyMap.set(key, current)
      })
      const rentalDuplicates = [...rentalKeyMap.entries()].filter(([, rows]) => rows.length > 1)

      const itemVariants = new Map()
      itemRows.forEach(row => {
        const name = normalize(row.nama_item).replace(/^\d+[.)-]\s*/, '')
        if (!name) return
        const entry = itemVariants.get(name) || { categories: new Set(), units: new Set() }
        if (String(row.kategori || '').trim()) entry.categories.add(normalize(row.kategori))
        if (String(row.satuan || '').trim()) entry.units.add(normalize(row.satuan))
        itemVariants.set(name, entry)
      })
      const ambiguousItems = [...itemVariants.entries()].filter(([, value]) => value.categories.size > 1 || value.units.size > 1)

      const formatPlate = row => `${row.nomor_polisi || '-'}${row.merk ? ' — ' + row.merk : ''}`
      const checksNext = [
        { id: 'duplicate-plate', title: 'Nomor polisi duplikat', description: 'Satu nomor polisi seharusnya menunjuk satu kendaraan master.', severity: 'CRITICAL', count: duplicatePlates.length, examples: duplicatePlates.slice(0, 8).map(([plate, rows]) => `${plate} (${rows.length} data)`) },
        { id: 'invalid-ownership', title: 'Kepemilikan kendaraan tidak valid', description: 'Nilai kepemilikan hanya ASET atau SEWA.', severity: 'CRITICAL', count: invalidOwnership.length, examples: invalidOwnership.slice(0, 8).map(formatPlate) },
        { id: 'rental-identity', title: 'Kendaraan Sewa belum lengkap', description: 'Kendaraan Sewa wajib memiliki pemilik dan jenis sewa yang valid.', severity: 'CRITICAL', count: rentalMissingIdentity.length, examples: rentalMissingIdentity.slice(0, 8).map(formatPlate) },
        { id: 'orphan-docs', title: 'Dokumen tanpa kendaraan', description: 'Dokumen harus menunjuk ke kendaraan yang masih ada di master.', severity: 'CRITICAL', count: orphanDocs.length, examples: orphanDocs.slice(0, 8).map(row => `Dokumen #${row.id} → Kendaraan ${row.kendaraan_id}`) },
        { id: 'orphan-items', title: 'Item service tanpa service', description: 'Setiap item service harus menunjuk transaksi service yang valid.', severity: 'CRITICAL', count: orphanItems.length, examples: orphanItems.slice(0, 8).map(row => `Item #${row.id} → Service ${row.service_id}`) },
        { id: 'orphan-requests', title: 'Pengajuan tanpa kendaraan', description: 'Setiap pengajuan harus menunjuk kendaraan yang masih ada.', severity: 'CRITICAL', count: orphanRequests.length, examples: orphanRequests.slice(0, 8).map(row => `Pengajuan #${row.id} → Kendaraan ${row.kendaraan_id}`) },
        { id: 'orphan-services', title: 'Service menunjuk pengajuan yang hilang', description: 'Service boleh dibuat tanpa pengajuan, tetapi jika memiliki ID pengajuan maka relasinya harus ada.', severity: 'CRITICAL', count: orphanServices.length, examples: orphanServices.slice(0, 8).map(row => `Service #${row.id} → Pengajuan ${row.permintaan_service_id}`) },
        { id: 'finance-mismatch', title: 'Nilai keuangan service tidak seimbang', description: 'Nilai DPP + PPN harus sama dengan Total dalam toleransi 1 rupiah.', severity: 'CRITICAL', count: financeMismatch.length, examples: financeMismatch.slice(0, 8).map(row => `Service #${row.id}: DPP ${money(row.nilai_dpp)} + PPN ${money(row.ppn)} ≠ Total ${money(row.total)}`) },
        { id: 'rental-duplicates', title: 'Baris Summary Rental duplikat', description: 'Kombinasi source_sheet + excel_row seharusnya unik.', severity: 'CRITICAL', count: rentalDuplicates.length, examples: rentalDuplicates.slice(0, 8).map(([key, rows]) => `${key} (${rows.length} data)`) },
        { id: 'ambiguous-items', title: 'Item histori perlu review', description: 'Nama item yang sama muncul dengan kategori atau satuan berbeda; tidak otomatis dianggap salah.', severity: 'REVIEW', count: ambiguousItems.length, examples: ambiguousItems.slice(0, 8).map(([name, value]) => `${name} — ${value.categories.size} kategori / ${value.units.size} satuan`) },
      ]
      setChecks(checksNext)
    } catch (e) {
      setError(e.message || 'Pemeriksaan data gagal dijalankan.')
      setChecks([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const critical = useMemo(() => checks.filter(row => row.severity === 'CRITICAL' && row.count > 0).length, [checks])
  const review = useMemo(() => checks.filter(row => row.severity === 'REVIEW' && row.count > 0).length, [checks])

  return (
    <div className="x-page data-quality-panel">
      {error && <div className="x-alert error">{error}</div>}
      <section className="users-summary-card audit-summary-grid">
        <div className="users-summary-item"><span>Pemeriksaan</span><strong>{checks.length}</strong></div>
        <div className="users-summary-item"><span>Masalah kritis</span><strong className={critical ? 'data-quality-bad-value' : 'data-quality-good-value'}>{loading ? '...' : critical}</strong></div>
        <div className="users-summary-item"><span>Perlu review</span><strong className={review ? 'data-quality-review-value' : 'data-quality-good-value'}>{loading ? '...' : review}</strong></div>
        <div className="users-summary-item"><span>Status</span><strong className={critical ? 'data-quality-bad-value' : 'data-quality-good-value'}>{loading ? 'Memeriksa…' : critical ? 'Perlu diperbaiki' : 'Terkendali'}</strong></div>
      </section>
      <section className="x-card">
        <div className="x-card-title"><div><h3>Pemeriksaan integritas data</h3><p>Hasil ini bersifat read-only. Data historis tidak diubah otomatis.</p></div><button className="x-btn secondary" type="button" onClick={load} disabled={loading}>↻ Periksa Lagi</button></div>
        <div className="data-quality-list">
          {loading ? <div className="x-empty">Memeriksa integritas data...</div> : checks.map(check => (
            <details key={check.id} className={'data-quality-item ' + (check.count ? (check.severity === 'CRITICAL' ? 'has-critical' : 'has-review') : 'is-clean')} open={check.count > 0}>
              <summary><span className="data-quality-status-dot"/><span className="data-quality-main"><strong>{check.title}</strong><small>{check.description}</small></span><span className="data-quality-count">{check.count}</span></summary>
              {check.count > 0 && <div className="data-quality-details"><span>{check.severity === 'CRITICAL' ? 'Contoh data yang perlu diperiksa:' : 'Contoh variasi yang perlu direview:'}</span><ul>{check.examples.map(example => <li key={example}>{example}</li>)}</ul></div>}
            </details>
          ))}
        </div>
      </section>
    </div>
  )
}
