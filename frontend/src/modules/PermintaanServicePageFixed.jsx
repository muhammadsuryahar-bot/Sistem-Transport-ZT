import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import './PermintaanServicePage.css'

const TYPE_LABELS = { SERVICE: 'Service', GANTI_BAN: 'Ganti Ban', GANTI_AKI: 'Ganti Aki / Baterai', PEMERIKSAAN: 'Pemeriksaan' }
const STATUS_LABELS = { MENUNGGU_TRANSPORT: 'Menunggu Transport', DITERIMA_TRANSPORT: 'Diterima Transport', DALAM_PROSES: 'Dalam Proses', MENUNGGU_APPROVAL: 'Menunggu Approval', DISETUJUI: 'Disetujui', DITOLAK: 'Ditolak', SELESAI: 'Selesai', DIBATALKAN: 'Dibatalkan' }
const ACTIVE = ['MENUNGGU_TRANSPORT', 'DITERIMA_TRANSPORT', 'DALAM_PROSES', 'MENUNGGU_APPROVAL', 'DISETUJUI']
const EMPTY = { kendaraan_id: '', jenis_permintaan: 'SERVICE', kilometer: '', keluhan: '', prioritas: 'NORMAL' }
const fmtDate = value => value ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(new Date(value)) : '-'
const fmtNum = value => value === null || value === undefined || value === '' ? '-' : new Intl.NumberFormat('id-ID').format(Number(value))

