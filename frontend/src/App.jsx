import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import './App.css'

const ROLE_LABELS = {
  ADMIN: 'Administrator',
  TRANSPORT: 'Transport',
  OPERASIONAL: 'Operasional',
  ATASAN_TRANSPORT: 'Atasan Transport',
  DIREKTUR: 'Direktur',
  AKUNTANSI: 'Akuntansi',
}

function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let mounted = true

    const loadSession = async () => {
      const { data, error } = await supabase.auth.getSession()

      if (!mounted) return

      if (error) {
        setErrorMessage('Sesi login tidak dapat diperiksa. Silakan coba lagi.')
        setLoading(false)
        return
      }

      setSession(data.session)

      if (data.session?.user) {
        await loadProfile(data.session.user.id)
      }

      setLoading(false)
    }

    loadSession()

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

    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    })

    if (error) {
      console.error('Login error:', error)
      setErrorMessage('Email atau password tidak sesuai.')
      setSubmitting(false)
      return
    }

    if (!data.user) {
      setErrorMessage('Login gagal. Pengguna tidak ditemukan.')
      setSubmitting(false)
      return
    }

    // Supabase browser client already persists the session by default.
    // rememberMe is kept for the future UX setting; we do not store passwords locally.
    if (!rememberMe) {
      sessionStorage.setItem('transport_session_preference', 'session-only')
    } else {
      sessionStorage.removeItem('transport_session_preference')
    }

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

  if (session && profile) {
    return (
      <main className="app-shell">
        <section className="welcome-card">
          <span className="eyebrow">SISTEM TRANSPORT</span>
          <h1>Selamat datang, {profile.nama_lengkap || profile.email}</h1>
          <p className="welcome-text">
            Login berhasil. Akun kamu terdaftar sebagai{' '}
            <strong>{ROLE_LABELS[profile.role] || profile.role}</strong>.
          </p>

          <div className="profile-grid">
            <div>
              <span>Nama</span>
              <strong>{profile.nama_lengkap || '-'}</strong>
            </div>
            <div>
              <span>Email</span>
              <strong>{profile.email || session.user.email}</strong>
            </div>
            <div>
              <span>Role</span>
              <strong>{ROLE_LABELS[profile.role] || profile.role}</strong>
            </div>
            <div>
              <span>Status</span>
              <strong>Aktif</strong>
            </div>
          </div>

          <div className="next-step-note">
            Dashboard dan modul Transport akan ditempatkan di sini setelah fondasi autentikasi dan hak akses selesai.
          </div>

          <button className="secondary-button" type="button" onClick={handleLogout} disabled={submitting}>
            {submitting ? 'Keluar...' : 'Keluar'}
          </button>
        </section>
      </main>
    )
  }

  return (
    <main className="auth-shell">
      <section className="login-card" aria-label="Form login Sistem Transport">
        <div className="brand-mark" aria-hidden="true">ZT</div>
        <span className="eyebrow">PT ZAMAN TEKNINDO</span>
        <h1>Masuk ke Sistem Transport</h1>
        <p className="subtitle">Kelola kendaraan, service, sewa, dan operasional transport secara terpusat.</p>

        <form onSubmit={handleLogin} noValidate>
          <label htmlFor="email">Email</label>
          <div className="input-wrap">
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="nama@zamanteknindo.co.id"
              disabled={submitting}
            />
          </div>

          <label htmlFor="password">Password</label>
          <div className="input-wrap password-wrap">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Masukkan password"
              disabled={submitting}
            />
            <button
              className="password-toggle"
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
              title={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
              disabled={submitting}
            >
              {showPassword ? 'Sembunyikan' : 'Lihat'}
            </button>
          </div>

          <div className="login-options">
            <label className="remember-option">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.target.checked)}
                disabled={submitting}
              />
              <span>Ingat saya di perangkat ini</span>
            </label>
          </div>

          {errorMessage && (
            <div className="error-message" role="alert">
              {errorMessage}
            </div>
          )}

          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? 'Memproses login...' : 'Masuk'}
          </button>
        </form>

        <p className="security-note">Akses sistem mengikuti akun dan hak akses yang diberikan administrator.</p>
      </section>
    </main>
  )
}

export default App
