import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import './App.css'

const REMEMBERED_EMAIL_KEY = 'transport_remembered_email'

const ROLE_LABELS = {
  ADMIN: 'Administrator',
  TRANSPORT: 'Transport',
  OPERASIONAL: 'Operasional',
  ATASAN_TRANSPORT: 'Atasan Transport',
  DIREKTUR: 'Direktur',
  AKUNTANSI: 'Akuntansi',
}

const ROLE_ACCESS = {
  ADMIN: ['dashboard', 'kendaraan', 'service', 'pengajuan', 'sewa', 'dokumen', 'laporan', 'pengguna'],
  TRANSPORT: ['dashboard', 'kendaraan', 'service', 'pengajuan', 'sewa', 'dokumen', 'laporan'],
  OPERASIONAL: ['dashboard', 'pengajuan'],
  ATASAN_TRANSPORT: ['dashboard', 'service', 'pengajuan', 'laporan'],
  DIREKTUR: ['dashboard', 'service', 'laporan'],
  AKUNTANSI: ['dashboard', 'sewa', 'laporan'],
}

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: '⌂' },
  { id: 'kendaraan', label: 'Kendaraan', icon: '▣' },
  { id: 'pengajuan', label: 'Pengajuan Service', icon: '↗' },
  { id: 'service', label: 'Service & Perbaikan', icon: '⚙' },
  { id: 'sewa', label: 'Kendaraan Sewa', icon: '▤' },
  { id: 'dokumen', label: 'Dokumen', icon: '□' },
  { id: 'laporan', label: 'Laporan', icon: '▥' },
  { id: 'pengguna', label: 'Pengguna', icon: '♙' },
]

const STAT_DEFINITIONS = [
  { key: 'vehicles', label: 'Total Kendaraan', helper: 'Data kendaraan terdaftar', icon: '▣' },
  { key: 'activeVehicles', label: 'Kendaraan Aktif', helper: 'Siap digunakan', icon: '✓' },
  { key: 'inService', label: 'Sedang Service', helper: 'Perlu dipantau', icon: '⚙' },
  { key: 'pendingRequests', label: 'Pengajuan Menunggu', helper: 'Perlu diproses', icon: '↗' },
]