export default function PermintaanServicePage({ profile }) {
  const [vehicles, setVehicles] = useState([])
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [detail, setDetail] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('SEMUA')
  const [selectedIds, setSelectedIds] = useState([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const canCreate = ['ADMIN', 'OPERASIONAL'].includes(profile?.role)
  const canDelete = profile?.role === 'ADMIN'

  const loadData = async () => {
    setLoading(true); setError('')
    const [v, r] = await Promise.all([
      supabase.from('kendaraan').select('id,kode_kendaraan,nomor_polisi,merk,tipe,kepemilikan,jenis_sewa,pemilik,lokasi,kilometer_terakhir,status').order('nomor_polisi'),
      supabase.from('permintaan_service').select('*').order('created_at', { ascending: false }),
    ])
    if (v.error) setError(`Data kendaraan: ${v.error.message}`); else setVehicles(v.data || [])
    if (r.error) setError(current => current || `Data pengajuan: ${r.error.message}`); else setRequests(r.data || [])
    setSelectedIds([]); setLoading(false)
  }

  useEffect(() => {
    loadData()
    const onImported = event => { if (['service', 'pengajuan', 'kendaraan'].includes(event.detail?.context)) loadData() }
    window.addEventListener('transport:data-imported', onImported)
    return () => window.removeEventListener('transport:data-imported', onImported)
  }, [])

  const vehicleMap = useMemo(() => Object.fromEntries(vehicles.map(v => [v.id, v])), [vehicles])
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return requests.filter(r => {
      const v = vehicleMap[r.kendaraan_id]
      const text = [r.nomor_pengajuan, r.keluhan, v?.nomor_polisi, v?.kode_kendaraan, v?.merk, v?.tipe].filter(Boolean).join(' ').toLowerCase()
      return (!q || text.includes(q)) && (statusFilter === 'SEMUA' || r.status === statusFilter)
    })
  }, [requests, vehicleMap, search, statusFilter])

  const openCreate = () => { setForm({ ...EMPTY }); setShowForm(true); setDetail(null); setError(''); setSuccess('') }
  const updateForm = (key, value) => setForm(current => ({ ...current, [key]: value }))

  const submit = async event => {
    event.preventDefault(); setError(''); setSuccess('')
    if (!profile?.id) return setError('Profil pengguna belum tersedia. Silakan login ulang.')
    if (!form.kendaraan_id || !form.keluhan.trim()) return setError('Kendaraan dan keluhan wajib diisi.')
    const vehicle = vehicleMap[form.kendaraan_id]
    if (!vehicle) return setError('Kendaraan tidak ditemukan.')
    if (vehicle.status === 'TIDAK_AKTIF') return setError('Kendaraan tidak aktif dan tidak dapat diajukan untuk service.')
    const km = Number(form.kilometer)
    if (!Number.isFinite(km) || km < 0) return setError('KM harus berupa angka yang valid.')
    setSaving(true)
    const { data, error: e } = await supabase.from('permintaan_service').insert({ pemohon_id: profile.id, kendaraan_id: Number(form.kendaraan_id), tanggal_pengajuan: new Date().toISOString().slice(0, 10), kilometer_pengajuan: km, jenis_permintaan: form.jenis_permintaan, keluhan: form.keluhan.trim(), prioritas: form.prioritas, status: 'MENUNGGU_TRANSPORT' }).select('id,nomor_pengajuan').single()
    if (e) setError(`Gagal membuat pengajuan: ${e.message}`); else { setShowForm(false); setSuccess(`Pengajuan ${data?.nomor_pengajuan || ''} berhasil dibuat.`); await loadData() }
    setSaving(false)
  }

  const canDeleteRequest = request => ['SELESAI', 'DITOLAK', 'DIBATALKAN'].includes(request.status)
  const deleteOne = async request => {
    if (!canDelete || !canDeleteRequest(request)) { setError('Hanya pengajuan terminal yang dapat dihapus oleh Administrator.'); return false }
    const serviceCheck = await supabase.from('service').select('id', { count: 'exact', head: true }).eq('permintaan_service_id', request.id)
    if (serviceCheck.error) { setError(`Gagal memeriksa histori service: ${serviceCheck.error.message}`); return false }
    if (serviceCheck.count) { setError(`Pengajuan ${request.nomor_pengajuan || request.id} memiliki histori service dan tidak boleh dihapus.`); return false }
    const { error: e } = await supabase.from('permintaan_service').delete().eq('id', request.id)
    if (e) { setError(e.message); return false }
    return true
  }

  const deleteSelected = async () => {
    if (!selectedIds.length || !canDelete) return
    if (!window.confirm(`Hapus ${selectedIds.length} pengajuan yang dipilih? Data yang masih memiliki histori service akan dilewati.`)) return
    setSaving(true); setError(''); setSuccess('')
    let removed = 0; let blocked = 0
    for (const id of selectedIds) {
      const request = requests.find(r => r.id === id)
      if (request && await deleteOne(request)) removed += 1; else blocked += 1
    }
    setSelectedIds([]); await loadData(); setSaving(false)
    if (removed) setSuccess(`${removed} pengajuan berhasil dihapus${blocked ? ` • ${blocked} dilewati karena masih terhubung` : ''}.`)
  }

  const allSelected = filtered.length > 0 && selectedIds.length === filtered.length
  const toggleAll = () => setSelectedIds(allSelected ? [] : filtered.map(r => r.id))
  const toggle = id => setSelectedIds(current => current.includes(id) ? current.filter(x => x !== id) : [...current, id])

  return <div className="request-page">
    <div className="request-header"><div><span className="eyebrow">OPERASIONAL • TRANSPORT</span><h2>Permintaan Service</h2><p>Ajukan kebutuhan kendaraan tanpa mengetik ulang data armada.</p></div>{canCreate && <button className="request-primary-button" onClick={openCreate}>+ Buat Pengajuan</button>}</div>
    {success && <div className="request-alert success">{success}</div>}{error && !showForm && <div className="request-alert error">{error}</div>}
    <section className="request-summary-grid"><div><span>Menunggu Transport</span><strong>{requests.filter(r => r.status === 'MENUNGGU_TRANSPORT').length}</strong><small>Perlu diproses</small></div><div><span>Masih Berjalan</span><strong>{requests.filter(r => ACTIVE.includes(r.status)).length}</strong><small>Belum selesai</small></div><div><span>Selesai / Batal</span><strong>{requests.filter(r => ['SELESAI', 'DIBATALKAN'].includes(r.status)).length}</strong><small>Riwayat</small></div></section>
    <section className="request-panel">
      <div className="request-toolbar"><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nomor, plat, merk, keluhan..."/><select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="SEMUA">Semua status</option>{Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>{canDelete && selectedIds.length > 0 && <button className="request-light-button danger" onClick={deleteSelected} disabled={saving}>Hapus {selectedIds.length} Pengajuan</button>}<button className="request-light-button" onClick={loadData} disabled={loading || saving}>↻ Refresh</button></div>
      <div className="request-table-wrap">{loading?<div className="request-empty">Memuat pengajuan...</div>:filtered.length===0?<div className="request-empty"><strong>Belum ada pengajuan yang cocok.</strong><span>{canCreate?'Buat pengajuan pertama dari tombol di atas.':'Data akan muncul ketika pengajuan tersedia.'}</span></div>:<table className="request-table"><thead><tr><th><input type="checkbox" aria-label="Pilih semua pengajuan" checked={allSelected} onChange={toggleAll}/></th><th>Pengajuan</th><th>Kendaraan</th><th>Kebutuhan</th><th>KM</th><th>Prioritas</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{filtered.map(r=>{const v=vehicleMap[r.kendaraan_id];return <tr key={r.id}><td><input type="checkbox" aria-label={`Pilih pengajuan ${r.nomor_pengajuan||r.id}`} checked={selectedIds.includes(r.id)} onChange={()=>toggle(r.id)}/></td><td><div className="request-main-cell"><strong>{r.nomor_pengajuan||`#${r.id}`}</strong><span>{fmtDate(r.tanggal_pengajuan)}</span></div></td><td><div className="request-main-cell"><strong>{v?.nomor_polisi||'-'}</strong><span>{v?`${v.merk}${v.tipe?` • ${v.tipe}`:''}`:'Data kendaraan tidak ditemukan'}</span></div></td><td><div className="request-main-cell"><strong>{TYPE_LABELS[r.jenis_permintaan]||r.jenis_permintaan}</strong><span>{r.keluhan}</span></div></td><td><strong>{fmtNum(r.kilometer_pengajuan)} km</strong></td><td><span className={`request-priority priority-${String(r.prioritas||'NORMAL').toLowerCase()}`}>{r.prioritas==='MENDESAK'?'Mendesak':'Normal'}</span></td><td><span className={`request-status status-${String(r.status||'').toLowerCase()}`}>{STATUS_LABELS[r.status]||r.status}</span></td><td><button className="request-detail-button" onClick={()=>setDetail(r)}>Detail</button>{canDelete&&<button className="request-detail-button danger" onClick={()=>{if(window.confirm(`Hapus pengajuan ${r.nomor_pengajuan||r.id}?`))deleteOne(r).then(ok=>ok&&loadData())}} disabled={saving}>Hapus</button>}</td></tr>})}</tbody></table>}</div>
      <div className="request-footer">Menampilkan {filtered.length} dari {requests.length} pengajuan</div>
    </section>

    {showForm&&<div className="request-modal-backdrop" role="presentation"><section className="request-modal" role="dialog" aria-modal="true"><div className="request-modal-header"><div><span className="eyebrow">PENGAJUAN SERVICE</span><h3>Buat Permintaan Baru</h3></div><button type="button" className="request-close-button" onClick={()=>!saving&&setShowForm(false)} disabled={saving}>×</button></div>{error&&<div className="request-alert error">{error}</div>}<form onSubmit={submit}><div className="request-form-grid"><div className="request-field full"><label>Kendaraan*</label><select value={form.kendaraan_id} onChange={e=>updateForm('kendaraan_id',e.target.value)} disabled={saving}><option value="">Pilih kendaraan...</option>{vehicles.filter(v=>v.status!=='TIDAK_AKTIF').map(v=><option key={v.id} value={v.id}>{v.nomor_polisi} — {v.merk} {v.tipe||''}</option>)}</select></div><div className="request-field"><label>Jenis Kebutuhan*</label><select value={form.jenis_permintaan} onChange={e=>updateForm('jenis_permintaan',e.target.value)} disabled={saving}>{Object.entries(TYPE_LABELS).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div><div className="request-field"><label>KM Saat Pengajuan*</label><input type="number" min="0" step="1" value={form.kilometer} onChange={e=>updateForm('kilometer',e.target.value)} disabled={saving}/></div><div className="request-field full"><label>Prioritas</label><select value={form.prioritas} onChange={e=>updateForm('prioritas',e.target.value)} disabled={saving}><option value="NORMAL">Normal</option><option value="MENDESAK">Mendesak</option></select></div><div className="request-field full"><label>Keluhan / Kebutuhan Service*</label><textarea rows="5" value={form.keluhan} onChange={e=>updateForm('keluhan',e.target.value)} disabled={saving} placeholder="Contoh: Mesin terasa bergetar saat idle dan perlu diperiksa."/></div></div><div className="request-form-actions"><button className="request-light-button" type="button" onClick={()=>setShowForm(false)} disabled={saving}>Batal</button><button className="request-primary-button" type="submit" disabled={saving}>{saving?'Mengirim...':'Kirim Pengajuan'}</button></div></form></section></div>}
    {detail&&<div className="request-modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setDetail(null)}}><section className="request-modal request-detail-modal" role="dialog" aria-modal="true"><div className="request-modal-header"><div><span className="eyebrow">DETAIL PENGAJUAN</span><h3>{detail.nomor_pengajuan||`Pengajuan #${detail.id}`}</h3></div><button type="button" className="request-close-button" onClick={()=>setDetail(null)}>×</button></div><div className="request-detail-grid"><div><span>Status</span><strong>{STATUS_LABELS[detail.status]||detail.status}</strong></div><div><span>Tanggal</span><strong>{fmtDate(detail.tanggal_pengajuan)}</strong></div><div><span>Jenis</span><strong>{TYPE_LABELS[detail.jenis_permintaan]||detail.jenis_permintaan}</strong></div><div><span>Prioritas</span><strong>{detail.prioritas==='MENDESAK'?'Mendesak':'Normal'}</strong></div><div><span>Kendaraan</span><strong>{vehicleMap[detail.kendaraan_id]?.nomor_polisi||'-'}</strong></div><div><span>KM</span><strong>{fmtNum(detail.kilometer_pengajuan)} km</strong></div><div className="full"><span>Keluhan / Kebutuhan</span><p>{detail.keluhan}</p></div><div className="full"><span>Catatan Transport</span><p>{detail.catatan_transport||'Belum ada catatan dari Transport.'}</p></div></div></section></div>}
  </div>
}
