import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import './DashboardFeaturePage.css'
import PageBreadcrumb from './PageBreadcrumb.jsx'

const QUICK_ACTIONS = {
  ADMIN: [
    ['pengajuan', 'request', 'Ajukan Service', 'Buat permintaan untuk kendaraan'],
    ['kendaraan', 'vehicle', 'Data Kendaraan', 'Lihat armada dan kilometer'],
    ['service', 'service', 'Proses Service', 'Pantau pekerjaan dan biaya'],
    ['sewa', 'rental', 'Kendaraan Sewa', 'Kelola kontrak dan pembayaran sewa'],
    ['dokumen', 'document', 'Dokumen', 'Kelola dokumen kendaraan'],
    ['laporan', 'report', 'Laporan', 'Lihat ringkasan dan laporan'],
  ],
  TRANSPORT: [
    ['pengajuan', 'request', 'Pengajuan Service', 'Periksa permintaan dari operasional'],
    ['kendaraan', 'vehicle', 'Data Kendaraan', 'Lihat armada dan kilometer'],
    ['service', 'service', 'Proses Service', 'Pantau pekerjaan dan biaya'],
    ['sewa', 'rental', 'Kendaraan Sewa', 'Kelola kontrak dan perbaikan sewa'],
    ['dokumen', 'document', 'Dokumen', 'Kelola dokumen kendaraan'],
    ['laporan', 'report', 'Laporan', 'Lihat ringkasan transport'],
  ],
  OPERASIONAL: [
    ['pengajuan', 'request', 'Ajukan Service', 'Buat permintaan service kendaraan'],
  ],
  ATASAN_TRANSPORT: [
    ['pengajuan', 'request', 'Pengajuan Service', 'Pantau antrian dan status pengajuan'],
    ['service', 'service', 'Approval & Service', 'Tinjau service yang membutuhkan tindakan'],
    ['laporan', 'report', 'Laporan', 'Lihat ringkasan operasional transport'],
  ],
  DIREKTUR: [
    ['service', 'service', 'Approval Service', 'Tinjau service yang memerlukan persetujuan'],
    ['laporan', 'report', 'Laporan', 'Lihat ringkasan transport'],
  ],
  AKUNTANSI: [
    ['sewa', 'rental', 'Kendaraan Sewa', 'Kelola tagihan dan pembayaran sewa'],
    ['laporan', 'report', 'Laporan', 'Lihat ringkasan keuangan transport'],
  ],
}

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