function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activePage, setActivePage] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [stats, setStats] = useState({ vehicles: 0, activeVehicles: 0, inService: 0, pendingRequests: 0 })
  const [statsLoading, setStatsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState(() => localStorage.getItem(REMEMBERED_EMAIL_KEY) || '')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const allowedPages = useMemo(() => ROLE_ACCESS[profile?.role] || ['dashboard'], [profile?.role])
  const visibleNavItems = useMemo(() => NAV_ITEMS.filter((item) => allowedPages.includes(item.id)), [allowedPages])

  useEffect(() => {
    let mounted = true

    const initialize = async () => {
      const { data, error } = await supabase.auth.getSession()
      if (!mounted) return

      if (error) {
        setErrorMessage('Sesi login tidak dapat diperiksa. Silakan coba lagi.')
        setLoading(false)
        return
      }

      setSession(data.session)
      if (data.session?.user) await loadProfile(data.session.user.id)
      setLoading(false)
    }

    initialize()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      if (!mounted) return
      setSession(nextSession)

      if (nextSession?.user) {
        await loadProfile(nextSession.user.id)
      } else {
        setProfile(null)
      }
      setLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session || !profile) return
    if (!allowedPages.includes(activePage)) setActivePage('dashboard')
  }, [allowedPages, activePage, profile, session])

  useEffect(() => {
    if (!session || !profile || activePage !== 'dashboard') return

    const loadStats = async () => {
      setStatsLoading(true)
      const [vehicles, activeVehicles, inService, pendingRequests] = await Promise.all([
        supabase.from('kendaraan').select('id', { count: 'exact', head: true }),
        supabase.from('kendaraan').select('id', { count: 'exact', head: true }).eq('status', 'ACTIVE'),
        supabase.from('kendaraan').select('id', { count: 'exact', head: true }).eq('status', 'SERVICE'),
        supabase.from('permintaan_service').select('id', { count: 'exact', head: true }).in('status', ['MENUNGGU_TRANSPORT', 'DITERIMA_TRANSPORT', 'MENUNGGU_APPROVAL']),
      ])

      const responses = [vehicles, activeVehicles, inService, pendingRequests]
      const firstError = responses.find((result) => result.error)?.error
      if (firstError) {
        console.warn('Dashboard data belum dapat dimuat:', firstError.message)
      }

      setStats({
        vehicles: vehicles.count || 0,
        activeVehicles: activeVehicles.count || 0,
        inService: inService.count || 0,
        pendingRequests: pendingRequests.count || 0,
      })
      setStatsLoading(false)
    }

    loadStats()
  }, [activePage, profile, session])

  const loadProfile = async (userId) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, nama_lengkap, email, nomor_hp, role, aktif')
      .eq('id', userId)
      .single()

    if (error) {
      console.error('Profile error:', error)
      setProfile(null)
      setErrorMessage('Akun berhasil login, tetapi profil pengguna tidak dapat dimuat.')
      return
    }

    if (!data.aktif) {
      await supabase.auth.signOut()
      setProfile(null)
      setSession(null)
      setErrorMessage('Akun ini sedang dinonaktifkan. Hubungi administrator.')
      return
    }

    setProfile(data)
    setErrorMessage('')
  }

  const handleLogin = async (event) => {
    event.preventDefault()
    setErrorMessage('')
    const cleanEmail = email.trim().toLowerCase()

    if (!cleanEmail || !password) {
      setErrorMessage('Email dan password wajib diisi.')
      return
    }

    setSubmitting(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password })

    if (error || !data.user) {
      setErrorMessage('Email atau password tidak sesuai.')
      setSubmitting(false)
      return
    }

    if (rememberMe) localStorage.setItem(REMEMBERED_EMAIL_KEY, cleanEmail)
    else localStorage.removeItem(REMEMBERED_EMAIL_KEY)

    setPassword('')
    await loadProfile(data.user.id)
    setSubmitting(false)
  }

  const handleLogout = async () => {
    setSubmitting(true)
    await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
    setSubmitting(false)
  }

  const handleNavigation = (page) => {
    if (!allowedPages.includes(page)) return
    setActivePage(page)
    setSidebarOpen(false)
  }

  if (loading) {
    return (
      <main className="auth-shell">
        <div className="loading-card">
          <div className="loading-spinner" aria-hidden="true" />
          <p>Memuat Sistem Transport...</p>
        </div>
      </main>
    )
  }

  if (!session || !profile) {
    return (
      <main className="auth-shell">
        <section className="login-card" aria-label="Form login Sistem Transport">
          <div className="brand-mark">ZT</div>
          <span className="eyebrow">PT ZAMAN TEKNINDO</span>
          <h1>Masuk ke Sistem Transport</h1>
          <p className="subtitle">Kelola kendaraan, service, sewa, dan operasional transport secara terpusat.</p>

          <form onSubmit={handleLogin} noValidate>
            <label htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nama@zamanteknindo.co.id" disabled={submitting} />

            <label htmlFor="password">Password</label>
            <div className="password-field">
              <input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Masukkan password" disabled={submitting} />
              <button type="button" className="password-toggle" onClick={() => setShowPassword((current) => !current)} disabled={submitting}>
                {showPassword ? 'Sembunyikan' : 'Lihat'}
              </button>
            </div>

            <label className="remember-option">
              <input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} disabled={submitting} />
              <span>Ingat email di perangkat ini</span>
            </label>

            {errorMessage && <div className="error-message" role="alert">{errorMessage}</div>}
            <button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Memproses login...' : 'Masuk'}</button>
          </form>

          <p className="security-note">Password tidak disimpan di perangkat. Sesi login dikelola oleh Supabase Auth.</p>
        </section>
      </main>
    )
  }

  return (
    <div className="dashboard-layout">
      {sidebarOpen && <button className="sidebar-overlay" aria-label="Tutup menu" onClick={() => setSidebarOpen(false)} />}

      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-mark small">ZT</div>
          <div>
            <strong>Zaman Teknindo</strong>
            <span>Transport System</span>
          </div>
        </div>

        <div className="nav-section-label">MENU UTAMA</div>
        <nav className="sidebar-nav" aria-label="Navigasi utama">
          {visibleNavItems.map((item) => (
            <button key={item.id} className={`nav-item ${activePage === item.id ? 'active' : ''}`} onClick={() => handleNavigation(item.id)}>
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="user-mini">
            <div className="avatar">{(profile.nama_lengkap || profile.email || 'U').charAt(0).toUpperCase()}</div>
            <div className="user-mini-text">
              <strong>{profile.nama_lengkap || 'Pengguna'}</strong>
              <span>{ROLE_LABELS[profile.role] || profile.role}</span>
            </div>
          </div>
          <button className="logout-button" onClick={handleLogout} disabled={submitting}>Keluar</button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button className="menu-button" onClick={() => setSidebarOpen(true)} aria-label="Buka menu">☰</button>
          <div>
            <span className="topbar-label">SISTEM TRANSPORT</span>
            <h1>{NAV_ITEMS.find((item) => item.id === activePage)?.label || 'Dashboard'}</h1>
          </div>
          <div className="topbar-user">
            <div className="avatar">{(profile.nama_lengkap || profile.email || 'U').charAt(0).toUpperCase()}</div>
            <div>
              <strong>{profile.nama_lengkap || profile.email}</strong>
              <span>{ROLE_LABELS[profile.role] || profile.role}</span>
            </div>
          </div>
        </header>

        <div className="content-container">
          {activePage === 'dashboard' ? (
            <DashboardHome profile={profile} stats={stats} statsLoading={statsLoading} onNavigate={handleNavigation} />
          ) : (
            <ModulePlaceholder title={NAV_ITEMS.find((item) => item.id === activePage)?.label || 'Modul'} role={profile.role} />
          )}
        </div>
      </main>
    </div>
  )
}

function DashboardHome({ profile, stats, statsLoading, onNavigate }) {
  const today = new Intl.DateTimeFormat('id-ID', { dateStyle: 'full' }).format(new Date())

  return (
    <>
      <section className="page-intro">
        <div>
          <span className="eyebrow">{today}</span>
          <h2>Selamat datang, {profile.nama_lengkap || 'Pengguna'}</h2>
          <p>Pantau kondisi kendaraan dan aktivitas transport dari satu tempat.</p>
        </div>
      </section>

      <section className="stats-grid" aria-label="Ringkasan transport">
        {STAT_DEFINITIONS.map((item) => (
          <article className="stat-card" key={item.key}>
            <div className="stat-icon">{item.icon}</div>
            <div>
              <span>{item.label}</span>
              <strong>{statsLoading ? '...' : stats[item.key]}</strong>
              <small>{item.helper}</small>
            </div>
          </article>
        ))}
      </section>

      <section className="dashboard-grid">
        <article className="panel quick-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">AKSES CEPAT</span>
              <h3>Menu yang sering digunakan</h3>
            </div>
          </div>
          <div className="quick-grid">
            <button className="quick-action" onClick={() => onNavigate('pengajuan')}>
              <span>↗</span>
              <strong>Ajukan Service</strong>
              <small>Buat permintaan untuk kendaraan</small>
            </button>
            <button className="quick-action" onClick={() => onNavigate('kendaraan')}>
              <span>▣</span>
              <strong>Data Kendaraan</strong>
              <small>Lihat armada dan kilometer</small>
            </button>
            <button className="quick-action" onClick={() => onNavigate('service')}>
              <span>⚙</span>
              <strong>Proses Service</strong>
              <small>Pantau pekerjaan dan biaya</small>
            </button>
            <button className="quick-action" onClick={() => onNavigate('dokumen')}>
              <span>□</span>
              <strong>Dokumen</strong>
              <small>Kelola STNK, KIR, dan lainnya</small>
            </button>
          </div>
        </article>

        <article className="panel flow-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">ALUR UTAMA</span>
              <h3>Permintaan service</h3>
            </div>
          </div>
          <div className="flow-list">
            <FlowStep number="1" title="Operasional" text="Membuat permintaan" />
            <FlowStep number="2" title="Transport" text="Memeriksa dan memproses" />
            <FlowStep number="3" title="Approval" text="Persetujuan sesuai nilai" />
            <FlowStep number="4" title="Service" text="Pengerjaan dan bukti" />
            <FlowStep number="5" title="Selesai" text="Data dan biaya tersimpan" />
          </div>
        </article>
      </section>
    </>
  )
}

function FlowStep({ number, title, text }) {
  return (
    <div className="flow-step">
      <div className="flow-number">{number}</div>
      <div>
        <strong>{title}</strong>
        <span>{text}</span>
      </div>
    </div>
  )
}

function ModulePlaceholder({ title, role }) {
  return (
    <section className="module-empty">
      <div className="empty-icon">▤</div>
      <span className="eyebrow">MODUL {title.toUpperCase()}</span>
      <h2>{title}</h2>
      <p>Fondasi akses dan navigasi untuk modul ini sudah aktif. Fitur transaksi akan dibangun berdasarkan alur kerja Transport yang telah ditetapkan.</p>
      <div className="empty-note">
        <strong>Role aktif: {ROLE_LABELS[role] || role}</strong>
        <span>Hak akses modul mengikuti role akun dan kebijakan RLS Supabase.</span>
      </div>
    </section>
  )
}

export default App
