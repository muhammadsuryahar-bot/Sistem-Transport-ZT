import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import KendaraanPage from './modules/KendaraanPage'
import PermintaanServicePage from './modules/PermintaanServicePage'
import DashboardFeaturePage from './modules/DashboardFeaturePage'
import { ServicePage, RentalPage, DocumentsPage, ReportsPage, UsersPage } from './modules/TransportOperationsPage'
import './App.css'

const REMEMBERED_EMAIL_KEY = 'transport_remembered_email'
const LOGO_BASE_URL = 'https://raw.githubusercontent.com/muhammadsuryahar-bot/Sistem-Transport-ZT/main/frontend/src/assets'
const LOGO_LOGIN_URL = `${LOGO_BASE_URL}/logo-login.png`
const LOGO_MARK_URL = `${LOGO_BASE_URL}/logo.png`

const ROLE_LABELS = { ADMIN: 'Administrator', TRANSPORT: 'Transport', OPERASIONAL: 'Operasional', ATASAN_TRANSPORT: 'Atasan Transport', DIREKTUR: 'Direktur', AKUNTANSI: 'Akuntansi' }
const ROLE_ACCESS = {
  ADMIN: ['dashboard', 'kendaraan', 'pengajuan', 'service', 'sewa', 'dokumen', 'laporan', 'pengguna'],
  TRANSPORT: ['dashboard', 'kendaraan', 'pengajuan', 'service', 'sewa', 'dokumen', 'laporan'],
  OPERASIONAL: ['dashboard', 'pengajuan'],
  ATASAN_TRANSPORT: ['dashboard', 'pengajuan', 'service', 'laporan'],
  DIREKTUR: ['dashboard', 'service', 'laporan'],
  AKUNTANSI: ['dashboard', 'sewa', 'laporan'],
}
const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'kendaraan', label: 'Kendaraan', icon: 'vehicle' },
  { id: 'pengajuan', label: 'Pengajuan Service', icon: 'request' },
  { id: 'service', label: 'Service & Perbaikan', icon: 'service' },
  { id: 'sewa', label: 'Kendaraan Sewa', icon: 'rental' },
  { id: 'dokumen', label: 'Dokumen', icon: 'document' },
  { id: 'laporan', label: 'Laporan', icon: 'report' },
  { id: 'pengguna', label: 'Pengguna', icon: 'user' },
]

