import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const TABLE_LABELS = {
  profiles: 'Pengguna',
  kendaraan: 'Kendaraan',
  dokumen_kendaraan: 'Dokumen Kendaraan',
  permintaan_service: 'Data Service',
  permintaan_service_bukti: 'Bukti Pengajuan',
  service: 'Service',
  service_item: 'Item Service',
  service_bukti: 'Bukti Service',
  service_approval: 'Approval Service',
  riwayat_ban: 'Riwayat Ban',
  riwayat_aki: 'Riwayat Aki',
  riwayat_kilometer: 'Riwayat KM',
  patokan_harga_service: 'Patokan Harga Service',
  pemilik_sewa: 'Pemilik Sewa',
  kontrak_sewa: 'Kontrak Sewa',
  pembayaran_sewa: 'Pembayaran Sewa',
  perbaikan_sewa: 'Perbaikan Sewa',
  potongan_pembayaran_sewa: 'Potongan Pembayaran Sewa',
  rental_historis_excel: 'Summary Rental',
}

const ACTION_LABELS = { INSERT: 'Tambah', UPDATE: 'Ubah', DELETE: 'Hapus' }
const ROLE_LABELS = { ADMIN: 'Administrator', TRANSPORT: 'Transport', OPERASIONAL: 'Operasional', ATASAN_TRANSPORT: 'Atasan Transport', DIREKTUR: 'Direktur', AKUNTANSI: 'Akuntansi' }
const valueText = value => {
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export default function AuditTrailPanel({ users = [] }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('ALL')
  const [tableFilter, setTableFilter] = useState('ALL')
  const [selected, setSelected] = useState(null)

  const actorMap = useMemo(() => Object.fromEntries(users.map(user => [user.id, user])), [users])
  const tableOptions = useMemo(() => [...new Set(logs.map(log => log.table_name).filter(Boolean))], [logs])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const { data, error: fetchError } = await supabase
        .from('audit_log')
        .select('id,occurred_at,actor_id,actor_role,action,table_name,record_id,changed_fields,old_data,new_data')
        .order('occurred_at', { ascending: false })
        .limit(500)
      if (fetchError) throw fetchError
      setLogs(data || [])
    } catch (e) {
      setError(e.message || 'Riwayat perubahan tidak dapat dimuat.')
      setLogs([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return logs.filter(log => {
      const actor = actorMap[log.actor_id]
      const haystack = [
        TABLE_LABELS[log.table_name] || log.table_name,
        actor?.nama_lengkap,
        actor?.email,
        log.actor_role,
        log.record_id,
        ...(log.changed_fields || []),
      ].filter(Boolean).join(' ').toLowerCase()
      return (!term || haystack.includes(term)) &&
        (actionFilter === 'ALL' || log.action === actionFilter) &&
        (tableFilter === 'ALL' || log.table_name === tableFilter)
    })
  }, [logs, search, actionFilter, tableFilter, actorMap])

  const stats = useMemo(() => ({
    total: logs.length,
    added: logs.filter(log => log.action === 'INSERT').length,
    updated: logs.filter(log => log.action === 'UPDATE').length,
    deleted: logs.filter(log => log.action === 'DELETE').length,
  }), [logs])

  return (
    <>
      <section className="users-summary-card audit-summary-grid">
        <div className="users-summary-item"><span>Total catatan</span><strong>{stats.total}</strong></div>
        <div className="users-summary-item"><span>Data ditambah</span><strong>{stats.added}</strong></div>
        <div className="users-summary-item"><span>Data diubah</span><strong>{stats.updated}</strong></div>
        <div className="users-summary-item"><span>Data dihapus</span><strong>{stats.deleted}</strong></div>
      </section>

      <section className="x-card users-audit-card">
        <div className="x-card-title">
          <div><h3>Aktivitas perubahan data</h3><p>Catatan perubahan pada data utama Transport. Klik Detail untuk melihat nilai sebelum dan sesudah.</p></div>
          <button type="button" className="x-btn secondary" onClick={load} disabled={loading}>↻ Refresh</button>
        </div>
        {error && <div className="x-alert error">{error}</div>}
        <div className="users-filter-grid users-audit-filters">
          <input className="x-filter" value={search} onChange={event => setSearch(event.target.value)} placeholder="Cari pengguna, tabel, ID data..." aria-label="Cari riwayat perubahan" />
          <select className="x-filter" value={actionFilter} onChange={event => setActionFilter(event.target.value)} aria-label="Filter aksi">
            <option value="ALL">Semua aksi</option><option value="INSERT">Tambah</option><option value="UPDATE">Ubah</option><option value="DELETE">Hapus</option>
          </select>
          <select className="x-filter" value={tableFilter} onChange={event => setTableFilter(event.target.value)} aria-label="Filter data">
            <option value="ALL">Semua data</option>
            {tableOptions.map(table => <option key={table} value={table}>{TABLE_LABELS[table] || table}</option>)}
          </select>
          <button type="button" className="x-btn secondary" onClick={() => { setSearch(''); setActionFilter('ALL'); setTableFilter('ALL') }}>Reset</button>
        </div>

        {loading ? <div className="x-empty">Memuat riwayat perubahan...</div> : !filtered.length ?
          <div className="x-empty">{logs.length ? 'Tidak ada riwayat yang sesuai filter.' : 'Belum ada perubahan yang tercatat sejak Audit Trail diaktifkan.'}</div> :
          <div className="x-table-wrap"><table className="x-table users-audit-table"><thead><tr><th>Waktu</th><th>Pelaku</th><th>Aksi</th><th>Data</th><th>ID</th><th>Perubahan</th><th>Detail</th></tr></thead><tbody>
            {filtered.map(log => {
              const actor = actorMap[log.actor_id]
              return <tr key={log.id}>
                <td>{new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(log.occurred_at))}</td>
                <td><b>{actor?.nama_lengkap || actor?.email || 'Pengguna sistem'}</b><small>{ROLE_LABELS[log.actor_role] || log.actor_role || '-'}</small></td>
                <td><span className={'users-audit-pill users-audit-' + String(log.action).toLowerCase()}>{ACTION_LABELS[log.action] || log.action}</span></td>
                <td>{TABLE_LABELS[log.table_name] || log.table_name}</td>
                <td>{log.record_id || '-'}</td>
                <td><span className="users-audit-field-list">{(log.changed_fields || []).slice(0, 4).join(', ') || '-'}</span>{(log.changed_fields || []).length > 4 && <small>+{log.changed_fields.length - 4} field lain</small>}</td>
                <td><button type="button" className="x-link" onClick={() => setSelected(log)}>Lihat</button></td>
              </tr>
            })}
          </tbody></table></div>
        }
      </section>

      {selected && <div className="x-overlay"><section className="x-modal users-audit-modal">
        <div className="x-modal-head"><div><span className="eyebrow">AUDIT TRAIL</span><h3>{ACTION_LABELS[selected.action] || selected.action} • {TABLE_LABELS[selected.table_name] || selected.table_name}</h3><p>{new Intl.DateTimeFormat('id-ID', { dateStyle: 'full', timeStyle: 'medium' }).format(new Date(selected.occurred_at))}</p></div><button type="button" onClick={() => setSelected(null)}>×</button></div>
        <div className="users-audit-meta-grid"><div><span>Pelaku</span><strong>{actorMap[selected.actor_id]?.nama_lengkap || actorMap[selected.actor_id]?.email || 'Pengguna sistem'}</strong></div><div><span>Role</span><strong>{ROLE_LABELS[selected.actor_role] || selected.actor_role || '-'}</strong></div><div><span>Data ID</span><strong>{selected.record_id || '-'}</strong></div><div><span>Field berubah</span><strong>{selected.changed_fields?.length || 0}</strong></div></div>
        <div className="users-audit-change-table"><table className="x-table"><thead><tr><th>Field</th><th>Sebelum</th><th>Sesudah</th></tr></thead><tbody>
          {(selected.changed_fields || []).map(field => <tr key={field}><td><b>{field}</b></td><td>{valueText(selected.old_data?.[field])}</td><td>{valueText(selected.new_data?.[field])}</td></tr>)}
        </tbody></table></div>
        <div className="x-actions"><button type="button" className="x-btn secondary" onClick={() => setSelected(null)}>Tutup</button></div>
      </section></div>}
    </>
  )
}