function getDashboardVisual(role, metrics) {
  if (role === 'ADMIN' || role === 'TRANSPORT') {
    const total = Number(metrics.totalVehicles || 0)
    const active = Number(metrics.activeVehicles || 0)
    const service = Number(metrics.serviceVehicles || 0)
    const other = Math.max(total - active - service, 0)
    const readiness = total ? Math.round((active / total) * 100) : 0
    return {
      eyebrow: 'STATUS ARMADA',
      title: 'Kondisi Armada',
      subtitle: 'Komposisi kendaraan berdasarkan status saat ini.',
      rows: [['Aktif', active, 'Siap digunakan', 'green'], ['Sedang Service', service, 'Sedang ditangani', 'amber'], ['Status Lainnya', other, 'Tidak masuk dua status utama', 'slate']],
      gauge: readiness,
      gaugeLabel: 'Kesiapan armada',
      highlights: [['Menunggu Transport', metrics.transportQueue, 'Antrian pekerjaan'], ['Approval Service', metrics.approvalQueue, 'Perlu ditinjau']],
    }
  }
  if (role === 'OPERASIONAL') {
    const pending = Number(metrics.pendingRequests || 0), completed = Number(metrics.completedRequests || 0), total = pending + completed
    const completion = total ? Math.round((completed / total) * 100) : 0
    return {
      eyebrow: 'STATUS PENGAJUAN',
      title: 'Pengajuan Saya',
      subtitle: 'Perbandingan pengajuan yang masih berjalan dan yang sudah selesai.',
      rows: [['Masih Diproses', pending, 'Menunggu penyelesaian', 'amber'], ['Selesai', completed, 'Sudah ditutup', 'green']],
      gauge: completion,
      gaugeLabel: 'Tingkat penyelesaian',
      highlights: [['Belum Selesai', pending, 'Perlu dipantau'], ['Selesai', completed, 'Sudah terselesaikan']],
    }
  }
  if (role === 'AKUNTANSI') {
    const active = Number(metrics.activeContracts || 0), expiring = Number(metrics.expiringContracts || 0), safeContracts = Math.max(active - expiring, 0)
    const coverage = active ? Math.round((safeContracts / active) * 100) : 0
    return {
      eyebrow: 'ADMINISTRASI SEWA',
      title: 'Status Kontrak & Tagihan',
      subtitle: 'Ringkasan kontrak aktif dan item administrasi yang perlu ditindaklanjuti.',
      rows: [['Kontrak Aktif', active, 'Sedang berjalan', 'green'], ['Berakhir ≤ 30 Hari', expiring, 'Perlu persiapan', 'amber'], ['Tagihan Belum Lunas', metrics.unpaidRentals, 'Perlu ditindaklanjuti', 'red']],
      gauge: coverage,
      gaugeLabel: 'Kontrak relatif aman',
      highlights: [['Tagihan Belum Lunas', metrics.unpaidRentals, 'Perlu diperiksa'], ['Segera Berakhir', expiring, 'Dalam 30 hari']],
    }
  }
  const approval = Number(metrics.approvalQueue || 0), running = Number(metrics.runningServices || 0), completed = Number(metrics.completedRequests || 0), tracked = approval + running + completed
  const completion = tracked ? Math.round((completed / tracked) * 100) : 0
  return {
    eyebrow: 'STATUS SERVICE',
    title: 'Alur Pekerjaan Service',
    subtitle: 'Gambaran pekerjaan yang menunggu, berjalan, dan selesai.',
    rows: [['Menunggu Approval', approval, 'Perlu keputusan', 'red'], ['Sedang Dikerjakan', running, 'Dalam proses', 'blue'], ['Selesai', completed, 'Sudah selesai', 'green']],
    gauge: completion,
    gaugeLabel: 'Porsi pekerjaan selesai',
    highlights: [['Menunggu Approval', approval, 'Perlu ditinjau'], ['Sedang Dikerjakan', running, 'Masih berjalan']],
  }
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
  const quickActions = QUICK_ACTIONS[role] || QUICK_ACTIONS.OPERASIONAL

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
        pushCount('antrian approval', supabase.from('permintaan_service').select('id', { count: 'exact', head: true }).eq('status', 'MENUNGGU_APPROVAL'), 'approvalQueue')
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
      ['approvalQueue', 'Menunggu Approval', 'Perlu ditinjau', 'request'],
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
      ['Dokumen jatuh tempo ≤ 30 hari', metrics.expiringDocuments, 'dokumen', 'Periksa dan perbarui dokumen kendaraan.', 'warning'],
      ['Service sedang dikerjakan', metrics.runningServices, 'service', 'Pantau pekerjaan yang masih berjalan.', 'monitor'],
    ]
  }, [metrics, role])

  const visibleActionItems = useMemo(() => actionItems.filter(([, count]) => Number(count || 0) > 0), [actionItems])
  const dashboardVisual = useMemo(() => getDashboardVisual(role, metrics), [role, metrics])
  const maxVisualValue = useMemo(() => Math.max(1, ...dashboardVisual.rows.map(([, value]) => Number(value || 0))), [dashboardVisual.rows])

  const flow = role === 'OPERASIONAL'
    ? [
      ['Pengajuan', metrics.pendingRequests, 'Menunggu proses transport'],
      ['Selesai', metrics.completedRequests, 'Pengajuan yang sudah selesai'],
    ]
    : [
      ['Operasional', null, 'Awal proses'],
      ['Permintaan Service', metrics.transportQueue, 'Menunggu diproses Transport'],
      ['Approval', metrics.approvalQueue, 'Menunggu persetujuan'],
      ['Service', metrics.runningServices, 'Sedang dikerjakan'],
      ['Selesai', metrics.completedRequests, 'Permintaan yang selesai'],
    ]

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
          {refreshing ? 'Memuat...' : 'Refresh'}
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

      <section className="dashboard-lower-grid">
        <section className="dashboard-v2-panel dashboard-visual-panel">
          <div className="dashboard-panel-heading">
            <div><span className="eyebrow">{dashboardVisual.eyebrow}</span><h3>{dashboardVisual.title}</h3><p className="dashboard-panel-subtitle">{dashboardVisual.subtitle}</p></div>
          </div>
          <div className="dashboard-visual-content">
            <div className="dashboard-bars">
              {dashboardVisual.rows.map(([label, value, helper, tone]) => {
                const numericValue = Number(value || 0)
                const width = Math.max(0, Math.min(100, (numericValue / maxVisualValue) * 100))
                return <div className="dashboard-bar-row" key={label}>
                  <div className="dashboard-bar-meta"><span><strong>{label}</strong><small>{helper}</small></span><b>{loading ? '...' : numericValue}</b></div>
                  <div className="dashboard-bar-track" aria-hidden="true"><span className={`dashboard-bar-fill tone-${tone}`} style={{ width: `${width}%` }} /></div>
                </div>
              })}
            </div>
            <div className="dashboard-health-card">
              <div className="dashboard-gauge" style={{ '--gauge-value': `${loading ? 0 : dashboardVisual.gauge}%` }}><div><strong>{loading ? '...' : dashboardVisual.gauge + '%'}</strong><span>Kondisi</span></div></div>
              <div className="dashboard-health-copy"><span className="eyebrow">INDIKATOR</span><strong>{dashboardVisual.gaugeLabel}</strong><div className="dashboard-highlight-list">
                {dashboardVisual.highlights.map(([label, value, helper]) => <div key={label}><span>{label}</span><b>{loading ? '...' : value}</b><small>{helper}</small></div>)}
              </div></div>
            </div>
          </div>
        </section>
        <section className="dashboard-v2-panel action-panel-v2 dashboard-attention-panel">
          <div className="dashboard-panel-heading"><div><span className="eyebrow">PERLU TINDAKAN</span><h3>Butuh Perhatian</h3></div><span className="dashboard-attention-meta">{loading ? 'Memeriksa data…' : visibleActionItems.length + ' hal perlu dilihat'}</span></div>
          <div className="action-list-v2">
            {loading ? <div className="dashboard-empty-state">Memeriksa pekerjaan yang perlu diperhatikan…</div> :
             visibleActionItems.length === 0 ? <div className="dashboard-empty-state dashboard-empty-state-success"><span>✓</span><div><strong>Tidak ada pekerjaan mendesak</strong><small>Semua indikator utama dalam kondisi normal saat ini.</small></div></div> :
             visibleActionItems.map(([label, count, page, description, tone]) => <button className={`action-row-v2 tone-${tone}`} key={label} onClick={() => onNavigate(page)}><span className="action-count-v2">{count}</span><span className="action-copy-v2"><strong>{label}</strong><small>{description}</small></span><span className="quick-arrow" aria-hidden="true">›</span></button>)}
          </div>
        </section>
      </section>

      <section className="dashboard-v2-grid quick-actions-grid">
        <article className="dashboard-v2-panel quick-panel-v2">
          <div className="dashboard-panel-heading"><div><span className="eyebrow">AKSES CEPAT</span><h3>Menu yang sering digunakan</h3></div></div>
          <div className="quick-grid-v2">
            {quickActions.map(([page, icon, title, description]) => <button className="quick-action-v2" key={page} onClick={() => onNavigate(page)}><span className="quick-action-icon" data-icon={icon} aria-hidden="true" /><span className="quick-action-copy"><strong>{title}</strong><small>{description}</small></span><span className="quick-arrow" aria-hidden="true">›</span></button>)}
          </div>
        </article>
      </section>

      <section className="dashboard-v2-grid bottom-grid">
        <article className="dashboard-v2-panel flow-panel-v2">
          <div className="dashboard-panel-heading">
            <div>
              <span className="eyebrow">ALUR UTAMA</span>
              <h3>Proses transport saat ini</h3>
            </div>
          </div>
          <div className="flow-list-v2">
            {flow.map(([label, count, helper], index) => (
              <div className={`flow-item-v2 ${count > 0 ? 'has-count' : ''}`} key={label}>
                <span className="flow-number-v2">{index + 1}</span>
                <span className="flow-content-v2"><strong>{label}</strong><small>{helper}</small></span>
                {count !== null && <b>{loading ? '...' : count}</b>}
              </div>
            ))}
          </div>
        </article>

        <article className="dashboard-v2-panel notice-panel-v2">
          <div className="dashboard-panel-heading">
            <div>
              <span className="eyebrow">PERHATIAN</span>
              <h3>Pengingat penting</h3>
            </div>
          </div>
          <div className="notice-list-v2">
            {['ADMIN', 'TRANSPORT'].includes(role) && <div><span className="notice-dot" /><span>Dokumen dengan jatuh tempo dekat perlu diperiksa sebelum masa berlaku habis.</span></div>}
            {['ADMIN', 'TRANSPORT', 'AKUNTANSI'].includes(role) && <div><span className="notice-dot" /><span>Kontrak sewa berjalan selama 6 bulan dan perlu dibuatkan kontrak baru setelah periodenya berakhir.</span></div>}
            {['ADMIN', 'TRANSPORT', 'ATASAN_TRANSPORT', 'DIREKTUR'].includes(role) && <div><span className="notice-dot" /><span>Service dengan nilai aktual di atas batas persetujuan harus mengikuti approval yang sesuai.</span></div>}
            {role === 'OPERASIONAL' && <div><span className="notice-dot" /><span>Gunakan Pengajuan Service untuk melaporkan kebutuhan kendaraan dan pantau statusnya di sistem.</span></div>}
            {role === 'AKUNTANSI' && <div><span className="notice-dot" /><span>Pembayaran yang terlambat tetap tercatat agar riwayat pembayaran kendaraan sewa dapat dipantau.</span></div>}
          </div>
        </article>
      </section>
    </div>
  )
}