function AppTransport() {
  const [session, setSession] = useState(null), [profile, setProfile] = useState(null), [loading, setLoading] = useState(true), [activePage, setActivePage] = useState('dashboard'), [sidebarOpen, setSidebarOpen] = useState(false)
  const [email, setEmail] = useState(() => localStorage.getItem(REMEMBERED_EMAIL_KEY) || ''), [password, setPassword] = useState(''), [showPassword, setShowPassword] = useState(false), [rememberMe, setRememberMe] = useState(true), [submitting, setSubmitting] = useState(false), [errorMessage, setErrorMessage] = useState('')
  const allowedPages = useMemo(() => ROLE_ACCESS[profile?.role] || ['dashboard'], [profile?.role])
  const visibleNavItems = useMemo(() => NAV_ITEMS.filter((item) => allowedPages.includes(item.id)), [allowedPages])

  const loadProfile = async (userId) => { const { data, error } = await supabase.from('profiles').select('id,nama_lengkap,email,nomor_hp,role,aktif').eq('id', userId).single(); if (error || !data) { console.error('Profile error:', error); setProfile(null); setErrorMessage('Profil pengguna tidak dapat dimuat.'); return } if (!data.aktif) { await supabase.auth.signOut(); setSession(null); setProfile(null); setErrorMessage('Akun ini sedang dinonaktifkan. Hubungi administrator.'); return } setProfile(data); setErrorMessage('') }
  useEffect(() => { let mounted = true; const initialize = async () => { const { data, error } = await supabase.auth.getSession(); if (!mounted) return; if (error) setErrorMessage('Sesi login tidak dapat diperiksa. Silakan coba lagi.'); setSession(data.session); if (data.session?.user) await loadProfile(data.session.user.id); setLoading(false) }; initialize(); const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, nextSession) => { if (!mounted) return; setSession(nextSession); if (nextSession?.user) await loadProfile(nextSession.user.id); else setProfile(null) }); return () => { mounted = false; subscription.unsubscribe() } }, [])
  useEffect(() => { if (session && profile && !allowedPages.includes(activePage)) setActivePage('dashboard') }, [activePage, allowedPages, profile, session])

  const handleLogin = async (event) => { event.preventDefault(); setErrorMessage(''); const cleanEmail = email.trim().toLowerCase(); if (!cleanEmail || !password) { setErrorMessage('Email dan password wajib diisi.'); return } setSubmitting(true); const { data, error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password }); if (error || !data.user) { setErrorMessage('Email atau password tidak sesuai.'); setSubmitting(false); return } if (rememberMe) localStorage.setItem(REMEMBERED_EMAIL_KEY, cleanEmail); else localStorage.removeItem(REMEMBERED_EMAIL_KEY); setPassword(''); await loadProfile(data.user.id); setSubmitting(false) }
  const handleLogout = async () => { setSubmitting(true); await supabase.auth.signOut(); setSession(null); setProfile(null); setActivePage('dashboard'); setSubmitting(false) }

  if (loading) return <main className="auth-shell"><div className="loading-card"><div className="loading-brand"><span className="loading-brand-mark"><img src={LOGO_MARK_URL} alt=""/></span><span>Sistem Transport</span></div><div className="loading-spinner"/><p>Memuat sistem...</p></div></main>
  if (!session || !profile) return <main className="auth-shell"><section className="login-card"><div className="login-visual"><img src={LOGO_LOGIN_URL} alt="PT Zaman Teknindo"/><span className="login-visual-label">SISTEM TRANSPORT</span><strong>Operasional kendaraan lebih tertata.</strong><p>Kelola armada, service, sewa, dokumen, dan laporan dari satu sistem.</p><div className="login-visual-note">Akses sesuai peran pengguna</div></div><div className="login-panel"><div className="login-brand-mobile"><img src={LOGO_LOGIN_URL} alt="PT Zaman Teknindo"/></div><span className="eyebrow">PT ZAMAN TEKNINDO</span><h1>Masuk ke Sistem Transport</h1><p className="subtitle">Gunakan akun perusahaan untuk melanjutkan.</p><form onSubmit={handleLogin} noValidate><label htmlFor="email">Email</label><input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@zamanteknindo.co.id" disabled={submitting}/><label htmlFor="password">Password</label><div className="password-wrap"><input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Masukkan password" disabled={submitting}/><button type="button" className="password-toggle" onClick={() => setShowPassword((v) => !v)} disabled={submitting}>{showPassword ? 'Sembunyikan' : 'Lihat'}</button></div><label className="remember-option"><input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} disabled={submitting}/><span>Ingat email di perangkat ini</span></label>{errorMessage && <div className="error-message" role="alert">{errorMessage}</div>}<button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Memproses login...' : 'Masuk'}</button></form><p className="security-note">Password tidak disimpan di perangkat. Sesi login dikelola oleh Supabase Auth.</p></div></section></main>

  const pageContent = { dashboard: <DashboardFeaturePage profile={profile} onNavigate={setActivePage}/>, kendaraan: <KendaraanPage />, pengajuan: <PermintaanServicePage profile={profile}/>, service: <ServicePage profile={profile}/>, sewa: <RentalPage profile={profile}/>, dokumen: <DocumentsPage profile={profile}/>, laporan: <ReportsPage />, pengguna: <UsersPage /> }
  return <div className="dashboard-layout">{sidebarOpen && <button className="sidebar-overlay" onClick={() => setSidebarOpen(false)} aria-label="Tutup menu"/>}<aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}><div className="sidebar-brand"><div className="sidebar-brand-mark"><img src={LOGO_MARK_URL} alt=""/></div><div className="sidebar-brand-copy"><strong>PT ZAMAN TEKNINDO</strong><span>Sistem Transport</span></div></div><div className="nav-section-label">MENU UTAMA</div><nav className="sidebar-nav" aria-label="Navigasi utama">{visibleNavItems.map((item) => <button key={item.id} className={`nav-item ${activePage === item.id ? 'active' : ''}`} onClick={() => { setActivePage(item.id); setSidebarOpen(false) }}><span className="nav-icon" data-icon={item.icon} aria-hidden="true"/><span>{item.label}</span></button>)}</nav><div className="sidebar-bottom"><div className="user-mini"><div className="avatar">{(profile.nama_lengkap || profile.email || 'U').charAt(0).toUpperCase()}</div><div className="user-mini-text"><strong>{profile.nama_lengkap || 'Pengguna'}</strong><span>{ROLE_LABELS[profile.role] || profile.role}</span></div></div><button className="logout-button" onClick={handleLogout} disabled={submitting}>Keluar</button></div></aside><main className="main-content"><header className="topbar"><button className="menu-button" onClick={() => setSidebarOpen(true)} aria-label="Buka menu">☰</button><div><span className="topbar-label">SISTEM TRANSPORT</span><h1>{NAV_ITEMS.find((item) => item.id === activePage)?.label || 'Dashboard'}</h1></div><div className="topbar-user"><div className="avatar">{(profile.nama_lengkap || profile.email || 'U').charAt(0).toUpperCase()}</div><div><strong>{profile.nama_lengkap || profile.email}</strong><span>{ROLE_LABELS[profile.role] || profile.role}</span></div></div></header><div className="content-container">{pageContent[activePage] || pageContent.dashboard}</div></main></div>
}

export default AppTransport
