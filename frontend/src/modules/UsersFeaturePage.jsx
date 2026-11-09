import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import './TransportOperationsFixed.css'
import './UsersFeaturePage.css'
import PageBreadcrumb from './PageBreadcrumb.jsx'
import AuditTrailPanel from './AuditTrailPanel.jsx'
import DataQualityPanel from './DataQualityPanel.jsx'

const ROLES = ['ADMIN', 'TRANSPORT', 'OPERASIONAL', 'ATASAN_TRANSPORT', 'DIREKTUR', 'AKUNTANSI']
const LABEL = {
  ADMIN: 'Administrator',
  TRANSPORT: 'Transport',
  OPERASIONAL: 'Operasional',
  ATASAN_TRANSPORT: 'Atasan Transport',
  DIREKTUR: 'Direktur',
  AKUNTANSI: 'Akuntansi',
}

export default function UsersFeaturePage({ profile }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [view, setView] = useState('users')
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inviteName, setInviteName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('OPERASIONAL')
  const [inviting, setInviting] = useState(false)

  const canEdit = profile?.role === 'ADMIN'

  const load = async () => {
    setLoading(true)
    setError('')
    const { data, error: fetchError } = await supabase
      .from('profiles')
      .select('id,nama_lengkap,email,nomor_hp,role,aktif,created_at')
      .order('nama_lengkap')

    if (fetchError) {
      setError('Data pengguna tidak dapat dimuat. Silakan Refresh kembali.')
      setUsers([])
    } else {
      setUsers(data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const change = async (id, patch) => {
    if (!canEdit || saving) return

    if (id === profile?.id && Object.prototype.hasOwnProperty.call(patch, 'aktif') && patch.aktif === false) {
      setError('Akun yang sedang digunakan tidak boleh dinonaktifkan sendiri.')
      return
    }

    if (id === profile?.id && Object.prototype.hasOwnProperty.call(patch, 'role') && patch.role !== profile.role) {
      setError('Role akun yang sedang digunakan tidak boleh diubah dari sesi ini.')
      return
    }

    setSaving(true)
    setError('')
    setSuccess('')

    const { data: updatedUser, error: updateError } = await supabase.from('profiles').update(patch).eq('id', id).select('id,nama_lengkap,email,nomor_hp,role,aktif,created_at').single()

    if (updateError) {
      setError('Perubahan pengguna gagal disimpan. Periksa hak akses atau koneksi sistem.')
    } else {
      setUsers(current => current.map(user => user.id === id ? { ...user, ...updatedUser } : user))
      setSuccess('Perubahan pengguna tersimpan.')
    }

    setSaving(false)
  }

  const inviteUser = async event => {
    event.preventDefault()
    if (!canEdit || inviting) return

    const namaLengkap = inviteName.trim()
    const email = inviteEmail.trim().toLowerCase()
    if (!namaLengkap || namaLengkap.length < 2 || namaLengkap.length > 100) {
      setError('Nama lengkap harus berisi 2 sampai 100 karakter.')
      return
    }
    if (!email.endsWith('@zamanteknindo.com')) {
      setError('Undangan hanya dapat dikirim ke email perusahaan @zamanteknindo.com.')
      return
    }
    if (!ROLES.includes(inviteRole)) {
      setError('Role pengguna tidak valid.')
      return
    }

    setInviting(true)
    setError('')
    setSuccess('')
    try {
      const { data, error: inviteError } = await supabase.functions.invoke('invite-transport-user', {
        body: { fullName: namaLengkap, email, role: inviteRole },
      })
      if (inviteError) {
        console.error('User invitation failed:', inviteError)
        throw new Error('Undangan gagal dikirim. Pastikan fungsi undangan aktif dan konfigurasi Custom SMTP Supabase sudah benar.')
      }
      if (data?.error) throw new Error(data.error)

      setSuccess(`Undangan untuk ${email} berhasil dikirim dengan role ${LABEL[inviteRole]}.`)
      setInviteName('')
      setInviteEmail('')
      setInviteRole('OPERASIONAL')
      setShowInviteForm(false)
      await load()
    } catch (inviteFailure) {
      console.error('User invitation failed:', inviteFailure)
      setError(inviteFailure instanceof Error ? inviteFailure.message : 'Undangan pengguna gagal dikirim. Silakan periksa konfigurasi email dan coba kembali.')
    } finally {
      setInviting(false)
    }
  }

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase()
    return users.filter((user) => {
      const matchesSearch = !term || [user.nama_lengkap, user.email, user.nomor_hp].some((value) => String(value || '').toLowerCase().includes(term))
      const matchesRole = roleFilter === 'ALL' || user.role === roleFilter
      const matchesStatus = statusFilter === 'ALL' || (statusFilter === 'ACTIVE' ? user.aktif : !user.aktif)
      return matchesSearch && matchesRole && matchesStatus
    })
  }, [users, search, roleFilter, statusFilter])

  const isSingleAccount = users.length <= 1
  const currentUser = users.find((user) => user.id === profile?.id) || users[0]

  return (
    <div className="x-page users-page">
      <PageBreadcrumb items={['Transport', 'Pengguna', view === 'audit' && canEdit ? 'Riwayat Perubahan' : view === 'quality' && canEdit ? 'Kualitas Data' : null]} />
      <div className="x-head users-head">
        <div>
          <span className="eyebrow">ADMINISTRASI</span>
          <h2>{view === 'audit' && canEdit ? 'Riwayat Perubahan' : view === 'quality' && canEdit ? 'Kualitas Data' : 'Pengguna'}</h2>
          <p>{view === 'audit' && canEdit ? 'Pantau siapa yang mengubah data penting, kapan perubahan dilakukan, dan field apa yang berubah.' : view === 'quality' && canEdit ? 'Periksa integritas data secara read-only sebelum melakukan perubahan atau testing.' : 'Kelola akun yang digunakan untuk masuk ke Sistem Transport PT Zaman Teknindo.'}</p>
        </div>
        {view === 'users' && (
          <div className="x-head-actions">
            {canEdit && (
              <button
                className="x-btn primary"
                type="button"
                onClick={() => { setShowInviteForm(current => !current); setError('') }}
                aria-expanded={showInviteForm}
                aria-controls="users-invite-form"
                disabled={saving || inviting}
              >
                {showInviteForm ? 'Tutup Form Undangan' : '+ Undang Pengguna'}
              </button>
            )}
            <button className="x-btn secondary" onClick={load} disabled={loading || saving || inviting}>↻ Refresh</button>
          </div>
        )}
      </div>

      {error && <div className="x-alert error">{error}</div>}
      {success && <div className="x-alert">{success}</div>}

      <div className="x-tabs users-tabs">
        <button type="button" className={view === 'users' ? 'active' : ''} onClick={() => setView('users')}>Pengguna</button>
        {canEdit && <button type="button" className={view === 'audit' ? 'active' : ''} onClick={() => setView('audit')}>Riwayat Perubahan</button>}
        {canEdit && <button type="button" className={view === 'quality' ? 'active' : ''} onClick={() => setView('quality')}>Kualitas Data</button>}
      </div>

      {showInviteForm && canEdit && view === 'users' && (
        <section className="x-card users-invite-card" id="users-invite-form">
          <div className="x-card-title">
            <div>
              <h3>Undang Pengguna Baru</h3>
              <p>Undangan hanya untuk email perusahaan. Pengguna akan menerima tautan untuk mengatur akses akunnya.</p>
            </div>
          </div>
          <form className="users-invite-form" onSubmit={inviteUser}>
            <label>
              Nama Lengkap
              <input
                className="x-filter"
                value={inviteName}
                onChange={event => setInviteName(event.target.value)}
                placeholder="Nama sesuai identitas"
                maxLength={100}
                autoComplete="name"
                required
                disabled={inviting}
              />
            </label>
            <label>
              Email Perusahaan
              <input
                className="x-filter"
                type="email"
                value={inviteEmail}
                onChange={event => setInviteEmail(event.target.value)}
                placeholder="nama@zamanteknindo.com"
                autoComplete="email"
                required
                disabled={inviting}
              />
            </label>
            <label>
              Role Pengguna
              <select
                className="x-filter"
                value={inviteRole}
                onChange={event => setInviteRole(event.target.value)}
                disabled={inviting}
              >
                {ROLES.map(role => <option key={role} value={role}>{LABEL[role]}</option>)}
              </select>
            </label>
            <div className="users-invite-actions">
              <button type="button" className="x-btn secondary" onClick={() => setShowInviteForm(false)} disabled={inviting}>Batal</button>
              <button type="submit" className="x-btn primary" disabled={inviting || !inviteName.trim() || !inviteEmail.trim()}>
                {inviting ? 'Mengirim Undangan…' : 'Kirim Undangan'}
              </button>
            </div>
            <p className="users-invite-help">Password tidak dibuat atau disimpan oleh aplikasi. Pastikan layanan Custom SMTP Supabase siap sebelum mengirim undangan.</p>
          </form>
        </section>
      )}

      {view === 'audit' && canEdit ? <AuditTrailPanel users={users} /> : view === 'quality' && canEdit ? <DataQualityPanel /> : loading ? (
        <section className="x-card users-loading-card">
          <div className="x-empty">Memuat data akun...</div>
        </section>
      ) : isSingleAccount ? (
        <section className="x-card users-account-card">
          <div className="users-account-top">
            <div className="users-avatar" aria-hidden="true">
              {(currentUser?.nama_lengkap || 'U').trim().charAt(0).toUpperCase()}
            </div>
            <div className="users-account-heading">
              <span className="users-label">AKUN SISTEM SAAT INI</span>
              <h3>{currentUser?.nama_lengkap || 'Pengguna Sistem'}</h3>
              <p>{currentUser?.email || '-'}</p>
            </div>
            <span className={`users-status ${currentUser?.aktif ? 'active' : 'inactive'}`}>
              {currentUser?.aktif ? 'Aktif' : 'Nonaktif'}
            </span>
          </div>

          <div className="users-account-grid">
            <div className="users-info-item">
              <span>Role</span>
              <strong>{LABEL[currentUser?.role] || currentUser?.role || '-'}</strong>
            </div>
            <div className="users-info-item">
              <span>Nomor HP</span>
              <strong>{currentUser?.nomor_hp || '-'}</strong>
            </div>
            <div className="users-info-item">
              <span>Status akses</span>
              <strong>{currentUser?.aktif ? 'Memiliki akses ke sistem' : 'Tidak memiliki akses'}</strong>
            </div>
            <div className="users-info-item">
              <span>Penggunaan akun</span>
              <strong>Satu akun untuk satu pengguna</strong>
            </div>
          </div>

          <div className="users-account-note">
            <b>Catatan</b>
            <span>Untuk saat ini sistem memiliki satu akun. Struktur role tetap disiapkan agar akun terpisah dapat ditambahkan kemudian untuk bagian Transport, Operasional, Atasan, Direktur, atau Akuntansi.</span>
          </div>
        </section>
      ) : (
        <>
                     <section className="x-card users-summary-card">
             <button type="button" className="users-summary-item users-summary-clickable" onClick={() => { setStatusFilter('ALL'); setRoleFilter('ALL'); setView('users'); requestAnimationFrame(() => document.querySelector('.users-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' })) }}><span>Total akun</span><strong>{users.length}</strong><i aria-hidden="true">›</i></button>
             <button type="button" className="users-summary-item users-summary-clickable" onClick={() => { setStatusFilter('ACTIVE'); setView('users'); requestAnimationFrame(() => document.querySelector('.users-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' })) }}><span>Akun aktif</span><strong>{users.filter((user) => user.aktif).length}</strong><i aria-hidden="true">›</i></button>
             <button type="button" className="users-summary-item users-summary-clickable" onClick={() => { setStatusFilter('INACTIVE'); setView('users'); requestAnimationFrame(() => document.querySelector('.users-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' })) }}><span>Akun nonaktif</span><strong>{users.filter((user) => !user.aktif).length}</strong><i aria-hidden="true">›</i></button>
           </section>

          <section className="x-card users-filter-card">
            <div className="users-filter-grid">
              <input
                className="x-filter"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari nama, email, atau nomor HP..."
                aria-label="Cari pengguna"
              />
              <select className="x-filter" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} aria-label="Filter role">
                <option value="ALL">Semua role</option>
                {ROLES.map((role) => <option key={role} value={role}>{LABEL[role]}</option>)}
              </select>
              <select className="x-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter status">
                <option value="ALL">Semua status</option>
                <option value="ACTIVE">Aktif</option>
                <option value="INACTIVE">Nonaktif</option>
              </select>
            </div>
          </section>

          <section className="x-card">
            <div className="x-table-wrap">
              <table className="x-table users-table">
                <thead>
                  <tr><th>Pengguna</th><th>Kontak</th><th>Role</th><th>Status</th><th>Aksi</th></tr>
                </thead>
                <tbody>
                  {filteredUsers.length ? filteredUsers.map((user) => (
                    <tr key={user.id}>
                      <td><b>{user.nama_lengkap || '-'}</b><small>{user.email}</small></td>
                      <td>{user.nomor_hp || '-'}</td>
                      <td>
                        {canEdit ? (
                          <select
                            className="x-filter"
                            value={user.role}
                            disabled={saving || user.id === profile?.id}
                            onChange={(event) => change(user.id, { role: event.target.value })}
                            aria-label={`Role ${user.nama_lengkap || user.email}`}
                          >
                            {ROLES.map((role) => <option key={role} value={role}>{LABEL[role]}</option>)}
                          </select>
                        ) : LABEL[user.role] || user.role}
                      </td>
                      <td><span className={`users-status ${user.aktif ? 'active' : 'inactive'}`}>{user.aktif ? 'Aktif' : 'Nonaktif'}</span></td>
                      <td>
                        {canEdit && (
                          <button
                            className="x-link"
                            disabled={saving || user.id === profile?.id}
                            onClick={() => change(user.id, { aktif: !user.aktif })}
                          >
                            {user.id === profile?.id ? 'Akun aktif' : (user.aktif ? 'Nonaktifkan' : 'Aktifkan')}
                          </button>
                        )}
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan="5"><div className="x-empty">Tidak ada pengguna yang sesuai filter.</div></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
