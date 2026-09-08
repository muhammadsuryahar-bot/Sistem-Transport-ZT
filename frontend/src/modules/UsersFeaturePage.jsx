import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import './TransportOperationsFixed.css'

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

    const { error: updateError } = await supabase.from('profiles').update(patch).eq('id', id)

    if (updateError) {
      setError('Perubahan pengguna gagal disimpan. Periksa hak akses atau koneksi sistem.')
    } else {
      setSuccess('Perubahan pengguna tersimpan.')
      await load()
    }

    setSaving(false)
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
      <div className="x-head users-head">
        <div>
          <span className="eyebrow">ADMINISTRASI</span>
          <h2>Pengguna</h2>
          <p>Kelola akun yang digunakan untuk masuk ke Sistem Transport PT Zaman Teknindo.</p>
        </div>
        <button className="x-btn secondary" onClick={load} disabled={loading || saving}>↻ Refresh</button>
      </div>

      {error && <div className="x-alert error">{error}</div>}
      {success && <div className="x-alert">{success}</div>}

      {loading ? (
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
            <div className="users-summary-item"><span>Total akun</span><strong>{users.length}</strong></div>
            <div className="users-summary-item"><span>Akun aktif</span><strong>{users.filter((user) => user.aktif).length}</strong></div>
            <div className="users-summary-item"><span>Akun nonaktif</span><strong>{users.filter((user) => !user.aktif).length}</strong></div>
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
