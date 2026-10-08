import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import './DashboardFeaturePage.css'
import PageBreadcrumb from './PageBreadcrumb.jsx'

const ROLE_HELP = {
  ADMIN: 'Pantau seluruh aktivitas kendaraan, service, sewa, dokumen, dan pengguna.',
  TRANSPORT: 'Pantau armada dan pekerjaan transport yang perlu diproses.',
  OPERASIONAL: 'Pantau pengajuan service yang dibuat untuk kendaraan operasional.',
  ATASAN_TRANSPORT: 'Fokus pada pengajuan dan pekerjaan yang memerlukan persetujuan atau tindak lanjut.',
  DIREKTUR: 'Fokus pada service bernilai tinggi yang membutuhkan persetujuan manajemen.',
  AKUNTANSI: 'Pantau kewajiban pembayaran dan administrasi kendaraan sewa.',
}

const EMPTY_METRICS = {
  totalVehicles: 0,
  activeVehicles: 0,
  serviceVehicles: 0,
  pendingRequests: 0,
  transportQueue: 0,
  approvalQueue: 0,
  runningServices: 0,
  completedRequests: 0,
  expiringDocuments: 0,
  expiringContracts: 0,
  unpaidRentals: 0,
  activeContracts: 0,
}

async function readCount(query) {
  const { count, error } = await query
  return { count: count || 0, error }
}

function localDateKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addDays(date, days) {
  const next = new Date(date)
  next.setHours(12, 0, 0, 0)
  next.setDate(next.getDate() + days)
  return localDateKey(next)
}

