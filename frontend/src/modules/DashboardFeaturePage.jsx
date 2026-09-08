import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import './DashboardFeaturePage.css'

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
}

function countResult(result) {
  return result?.error ? 0 : (result?.count || 0)
}

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next.toISOString().slice(0, 10)
}

export default function DashboardFeaturePage({ profile, onNavigate }) {
  const [metrics, setMetrics] = useState(EMPTY_METRICS)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState('')

  const role = profile?.role || 'OPERASIONAL'
  const today = useMemo(() => new Date(), [])
  const dateLabel = useMemo(() => new Intl.DateTimeFormat('id-ID', { dateStyle: 'full' }).format(today), [today])
  const quickActions = QUICK_ACTIONS[role] || QUICK_ACTIONS.OPERASIONAL

  const loadDashboard = async () => {
    const firstLoad = !metrics || loading
    if (firstLoad) setLoading(true)
    else setRefreshing(true)
    setLoadError('')

    try {
      const result = { ...EMPTY_METRICS }
      const canReadFleet = ['ADMIN', 'TRANSPORT'].includes(role)
      const canReadService = ['ADMIN', 'TRANSPORT', 'ATASAN_TRANSPORT', 'DIREKTUR'].includes(role)
      const canReadRental = ['ADMIN', 'TRANSPORT', 'AKUNTANSI'].includes(role)

      const queries = []
      if (canReadFleet) {
        queries.push(
          supabase.from('kendaraan').select('id', { count: 'exact', head: true }).then((r) => { result.totalVehicles = countResult(r) }),
          supabase.from('kendaraan').select('id', { count: 'exact', head: true }).eq('status', 'ACTIVE').then((r) => { result.activeVehicles = countResult(r) }),
          supabase.from('kendaraan').select('id', { count: 'exact', head: true }).eq('status', 'SERVICE').then((r) => { result.serviceVehicles = countResult(r) }),
        )
      }

      if (role === 'OPERASIONAL') {
        queries.push(
          supabase.from('permintaan_service').select('id', { count: 'exact', head: true }).eq('pemohon_id', profile.id).in('status', ['MENUNGGU_TRANSPORT', 'DITERIMA_TRANSPORT', 'MENUNGGU_APPROVAL']).then((r) => { result.pendingRequests = countResult(r) }),
          supabase.from('permintaan_service').select('id', { count: 'exact', head: true }).eq('pemohon_id', profile.id).eq('status', 'SELESAI').then((r) => { result.completedRequests = countResult(r) }),
        )
      }

      if (canReadService) {
        queries.push(
          supabase.from('permintaan_service').select('id', { count: 'exact', head: true }).eq('status', 'MENUNGGU_TRANSPORT').then((r) => { result.transportQueue = countResult(r) }),
          supabase.from('permintaan_service').select('id', { count: 'exact', head: true }).eq('status', 'MENUNGGU_APPROVAL').then((r) => { result.approvalQueue = countResult(r) }),
          supabase.from('service').select('id', { count: 'exact', head: true }).eq('status', 'DALAM_PENGERJAAN').then((r) => { result.runningServices = countResult(r) }),
          supabase.from('permintaan_service').select('id', { count: 'exact', head: true }).eq('status', 'SELESAI').then((r) => { result.completedRequests = countResult(r) }),
        )
      }

      if (canReadRental) {
        const maxDate = addDays(today, 30)
        queries.push(
          supabase.from('dokumen_kendaraan').select('id', { count: 'exact', head: true }).not('tanggal_jatuh_tempo', 'is', null).gte('tanggal_jatuh_tempo', today.toISOString().slice(0, 10)).lte('tanggal_jatuh_tempo', maxDate).then((r) => { result.expiringDocuments = countResult(r) }),
          supabase.from('kontrak_sewa').select('id', { count: 'exact', head: true }).eq('status', 'AKTIF').gte('tanggal_selesai', today.toISOString().slice(0, 10)).lte('tanggal_selesai', maxDate).then((r) => { result.expiringContracts = countResult(r) }),
          supabase.from('pembayaran_sewa').select('id', { count: 'exact', head: true }).in('status', ['BELUM_LUNAS', 'TERLAMBAT']).then((r) => { result.unpaidRentals = countResult(r) }),
        )
      }

      if (canReadFleet && !canReadRental) {
        const maxDate = addDays(today, 30)
        queries.push(
          supabase.from('dokumen_kendaraan').select('id', { count: 'exact', head: true }).not('tanggal_jatuh_tempo', 'is', null).gte('tanggal_jatuh_tempo', today.toISOString().slice(0, 10)).lte('tanggal_jatuh_tempo', maxDate).then((r) => { result.expiringDocuments = countResult(r) }),
        )
      }

      await Promise.all(queries)
      setMetrics(result)
    } catch (error) {
      console.error('Dashboard load error:', error)
      setLoadError('Sebagian informasi dashboard tidak dapat dimuat. Coba refresh kembali.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    if (profile?.id) loadDashboard()
    // The dashboard should refresh when the logged-in profile changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, profile?.role])

  const stats = useMemo(() => {
    if (role === 'OPERASIONAL') return [
      ['pendingRequests', 'Pengajuan Saya', 'Masih diproses', 'request'],
      ['completedRequests', 'Pengajuan Selesai', 'Sudah selesai', 'check'],
      ['pendingRequests', 'Perlu Dipantau', 'Status belum selesai', 'service'],
    ]
    if (role === 'AKUNTANSI') return [
      ['unpaidRentals', 'Tagihan Sewa', 'Belum lunas / terlambat', 'rental'],
      ['expiringContracts', 'Kontrak Segera Berakhir', 'Dalam 30 hari', 'document'],
      ['completedRequests', 'Service Selesai', 'Data penyelesaian', 'check'],
    ]
    return [
      ['totalVehicles', 'Total Kendaraan', 'Data kendaraan terdaftar', 'vehicle'],
      ['activeVehicles', 'Kendaraan Aktif', 'Siap digunakan', 'check'],
      ['serviceVehicles', 'Sedang Service', 'Perlu dipantau', 'service'],
      ['pendingRequests', 'Pengajuan Menunggu', 'Perlu diproses', 'request'],
    ]
  }, [role])

  const actionItems = useMemo(() => {
    if (role === 'OPERASIONAL') return [
      ['Pengajuan belum selesai', metrics.pendingRequests, 'pengajuan', 'Pantau status pengajuan service Anda.'],
    ]
    if (role === 'AKUNTANSI') return [
      ['Pembayaran belum lunas / terlambat', metrics.unpaidRentals, 'sewa', 'Periksa tagihan kendaraan sewa.'],
      ['Kontrak sewa berakhir ≤ 30 hari', metrics.expiringContracts, 'sewa', 'Siapkan tindak lanjut kontrak berikutnya.'],
    ]
    const items = [
      ['Pengajuan menunggu Transport', metrics.transportQueue, 'pengajuan', 'Terima atau proses pengajuan yang masuk.'],
      ['Service menunggu approval', metrics.approvalQueue, 'service', 'Periksa service yang membutuhkan persetujuan.'],
      ['Service sedang dikerjakan', metrics.runningServices, 'service', 'Pantau pekerjaan yang masih berjalan.'],
      ['Dokumen jatuh tempo ≤ 30 hari', metrics.expiringDocuments, 'dokumen', 'Periksa dan perbarui dokumen kendaraan.'],
    ]
    return role === 'DIREKTUR' ? items.slice(1, 2) : role === 'ATASAN_TRANSPORT' ? items.slice(0, 3) : items
  }, [metrics, role])

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
          <article className="dashboard-stat-card" key={`${key}-${label}`}>
            <div className="dashboard-stat-icon" data-icon={icon} aria-hidden="true" />
            <div>
              <span>{label}</span>
              <strong>{loading ? '...' : metrics[key]}</strong>
              <small>{helper}</small>
            </div>
          </article>
        ))}
      </section>

      <section className="dashboard-v2-grid top-grid">
        <article className="dashboard-v2-panel quick-panel-v2">
          <div className="dashboard-panel-heading">
            <div>
              <span className="eyebrow">AKSES CEPAT</span>
              <h3>Menu yang sering digunakan</h3>
            </div>
          </div>
          <div className="quick-grid-v2">
            {quickActions.map(([page, icon, title, description]) => (
              <button className="quick-action-v2" key={page} onClick={() => onNavigate(page)}>
                <span className="quick-action-icon" data-icon={icon} aria-hidden="true" />
                <span className="quick-action-copy"><strong>{title}</strong><small>{description}</small></span>
                <span className="quick-arrow" aria-hidden="true">›</span>
              </button>
            ))}
          </div>
        </article>

        <article className="dashboard-v2-panel action-panel-v2">
          <div className="dashboard-panel-heading">
            <div>
              <span className="eyebrow">PERLU TINDAKAN</span>
              <h3>Yang harus diperiksa</h3>
            </div>
          </div>
          <div className="action-list-v2">
            {actionItems.length === 0 ? (
              <div className="dashboard-empty-state">Tidak ada pekerjaan yang perlu ditindak saat ini.</div>
            ) : actionItems.map(([label, count, page, description]) => (
              <button className="action-row-v2" key={label} onClick={() => onNavigate(page)}>
                <span className="action-count-v2">{loading ? '...' : count}</span>
                <span className="action-copy-v2"><strong>{label}</strong><small>{description}</small></span>
                <span className="quick-arrow" aria-hidden="true">›</span>
              </button>
            ))}
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
