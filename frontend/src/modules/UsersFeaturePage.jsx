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

  const summary = useMemo(() => ({
    total: users.length,
    active: users.filter((user) => user.aktif).length,
    inactive: users.filter((user) => !user.aktif).length,
  }), [users])

  return (
    <div className="x-page">
      <div className="x-head">
        <div>
          <span className="eyebrow">ADMINISTRASI</span>
          <h2>Pengguna Sistem</h2>
          <p>Kelola role dan status akun tanpa risiko memutus akses admin yang sedang aktif.</p>
        </div>
        <button className="x-btn secondary" onClick={load} disabled={loading || saving}>↻ Refresh</button>
      </div>

      {error && <div className="x-alert error">{error}</div>}
      {success && <div className="x-alert">{success}</div>}

      <section className="x-card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
          <div><small>Total Pengguna</small><strong>{summary.total}</strong></div>
          <div><small>Akun Aktif</small><strong>{summary.active}</strong></div>
          <div><small>Akun Nonaktif</small><strong>{summary.inactive}</strong></div>
        </div>
      </section>

      <section className="x-card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) 180px 160px', gap: 10 }}>
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
          {loading ? (
            <div className="x-empty">Memuat pengguna...</div>
          ) : (
            <table className="x-table">
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
                    <td><span className="x-pill">{user.aktif ? 'Aktif' : 'Nonaktif'}</span></td>
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
          )}
        </div>
      </section>
    </div>
  )
}