export default function DashboardFeaturePage({ profile, onNavigate }) {
  const [metrics, setMetrics] = useState(EMPTY_METRICS)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState('')

  const role = profile?.role || 'OPERASIONAL'
  const today = useMemo(() => new Date(), [])
  const todayKey = useMemo(() => localDateKey(today), [today])
  const maxDate = useMemo(() => addDays(today, 30), [today])
  const dateLabel = useMemo(() => new Intl.DateTimeFormat('id-ID', { dateStyle: 'full' }).format(today), [today])

  const loadDashboard = async () => {
    const firstLoad = loading && Object.values(metrics).every((value) => value === 0)
    if (firstLoad) setLoading(true)
    else setRefreshing(true)
    setLoadError('')

    try {
      const result = { ...EMPTY_METRICS }
      const failures = []
      const canReadFleet = ['ADMIN', 'TRANSPORT'].includes(role)
      const canReadService = ['ADMIN', 'TRANSPORT', 'ATASAN_TRANSPORT', 'DIREKTUR'].includes(role)
      const canReadRental = ['ADMIN', 'TRANSPORT', 'AKUNTANSI'].includes(role)

      const countTasks = []
      const pushCount = (label, query, target) => {
        countTasks.push(readCount(query).then(({ count, error }) => {
          if (error) failures.push(label)
          else result[target] = count
        }))
      }

      if (canReadFleet) {
        pushCount('total kendaraan', supabase.from('kendaraan').select('id', { count: 'exact', head: true }), 'totalVehicles')
        pushCount('kendaraan aktif', supabase.from('kendaraan').select('id', { count: 'exact', head: true }).eq('status', 'ACTIVE'), 'activeVehicles')
        pushCount('kendaraan service', supabase.from('kendaraan').select('id', { count: 'exact', head: true }).eq('status', 'SERVICE'), 'serviceVehicles')
      }

      if (role === 'OPERASIONAL') {
        pushCount('pengajuan saya', supabase.from('permintaan_service').select('id', { count: 'exact', head: true }).eq('pemohon_id', profile.id).in('status', ['MENUNGGU_TRANSPORT', 'DITERIMA_TRANSPORT', 'MENUNGGU_APPROVAL']), 'pendingRequests')
        pushCount('pengajuan selesai', supabase.from('permintaan_service').select('id', { count: 'exact', head: true }).eq('pemohon_id', profile.id).eq('status', 'SELESAI'), 'completedRequests')
      }

      if (canReadService) {
        pushCount('antrian transport', supabase.from('permintaan_service').select('id', { count: 'exact', head: true }).eq('status', 'MENUNGGU_TRANSPORT'), 'transportQueue')
        pushCount('service menunggu approval', supabase.from('service').select('id', { count: 'exact', head: true }).eq('status', 'MENUNGGU_APPROVAL'), 'approvalQueue')
        pushCount('service berjalan', supabase.from('service').select('id', { count: 'exact', head: true }).eq('status', 'DALAM_PENGERJAAN'), 'runningServices')
        pushCount('service selesai', supabase.from('permintaan_service').select('id', { count: 'exact', head: true }).eq('status', 'SELESAI'), 'completedRequests')
      }

      if (canReadFleet) {
        pushCount('dokumen jatuh tempo atau mendekati jatuh tempo', supabase.from('dokumen_kendaraan').select('id, kendaraan!inner(id, kepemilikan)', { count: 'exact', head: true }).eq('kendaraan.kepemilikan', 'ASET').not('tanggal_jatuh_tempo', 'is', null).lte('tanggal_jatuh_tempo', maxDate), 'expiringDocuments')
      }

      if (canReadRental) {
        pushCount('kontrak segera berakhir', supabase.from('kontrak_sewa').select('id', { count: 'exact', head: true }).eq('status', 'AKTIF').gte('tanggal_selesai', todayKey).lte('tanggal_selesai', maxDate), 'expiringContracts')
        pushCount('pembayaran belum lunas', supabase.from('pembayaran_sewa').select('id', { count: 'exact', head: true }).in('status', ['BELUM_DIBAYAR', 'SEBAGIAN_DIBAYAR', 'TERLAMBAT']), 'unpaidRentals')
        pushCount('kontrak sewa aktif', supabase.from('kontrak_sewa').select('id', { count: 'exact', head: true }).eq('status', 'AKTIF'), 'activeContracts')
      }

      await Promise.all(countTasks)

      if (canReadService) result.pendingRequests = result.transportQueue
      if (role === 'ATASAN_TRANSPORT' || role === 'DIREKTUR') result.pendingRequests = result.approvalQueue

      setMetrics(result)
      if (failures.length) setLoadError(`Sebagian data dashboard gagal dimuat (${failures.length} bagian). Gunakan Refresh atau periksa hak akses data.`)
    } catch (error) {
      console.error('Dashboard load error:', error)
      setLoadError('Data dashboard tidak dapat dimuat. Silakan coba Refresh kembali.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    if (profile?.id) loadDashboard()
    // Dashboard refreshes only when the authenticated profile/role changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, profile?.role])

  useEffect(() => {
    const handleImported = (event) => { if (event.detail?.context) loadDashboard() }
    window.addEventListener('transport:data-imported', handleImported)
    return () => window.removeEventListener('transport:data-imported', handleImported)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stats = useMemo(() => {
    if (role === 'OPERASIONAL') return [
      ['pendingRequests', 'Pengajuan Saya', 'Masih diproses', 'request'],
      ['completedRequests', 'Pengajuan Selesai', 'Sudah selesai', 'check'],
    ]
    if (role === 'AKUNTANSI') return [
      ['unpaidRentals', 'Tagihan Sewa', 'Belum lunas / terlambat', 'rental'],
      ['expiringContracts', 'Kontrak Segera Berakhir', 'Dalam 30 hari', 'document'],
      ['activeContracts', 'Kontrak Aktif', 'Sedang berjalan', 'vehicle'],
    ]
    if (role === 'ATASAN_TRANSPORT') return [
      ['approvalQueue', 'Menunggu Approval Service', 'Perlu ditinjau', 'request'],
      ['runningServices', 'Service Berjalan', 'Sedang dikerjakan', 'service'],
      ['completedRequests', 'Service Selesai', 'Sudah selesai', 'check'],
    ]
    if (role === 'DIREKTUR') return [
      ['approvalQueue', 'Menunggu Approval', 'Perlu ditinjau', 'request'],
      ['runningServices', 'Service Berjalan', 'Sedang dikerjakan', 'service'],
    ]
    return [
      ['totalVehicles', 'Total Kendaraan', 'Data kendaraan terdaftar', 'vehicle'],
      ['activeVehicles', 'Kendaraan Aktif', 'Siap digunakan', 'check'],
      ['serviceVehicles', 'Sedang Service', 'Perlu dipantau', 'service'],
      ['transportQueue', 'Menunggu Transport', 'Perlu diproses', 'request'],
    ]
  }, [role])

  const actionItems = useMemo(() => {
    if (role === 'OPERASIONAL') return [
      ['Pengajuan belum selesai', metrics.pendingRequests, 'pengajuan', 'Pantau status pengajuan service Anda.', 'warning'],
    ]
    if (role === 'AKUNTANSI') return [
      ['Pembayaran belum lunas / terlambat', metrics.unpaidRentals, 'sewa', 'Periksa tagihan kendaraan sewa.', 'danger'],
      ['Kontrak sewa berakhir ≤ 30 hari', metrics.expiringContracts, 'sewa', 'Siapkan tindak lanjut kontrak berikutnya.', 'warning'],
    ]
    if (role === 'DIREKTUR') return [
      ['Service menunggu approval', metrics.approvalQueue, 'service', 'Tinjau service yang membutuhkan persetujuan.', 'danger'],
    ]
    if (role === 'ATASAN_TRANSPORT') return [
      ['Service menunggu approval', metrics.approvalQueue, 'service', 'Tinjau service yang membutuhkan persetujuan.', 'danger'],
      ['Pengajuan menunggu Transport', metrics.transportQueue, 'pengajuan', 'Periksa pengajuan yang baru masuk.', 'warning'],
      ['Service sedang dikerjakan', metrics.runningServices, 'service', 'Pantau pekerjaan yang masih berjalan.', 'monitor'],
    ]
    return [
      ['Pengajuan menunggu Transport', metrics.transportQueue, 'pengajuan', 'Periksa dan proses pengajuan yang baru masuk.', 'danger'],
      ['Service menunggu approval', metrics.approvalQueue, 'service', 'Periksa service yang membutuhkan persetujuan.', 'danger'],
      ['Pembayaran belum lunas / terlambat', metrics.unpaidRentals, 'sewa', 'Periksa tagihan kendaraan sewa.', 'danger'],
      ['Dokumen jatuh tempo / terlewat', metrics.expiringDocuments, 'dokumen', 'Periksa dokumen yang sudah lewat atau jatuh tempo dalam 30 hari.', 'warning'],
      ['Service sedang dikerjakan', metrics.runningServices, 'service', 'Pantau pekerjaan yang masih berjalan.', 'monitor'],
    ]
  }, [metrics, role])

  const visibleActionItems = useMemo(() => actionItems.filter(([, count]) => Number(count || 0) > 0), [actionItems])

  return (
    <div className="dashboard-v2">
      <PageBreadcrumb items={['Transport', 'Dashboard']} />
      <section className="dashboard-v2-intro">
        <div>
          <span className="eyebrow">{dateLabel}</span>
          <h2>Selamat datang, {profile?.nama_lengkap || 'Pengguna'}</h2>
          <p>{ROLE_HELP[role] || ROLE_HELP.OPERASIONAL}</p>
        </div>
        <button className="dashboard-refresh" onClick={loadDashboard} disabled={loading || refreshing}>
          {refreshing ? 'Memuat...' : '↻ Refresh'}
        </button>
      </section>

      {loadError && <div className="dashboard-v2-alert">{loadError}</div>}

      <section className={`dashboard-v2-stats stats-count-${stats.length}`}>
        {stats.map(([key, label, helper, icon]) => (
          <button
            type="button"
            className="dashboard-stat-card dashboard-stat-card-clickable"
            key={key + '-' + label}
            onClick={() => onNavigate(({
              totalVehicles: 'kendaraan',
              activeVehicles: 'kendaraan',
              serviceVehicles: 'service',
              transportQueue: 'pengajuan',
              pendingRequests: 'pengajuan',
              completedRequests: role === 'OPERASIONAL' ? 'pengajuan' : 'service',
              approvalQueue: 'service',
              runningServices: 'service',
              unpaidRentals: 'sewa',
              expiringContracts: 'sewa',
              activeContracts: 'sewa',
            })[key] || 'dashboard')}
            aria-label={'Buka ' + label}
          >
            <div className="dashboard-stat-icon" data-icon={icon} aria-hidden="true" />
            <div>
              <span>{label}</span>
              <strong>{loading ? '...' : metrics[key]}</strong>
              <small>{helper}</small>
            </div>
            <span className="dashboard-stat-arrow" aria-hidden="true">›</span>
          </button>
        ))}
      </section>

      <section className="dashboard-v2-panel action-panel-v2 dashboard-attention-panel">
        <div className="dashboard-panel-heading">
          <div>
            <span className="eyebrow">PERLU TINDAKAN</span>
            <h3>Butuh Perhatian</h3>
          </div>
          <span className="dashboard-attention-meta">
            {loading ? 'Memeriksa data…' : visibleActionItems.length + ' hal perlu dilihat'}
          </span>
        </div>
        <div className="action-list-v2">
          {loading ? (
            <div className="dashboard-empty-state">Memeriksa pekerjaan yang perlu diperhatikan…</div>
          ) : visibleActionItems.length === 0 ? (
            <div className="dashboard-empty-state dashboard-empty-state-success">
              <span>✓</span>
              <div>
                <strong>Tidak ada pekerjaan mendesak</strong>
                <small>Semua indikator utama dalam kondisi normal saat ini.</small>
              </div>
            </div>
          ) : (
            visibleActionItems.map(([label, count, page, description, tone]) => (
              <button className={`action-row-v2 tone-${tone}`} key={label} onClick={() => onNavigate(page)}>
                <span className="action-count-v2">{count}</span>
                <span className="action-copy-v2"><strong>{label}</strong><small>{description}</small></span>
                <span className="quick-arrow" aria-hidden="true">›</span>
              </button>
            ))
          )}
        </div>
      </section>
    </div>
  )
}