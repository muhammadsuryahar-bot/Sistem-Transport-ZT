import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import logoLogin from '../assets/logo-login.png'
import './LoginPage.css'

const REMEMBER_EMAIL_KEY = 'transport_remember_email'

export default function LoginPage({ message = '' }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberEmail, setRememberEmail] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const saved = localStorage.getItem(REMEMBER_EMAIL_KEY)
    if (saved) setEmail(saved)
  }, [])

  useEffect(() => {
    setError(message || '')
  }, [message])

  const submit = async event => {
    event.preventDefault()
    setError('')

    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail || !password) {
      setError('Email dan password wajib diisi.')
      return
    }

    setLoading(true)
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    })

    if (loginError) {
      setError('Email atau password tidak sesuai. Silakan periksa kembali.')
    } else if (rememberEmail) {
      localStorage.setItem(REMEMBER_EMAIL_KEY, normalizedEmail)
    } else {
      localStorage.removeItem(REMEMBER_EMAIL_KEY)
    }

    setLoading(false)
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-label="Login Sistem Transport">
        <div className="login-brand">
          <img src={logoLogin} alt="PT Zaman Teknindo" />
          <div>
            <strong>PT ZAMAN TEKNINDO</strong>
            <span>Sistem Transport</span>
          </div>
        </div>

        <div className="login-heading">
          <span className="eyebrow">AKSES SISTEM</span>
          <h1>Selamat datang</h1>
          <p>Masuk untuk mengelola kendaraan, service, dokumen, dan rental.</p>
        </div>

        {error && <div className="login-alert" role="alert">{error}</div>}

        <form onSubmit={submit} className="login-form">
          <label>
            Email
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={event => setEmail(event.target.value)}
              placeholder="nama@perusahaan.com"
              disabled={loading}
              required
            />
          </label>

          <label>
            Password
            <div className="login-password-wrap">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                placeholder="Masukkan password"
                disabled={loading}
                required
              />
              <button
                type="button"
                className="login-password-toggle"
                onClick={() => setShowPassword(value => !value)}
                aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                disabled={loading}
              >
                {showPassword ? 'Sembunyikan' : 'Lihat'}
              </button>
            </div>
          </label>

          <label className="login-check">
            <input
              type="checkbox"
              checked={rememberEmail}
              onChange={event => setRememberEmail(event.target.checked)}
              disabled={loading}
            />
            <span>Ingat email di perangkat ini</span>
          </label>

          <button className="login-submit" type="submit" disabled={loading}>
            {loading ? 'Memproses login…' : 'Masuk ke Sistem'}
          </button>
        </form>

        <p className="login-footnote">Untuk keamanan, password tidak disimpan di perangkat.</p>
      </section>
    </main>
  )
}
