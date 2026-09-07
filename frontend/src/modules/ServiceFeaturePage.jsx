import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import './TransportOperationsFixed.css'

const money = v => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(v || 0))
const dateText = v => v ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(new Date(v)) : '-'
const TYPES = { SERVICE: 'Service', GANTI_BAN: 'Ganti Ban', GANTI_AKI: 'Ganti Aki / Baterai', PEMERIKSAAN: 'Pemeriksaan' }
const STAT = { MENUNGGU_TRANSPORT: 'Menunggu Transport', DITERIMA_TRANSPORT: 'Diterima Transport', DALAM_PROSES: 'Dalam Proses', MENUNGGU_APPROVAL: 'Menunggu Approval', DISETUJUI: 'Disetujui', DITOLAK: 'Ditolak', DALAM_PENGERJAAN: 'Dalam Pengerjaan', SELESAI: 'Selesai', DIBATALKAN: 'Dibatalkan', DRAFT: 'Draft' }
const emptyService = { permintaan_service_id: '', kendaraan_id: '', tanggal_service: new Date().toISOString().slice(0, 10), kilometer: '', bengkel: '', jenis_service: 'SERVICE', keluhan: '', estimasi_biaya: '', biaya_aktual: '', catatan: '' }
const emptyItem = { service_id: '', nama_item: '', kategori: '', jumlah: '1', satuan: 'pcs', harga_satuan: '', keterangan: '' }
const emptyProof = { service_id: '', jenis_bukti: 'INVOICE', keterangan: '' }
const emptyPart = { kendaraan_id: '', tanggal_penggantian: new Date().toISOString().slice(0, 10), kilometer: '', kondisi_sebelum: '', alasan_penggantian: '', biaya: '', keterangan: '', _type: 'BAN' }
const emptyKm = { kendaraan_id: '', tanggal: new Date().toISOString().slice(0, 10), kilometer: '', sumber: 'SERVICE', keterangan: '' }

function Alert({ type = 'success', children }) { return <div className={`x-alert ${type}`}>{children}</div> }
function Header({ eyebrow, title, text, action }) { return <div className="x-head"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p>{text}</p></div>{action}</div> }
function Empty({ text = 'Belum ada data.' }) { return <div className="x-empty">{text}</div> }
async function upload(bucket, file, prefix) { if (!file) return null; const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_'); const path = `${prefix}/${Date.now()}-${crypto.randomUUID()}-${safe}`; const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false, contentType: file.type || undefined }); if (error) throw error; return path }
async function signed(bucket, path) { if (!path) return null; const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600); if (error) throw error; return data?.signedUrl || null }

export default function ServiceFeaturePage({ profile }) {
  const [tab, setTab] = useState('pekerjaan')
  const [vehicles, setVehicles] = useState([]), [requests, setRequests] = useState([]), [services, setServices] = useState([]), [items, setItems] = useState([]), [proofs, setProofs] = useState([]), [approvals, setApprovals] = useState([]), [bans, setBans] = useState([]), [akis, setAkis] = useState([]), [kms, setKms] = useState([])
  const [form, setForm] = useState(emptyService), [itemForm, setItemForm] = useState(emptyItem), [proofForm, setProofForm] = useState(emptyProof), [partForm, setPartForm] = useState(emptyPart), [kmForm, setKmForm] = useState(emptyKm)
  const [file, setFile] = useState(null), [selected, setSelected] = useState(null), [approvalModal, setApprovalModal] = useState(null), [approvalNote, setApprovalNote] = useState('')
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState(''), [success, setSuccess] = useState('')
  const [detailEdit, setDetailEdit] = useState({ biaya_aktual: '' })

  const canProcess = ['ADMIN', 'TRANSPORT'].includes(profile?.role)
  const canApprove = ['ADMIN', 'ATASAN_TRANSPORT', 'DIREKTUR'].includes(profile?.role)
  const vehicleMap = useMemo(() => Object.fromEntries(vehicles.map(v => [v.id, v])), [vehicles])

  const load = async () => {
    setLoading(true); setError('')
    const rs = await Promise.all([
      supabase.from('kendaraan').select('id,nomor_polisi,merk,tipe,kilometer_terakhir,status').order('nomor_polisi'),
      supabase.from('permintaan_service').select('*').order('created_at', { ascending: false }),
      supabase.from('service').select('*').order('created_at', { ascending: false }),
      supabase.from('service_item').select('*').order('created_at', { ascending: false }),
      supabase.from('service_bukti').select('*').order('created_at', { ascending: false }),
      supabase.from('service_approval').select('*').order('urutan', { ascending: true }),
      supabase.from('riwayat_ban').select('*').order('tanggal_penggantian', { ascending: false }),
      supabase.from('riwayat_aki').select('*').order('tanggal_penggantian', { ascending: false }),
      supabase.from('riwayat_kilometer').select('*').order('tanggal', { ascending: false }),
    ])
    const names = ['Kendaraan', 'Pengajuan', 'Service', 'Item', 'Bukti', 'Approval', 'Ban', 'Aki', 'KM']
    rs.forEach((r, i) => { if (r.error) setError(e => e || `${names[i]}: ${r.error.message}`) })
    setVehicles(rs[0].data || []); setRequests(rs[1].data || []); setServices(rs[2].data || []); setItems(rs[3].data || []); setProofs(rs[4].data || []); setApprovals(rs[5].data || []); setBans(rs[6].data || []); setAkis(rs[7].data || []); setKms(rs[8].data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])
  const clearMessages = () => { setError(''); setSuccess('') }
  const pending = requests.filter(r => ['MENUNGGU_TRANSPORT', 'DITERIMA_TRANSPORT', 'DALAM_PROSES'].includes(r.status))

  const saveService = async e => {
    e.preventDefault(); clearMessages(); setSaving(true)
    try {
      if (!form.permintaan_service_id || !form.kendaraan_id) throw new Error('Pengajuan dan kendaraan wajib dipilih.')
      if (form.estimasi_biaya === '' || Number(form.estimasi_biaya) < 0) throw new Error('Estimasi biaya wajib diisi.')
      const estimate = Number(form.estimasi_biaya), actual = form.biaya_aktual === '' ? null : Number(form.biaya_aktual)
      const needsApproval = estimate > 5000000
      const { data, error: e1 } = await supabase.from('service').insert({ nomor_service: `SRV-${Date.now()}`, permintaan_service_id: Number(form.permintaan_service_id), kendaraan_id: Number(form.kendaraan_id), tanggal_service: form.tanggal_service, kilometer: Number(form.kilometer || 0), bengkel: form.bengkel.trim() || null, jenis_service: form.jenis_service, keluhan: form.keluhan.trim() || null, estimasi_biaya: estimate, biaya_aktual: actual, status: needsApproval ? 'MENUNGGU_APPROVAL' : 'DALAM_PENGERJAAN', diproses_oleh: profile.id, catatan: form.catatan.trim() || null }).select('*').single()
      if (e1) throw e1
      const { error: e2 } = await supabase.from('permintaan_service').update({ status: needsApproval ? 'MENUNGGU_APPROVAL' : 'DALAM_PROSES', diproses_oleh: profile.id, diproses_at: new Date().toISOString() }).eq('id', form.permintaan_service_id)
      if (e2) throw new Error(`Service tersimpan tetapi status pengajuan gagal: ${e2.message}`)
      setForm(emptyService); setSuccess(needsApproval ? `Service ${data.nomor_service} dibuat dan menunggu approval.` : `Service ${data.nomor_service} berhasil dibuat.`); await load()
    } catch (e2) { setError(e2.message) } finally { setSaving(false) }
  }

  const approvalRequirement = s => {
    const amount = Number(s.biaya_aktual ?? s.estimasi_biaya ?? 0)
    return amount > 5000000 ? 'DIREKTUR' : 'ATASAN_TRANSPORT'
  }
  const isApproved = s => approvals.some(a => a.service_id === s.id && a.status === 'DISETUJUI')
  const hasDirectorApproval = s => approvals.some(a => a.service_id === s.id && a.status === 'DISETUJUI' && a.jenis_approval === 'DIREKTUR')
  const needsAdditionalApproval = s => Number(s.biaya_aktual ?? 0) > Number(s.estimasi_biaya ?? 0) && isApproved(s)

  const requestApproval = s => {
    clearMessages()
    const required = approvalRequirement(s)
    if (!canApprove || (profile?.role !== 'ADMIN' && profile?.role !== required)) {
      setError(`Approval ${money(Number(s.biaya_aktual ?? s.estimasi_biaya ?? 0))} harus diberikan oleh ${required === 'DIREKTUR' ? 'Direktur' : 'Atasan Transport'}.`); return
    }
    setApprovalModal({ service: s, required })
    setApprovalNote('')
  }

  const confirmApproval = async approved => {
    if (!approvalModal) return
    const s = approvalModal.service
    setSaving(true); clearMessages()
    try {
      const required = approvalModal.required
      const next = Math.max(0, ...approvals.filter(a => a.service_id === s.id).map(a => Number(a.urutan) || 0)) + 1
      const { error: e1 } = await supabase.from('service_approval').insert({ service_id: s.id, urutan: next, jenis_approval: required, pemberi_approval: profile.id, status: approved ? 'DISETUJUI' : 'DITOLAK', waktu_approval: new Date().toISOString(), catatan: approvalNote.trim() || null })
      if (e1) throw e1
      const nextStatus = approved ? 'DISETUJUI' : 'DITOLAK'
      const { error: e2 } = await supabase.from('service').update({ status: nextStatus }).eq('id', s.id)
      if (e2) throw e2
      setSuccess(approved ? `Service disetujui oleh ${required === 'DIREKTUR' ? 'Direktur' : 'Atasan Transport'}.` : 'Service ditolak.')
      setApprovalModal(null); setApprovalNote(''); await load()
    } catch (e3) { setError(e3.message) } finally { setSaving(false) }
  }

  const updateActual = async () => {
    if (!selected) return
    const value = Number(detailEdit.biaya_aktual)
    if (Number.isNaN(value) || value < 0) { setError('Biaya aktual tidak valid.'); return }
    setSaving(true); clearMessages()
    const { error: e } = await supabase.from('service').update({ biaya_aktual: value }).eq('id', selected.id)
    setSaving(false)
    if (e) setError(e.message)
    else { setSelected({ ...selected, biaya_aktual: value }); setSuccess('Biaya aktual diperbarui.'); await load() }
  }

  const finish = async s => {
    clearMessages()
    const actual = s.biaya_aktual === null || s.biaya_aktual === '' ? Number(s.estimasi_biaya || 0) : Number(s.biaya_aktual)
    const estimate = Number(s.estimasi_biaya || 0)
    const hasApproval = isApproved(s)
    if (actual > 5000000 && !hasDirectorApproval(s)) { setError('Biaya aktual di atas Rp5.000.000 memerlukan approval Direktur sebelum service dapat diselesaikan.'); return }
    if (estimate > 5000000 && !hasApproval) { setError('Service di atas Rp5.000.000 belum memiliki approval.'); return }
    if (actual > estimate && !hasDirectorApproval(s)) { setError('Biaya aktual melebihi estimasi/approval awal. Diperlukan approval tambahan Direktur sebelum service diselesaikan.'); return }
    setSaving(true)
    try {
      const now = new Date().toISOString()
      const { error: e1 } = await supabase.from('service').update({ status: 'SELESAI', biaya_aktual: actual, selesai_at: now }).eq('id', s.id)
      if (e1) throw e1
      const { error: e2 } = await supabase.from('permintaan_service').update({ status: 'SELESAI', diproses_oleh: profile.id, diproses_at: now }).eq('id', s.permintaan_service_id)
      if (e2) throw e2
      const { data: k } = await supabase.from('riwayat_kilometer').select('kilometer').eq('kendaraan_id', s.kendaraan_id).order('kilometer', { ascending: false }).limit(1)
      if (Number(s.kilometer || 0) >= Number(k?.[0]?.kilometer || 0)) await supabase.from('kendaraan').update({ kilometer_terakhir: Number(s.kilometer || 0) }).eq('id', s.kendaraan_id)
      setSelected(null); setSuccess('Service selesai, status pengajuan ditutup, dan KM kendaraan diperbarui.'); await load()
    } catch (e3) { setError(e3.message) } finally { setSaving(false) }
  }

  const addItem = async e => {
    e.preventDefault(); clearMessages(); const jumlah = Number(itemForm.jumlah || 0), harga = Number(itemForm.harga_satuan || 0)
    if (!itemForm.service_id || !itemForm.nama_item.trim()) return setError('Service dan nama item wajib diisi.')
    if (jumlah <= 0) return setError('Jumlah item harus lebih dari 0.')
    const { error: e1 } = await supabase.from('service_item').insert({ service_id: Number(itemForm.service_id), nama_item: itemForm.nama_item.trim(), kategori: itemForm.kategori.trim() || null, jumlah, satuan: itemForm.satuan, harga_satuan: harga, subtotal: jumlah * harga, keterangan: itemForm.keterangan.trim() || null })
    if (e1) setError(e1.message); else { setSuccess('Item service tersimpan.'); setItemForm(emptyItem); await load() }
  }

  const addProof = async e => {
    e.preventDefault(); clearMessages(); setSaving(true)
    try {
      if (!proofForm.service_id || !file) throw new Error('Service dan file wajib dipilih.')
      const path = await upload('service-bukti', file, `service/${proofForm.service_id}`)
      const { error: e1 } = await supabase.from('service_bukti').insert({ service_id: Number(proofForm.service_id), jenis_bukti: proofForm.jenis_bukti, nama_file: file.name, file_path: path, keterangan: proofForm.keterangan.trim() || null, uploaded_by: profile.id })
      if (e1) throw e1
      setSuccess('Bukti service berhasil diunggah.'); setFile(null); setProofForm(emptyProof); await load()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  const addPart = async e => {
    e.preventDefault(); clearMessages();
    if (!partForm.kendaraan_id || !partForm.alasan_penggantian.trim()) return setError('Kendaraan dan alasan penggantian wajib diisi.')
    if (!file) return setError('Foto kondisi sebelum wajib diunggah.')
    const payload = { kendaraan_id: Number(partForm.kendaraan_id), tanggal_penggantian: partForm.tanggal_penggantian, kilometer: Number(partForm.kilometer || 0), kondisi_sebelum: partForm.kondisi_sebelum.trim() || null, alasan_penggantian: partForm.alasan_penggantian.trim(), biaya: Number(partForm.biaya || 0), keterangan: partForm.keterangan.trim() || null, dicatat_oleh: profile.id }
    try {
      setSaving(true)
      if (partForm._type === 'BAN') {
        payload.jumlah_ban = Number(partForm.jumlah_ban || 1); payload.posisi_ban = partForm.posisi_ban || null; payload.merek_ban = partForm.merek_ban || null; payload.ukuran_ban = partForm.ukuran_ban || null; payload.foto_sebelum_path = await upload('service-bukti', file, `ban/${partForm.kendaraan_id}`)
        const { error } = await supabase.from('riwayat_ban').insert(payload); if (error) throw error
      } else {
        payload.merek_aki = partForm.merek_aki || null; payload.tipe_aki = partForm.tipe_aki || null; payload.nomor_aki = partForm.nomor_aki || null; payload.foto_sebelum_path = await upload('service-bukti', file, `aki/${partForm.kendaraan_id}`)
        const { error } = await supabase.from('riwayat_aki').insert(payload); if (error) throw error
      }
      setSuccess(`Riwayat penggantian ${partForm._type === 'BAN' ? 'ban' : 'aki/baterai'} tersimpan.`); setFile(null); setPartForm({ ...emptyPart, _type: partForm._type }); await load()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  const addKm = async e => {
    e.preventDefault(); clearMessages()
    if (!kmForm.kendaraan_id || kmForm.kilometer === '') return setError('Kendaraan dan KM wajib diisi.')
    const km = Number(kmForm.kilometer), current = Number(vehicleMap[kmForm.kendaraan_id]?.kilometer_terakhir || 0)
    if (km < current) return setError(`KM baru tidak boleh lebih kecil dari KM terakhir (${current}).`)
    const { error: e1 } = await supabase.from('riwayat_kilometer').insert({ kendaraan_id: Number(kmForm.kendaraan_id), tanggal: kmForm.tanggal, kilometer: km, sumber: kmForm.sumber, keterangan: kmForm.keterangan.trim() || null, dicatat_oleh: profile.id })
    if (e1) return setError(e1.message)
    const { error: e2 } = await supabase.from('kendaraan').update({ kilometer_terakhir: km }).eq('id', kmForm.kendaraan_id)
    if (e2) setError(e2.message); else setSuccess('Riwayat KM tersimpan.'); setKmForm(emptyKm); await load()
  }

  const openDetail = s => { setSelected(s); setDetailEdit({ biaya_aktual: s.biaya_aktual ?? s.estimasi_biaya ?? '' }) }
  const tabs = [['pekerjaan', 'Pekerjaan'], ['item', 'Item Service'], ['bukti', 'Bukti'], ['ban', 'Riwayat Ban'], ['aki', 'Riwayat Aki'], ['km', 'Riwayat KM']]

  return <div className="x-page">
    <Header eyebrow="SERVICE & MAINTENANCE" title="Service & Perbaikan" text="Kelola pekerjaan, approval, rincian item, bukti, ban, aki, dan kilometer." action={<button className="x-btn secondary" onClick={load}>↻ Refresh</button>} />
    {error && <Alert type="error">{error}</Alert>}{success && <Alert>{success}</Alert>}
    <div className="x-tabs">{tabs.map(([v, l]) => <button key={v} className={tab === v ? 'active' : ''} onClick={() => { clearMessages(); setTab(v) }}>{l}</button>)}</div>

    {tab === 'pekerjaan' && <>
      <section className="x-card">
        {canProcess && <><div className="x-card-title"><h3>Buat Pekerjaan Service</h3><p>Pengajuan dipilih sekali; data kendaraan dan KM akan mengikuti pengajuan.</p></div><form className="x-grid" onSubmit={saveService}>
          <label>Pengajuan<select value={form.permintaan_service_id} onChange={e => { const r = requests.find(x => String(x.id) === e.target.value); setForm(f => ({ ...f, permintaan_service_id: e.target.value, kendaraan_id: r?.kendaraan_id || '', kilometer: r?.kilometer_pengajuan ?? vehicleMap[r?.kendaraan_id]?.kilometer_terakhir ?? '', jenis_service: r?.jenis_permintaan || 'SERVICE', keluhan: r?.keluhan || '' })) }}><option value="">Pilih</option>{pending.map(r => <option key={r.id} value={r.id}>{r.nomor_pengajuan || `#${r.id}`} — {TYPES[r.jenis_permintaan] || r.jenis_permintaan}</option>)}</select></label>
          <label>Kendaraan<select value={form.kendaraan_id} onChange={e => setForm(f => ({ ...f, kendaraan_id: e.target.value }))}><option value="">Pilih</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.nomor_polisi} — {v.merk} {v.tipe || ''}</option>)}</select></label>
          <label>Tanggal<input type="date" value={form.tanggal_service} onChange={e => setForm(f => ({ ...f, tanggal_service: e.target.value }))} /></label>
          <label>KM<input type="number" min="0" value={form.kilometer} onChange={e => setForm(f => ({ ...f, kilometer: e.target.value }))} /></label>
          <label>Bengkel<input value={form.bengkel} onChange={e => setForm(f => ({ ...f, bengkel: e.target.value }))} /></label>
          <label>Jenis<select value={form.jenis_service} onChange={e => setForm(f => ({ ...f, jenis_service: e.target.value }))}>{Object.entries(TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label>Estimasi Biaya<input type="number" min="0" value={form.estimasi_biaya} onChange={e => setForm(f => ({ ...f, estimasi_biaya: e.target.value }))} /></label>
          <label>Biaya Aktual<input type="number" min="0" value={form.biaya_aktual} onChange={e => setForm(f => ({ ...f, biaya_aktual: e.target.value }))} /></label>
          <label className="full">Keluhan<input value={form.keluhan} onChange={e => setForm(f => ({ ...f, keluhan: e.target.value }))} /></label>
          <label className="full">Catatan<textarea value={form.catatan} onChange={e => setForm(f => ({ ...f, catatan: e.target.value }))} /></label>
          <div className="full x-actions"><button className="x-btn primary" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan Service'}</button></div>
        </form></>}
      </section>
      <section className="x-card"><div className="x-card-title"><h3>Daftar Service</h3></div>{loading ? <Empty text="Memuat…" /> : services.length === 0 ? <Empty text="Belum ada service." /> : <div className="x-table-wrap"><table className="x-table"><thead><tr><th>Nomor</th><th>Kendaraan</th><th>Jenis</th><th>Estimasi / Aktual</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{services.map(s => {
        const approved = isApproved(s), actual = Number(s.biaya_aktual ?? s.estimasi_biaya ?? 0), needInitial = Number(s.estimasi_biaya || 0) > 5000000 && !approved, needExtra = approved && actual > Number(s.estimasi_biaya || 0) && !hasDirectorApproval(s), needDir = actual > 5000000 && !hasDirectorApproval(s)
        return <tr key={s.id}><td><b>{s.nomor_service || `#${s.id}`}</b><small>{dateText(s.tanggal_service)}</small></td><td><b>{vehicleMap[s.kendaraan_id]?.nomor_polisi || '-'}</b><small>{vehicleMap[s.kendaraan_id]?.merk || ''}</small></td><td>{TYPES[s.jenis_service] || s.jenis_service}</td><td>{money(s.estimasi_biaya)}<small>Aktual {money(s.biaya_aktual)}</small></td><td><span className="x-pill">{STAT[s.status] || s.status}</span>{needExtra && <small>Butuh approval tambahan</small>}</td><td>{(needInitial || needDir || needExtra) && canApprove ? <button className="x-link" onClick={() => requestApproval(s)}>Approval</button> : s.status === 'DISETUJUI' && canProcess ? <button className="x-link" onClick={() => finish(s)} disabled={saving}>Selesai</button> : <button className="x-link" onClick={() => openDetail(s)}>Detail</button>}</td></tr>
      })}</tbody></table></div>}</section>
    </>}

    {tab === 'item' && <><section className="x-card"><div className="x-card-title"><h3>Tambah Item Service</h3></div><form className="x-grid" onSubmit={addItem}><label>Service<select value={itemForm.service_id} onChange={e => setItemForm(f => ({ ...f, service_id: e.target.value }))}><option value="">Pilih</option>{services.map(s => <option key={s.id} value={s.id}>{s.nomor_service || `#${s.id}`}</option>)}</select></label><label>Nama Item<input value={itemForm.nama_item} onChange={e => setItemForm(f => ({ ...f, nama_item: e.target.value }))} /></label><label>Kategori<input value={itemForm.kategori} onChange={e => setItemForm(f => ({ ...f, kategori: e.target.value }))} /></label><label>Jumlah<input type="number" min="0" step="0.01" value={itemForm.jumlah} onChange={e => setItemForm(f => ({ ...f, jumlah: e.target.value }))} /></label><label>Satuan<input value={itemForm.satuan} onChange={e => setItemForm(f => ({ ...f, satuan: e.target.value }))} /></label><label>Harga Satuan<input type="number" min="0" value={itemForm.harga_satuan} onChange={e => setItemForm(f => ({ ...f, harga_satuan: e.target.value }))} /></label><label className="full">Keterangan<input value={itemForm.keterangan} onChange={e => setItemForm(f => ({ ...f, keterangan: e.target.value }))} /></label><div className="full x-actions"><button className="x-btn primary">Simpan Item</button></div></form></section><section className="x-card"><div className="x-table-wrap"><table className="x-table"><thead><tr><th>Service</th><th>Item</th><th>Jumlah</th><th>Harga</th><th>Subtotal</th></tr></thead><tbody>{items.length ? items.map(i => <tr key={i.id}><td>#{i.service_id}</td><td>{i.nama_item}<small>{i.kategori || '-'}</small></td><td>{i.jumlah} {i.satuan}</td><td>{money(i.harga_satuan)}</td><td>{money(i.subtotal)}</td></tr>) : <tr><td colSpan="5"><Empty /></td></tr>}</tbody></table></div></section></>}

    {tab === 'bukti' && <><section className="x-card"><div className="x-card-title"><h3>Upload Bukti Service</h3><p>Gunakan bukti sesuai jenis pekerjaan: invoice/bon, foto sebelum/sesudah, atau dokumentasi KM.</p></div><form className="x-grid" onSubmit={addProof}><label>Service<select value={proofForm.service_id} onChange={e => setProofForm(f => ({ ...f, service_id: e.target.value }))}><option value="">Pilih</option>{services.map(s => <option key={s.id} value={s.id}>{s.nomor_service || `#${s.id}`}</option>)}</select></label><label>Jenis Bukti<select value={proofForm.jenis_bukti} onChange={e => setProofForm(f => ({ ...f, jenis_bukti: e.target.value }))}><option>INVOICE</option><option>FOTO_SEBELUM</option><option>FOTO_SESUDAH</option><option>KM</option><option>LAINNYA</option></select></label><label>File<input type="file" accept=".pdf,image/*" onChange={e => setFile(e.target.files?.[0] || null)} /></label><label className="full">Keterangan<input value={proofForm.keterangan} onChange={e => setProofForm(f => ({ ...f, keterangan: e.target.value }))} /></label><div className="full x-actions"><button className="x-btn primary" disabled={saving}>Upload Bukti</button></div></form></section><section className="x-card">{proofs.length === 0 ? <Empty /> : <div className="x-table-wrap"><table className="x-table"><thead><tr><th>Service</th><th>Jenis</th><th>File</th><th>Aksi</th></tr></thead><tbody>{proofs.map(p => <tr key={p.id}><td>#{p.service_id}</td><td>{p.jenis_bukti}</td><td>{p.nama_file}</td><td><button className="x-link" onClick={async () => { try { const u = await signed('service-bukti', p.file_path); if (u) window.open(u, '_blank', 'noopener,noreferrer') } catch (e) { setError(e.message) } }}>Lihat</button></td></tr>)}</tbody></table></div>}</section></>}

    {(tab === 'ban' || tab === 'aki') && <><section className="x-card"><div className="x-card-title"><h3>Catat Penggantian {tab === 'ban' ? 'Ban' : 'Aki / Baterai'}</h3><p>Foto kondisi sebelum wajib sebagai dokumentasi kerusakan.</p></div><form className="x-grid" onSubmit={addPart}><label>Kendaraan<select value={partForm.kendaraan_id} onChange={e => setPartForm(f => ({ ...f, kendaraan_id: e.target.value, _type: tab.toUpperCase() }))}><option value="">Pilih</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.nomor_polisi} — {v.merk}</option>)}</select></label><label>Tanggal<input type="date" value={partForm.tanggal_penggantian} onChange={e => setPartForm(f => ({ ...f, tanggal_penggantian: e.target.value, _type: tab.toUpperCase() }))} /></label><label>KM<input type="number" min="0" value={partForm.kilometer} onChange={e => setPartForm(f => ({ ...f, kilometer: e.target.value }))} /></label><label>Alasan<input value={partForm.alasan_penggantian} onChange={e => setPartForm(f => ({ ...f, alasan_penggantian: e.target.value }))} /></label><label>Kondisi Sebelum<input value={partForm.kondisi_sebelum} onChange={e => setPartForm(f => ({ ...f, kondisi_sebelum: e.target.value }))} /></label><label>Biaya<input type="number" min="0" value={partForm.biaya} onChange={e => setPartForm(f => ({ ...f, biaya: e.target.value }))} /></label>{tab === 'ban' ? <><label>Jumlah Ban<input type="number" min="1" value={partForm.jumlah_ban || 1} onChange={e => setPartForm(f => ({ ...f, jumlah_ban: e.target.value, _type: 'BAN' }))} /></label><label>Posisi Ban<input value={partForm.posisi_ban || ''} onChange={e => setPartForm(f => ({ ...f, posisi_ban: e.target.value, _type: 'BAN' }))} /></label><label>Merek Ban<input value={partForm.merek_ban || ''} onChange={e => setPartForm(f => ({ ...f, merek_ban: e.target.value, _type: 'BAN' }))} /></label><label>Ukuran<input value={partForm.ukuran_ban || ''} onChange={e => setPartForm(f => ({ ...f, ukuran_ban: e.target.value, _type: 'BAN' }))} /></label></> : <><label>Merek Aki<input value={partForm.merek_aki || ''} onChange={e => setPartForm(f => ({ ...f, merek_aki: e.target.value, _type: 'AKI' }))} /></label><label>Tipe Aki<input value={partForm.tipe_aki || ''} onChange={e => setPartForm(f => ({ ...f, tipe_aki: e.target.value, _type: 'AKI' }))} /></label><label>Nomor Aki<input value={partForm.nomor_aki || ''} onChange={e => setPartForm(f => ({ ...f, nomor_aki: e.target.value, _type: 'AKI' }))} /></label></>}<label className="full">Foto Kondisi Sebelum<input type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] || null)} /></label><label className="full">Keterangan<input value={partForm.keterangan} onChange={e => setPartForm(f => ({ ...f, keterangan: e.target.value }))} /></label><div className="full x-actions"><button className="x-btn primary" disabled={saving}>Simpan Riwayat</button></div></form></section><section className="x-card"><div className="x-table-wrap"><table className="x-table"><thead><tr><th>Kendaraan</th><th>Tanggal</th><th>KM</th><th>Alasan</th><th>Biaya</th></tr></thead><tbody>{(tab === 'ban' ? bans : akis).map(r => <tr key={r.id}><td>{vehicleMap[r.kendaraan_id]?.nomor_polisi || '-'}</td><td>{dateText(r.tanggal_penggantian)}</td><td>{Number(r.kilometer || 0).toLocaleString('id-ID')} km</td><td>{r.alasan_penggantian || '-'}</td><td>{money(r.biaya)}</td></tr>)}</tbody></table></div></section></>}

    {tab === 'km' && <><section className="x-card"><div className="x-card-title"><h3>Catat Kilometer</h3></div><form className="x-grid" onSubmit={addKm}><label>Kendaraan<select value={kmForm.kendaraan_id} onChange={e => setKmForm(f => ({ ...f, kendaraan_id: e.target.value }))}><option value="">Pilih</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.nomor_polisi} — terakhir {Number(v.kilometer_terakhir || 0).toLocaleString('id-ID')} km</option>)}</select></label><label>Tanggal<input type="date" value={kmForm.tanggal} onChange={e => setKmForm(f => ({ ...f, tanggal: e.target.value }))} /></label><label>KM<input type="number" min="0" value={kmForm.kilometer} onChange={e => setKmForm(f => ({ ...f, kilometer: e.target.value }))} /></label><label>Sumber<select value={kmForm.sumber} onChange={e => setKmForm(f => ({ ...f, sumber: e.target.value }))}><option>SERVICE</option><option>PEMAKAIAN</option><option>MANUAL</option><option>LAINNYA</option></select></label><label className="full">Keterangan<input value={kmForm.keterangan} onChange={e => setKmForm(f => ({ ...f, keterangan: e.target.value }))} /></label><div className="full x-actions"><button className="x-btn primary">Simpan KM</button></div></form></section><section className="x-card"><div className="x-table-wrap"><table className="x-table"><thead><tr><th>Kendaraan</th><th>Tanggal</th><th>KM</th><th>Sumber</th></tr></thead><tbody>{kms.map(k => <tr key={k.id}><td>{vehicleMap[k.kendaraan_id]?.nomor_polisi || '-'}</td><td>{dateText(k.tanggal)}</td><td>{Number(k.kilometer || 0).toLocaleString('id-ID')} km</td><td>{k.sumber}</td></tr>)}</tbody></table></div></section></>}

    {selected && <div className="x-overlay"><section className="x-modal"><div className="x-modal-head"><div><span className="eyebrow">DETAIL SERVICE</span><h3>{selected.nomor_service || `#${selected.id}`}</h3></div><button onClick={() => setSelected(null)}>×</button></div><div className="x-detail"><p><b>Kendaraan:</b> {vehicleMap[selected.kendaraan_id]?.nomor_polisi || '-'}</p><p><b>Jenis:</b> {TYPES[selected.jenis_service] || selected.jenis_service}</p><p><b>Estimasi:</b> {money(selected.estimasi_biaya)}</p><p><b>Status:</b> {STAT[selected.status] || selected.status}</p><p><b>Keluhan:</b> {selected.keluhan || '-'}</p>{canProcess && selected.status !== 'SELESAI' && <><label>Biaya Aktual<input type="number" min="0" value={detailEdit.biaya_aktual} onChange={e => setDetailEdit({ biaya_aktual: e.target.value })} /></label><div className="x-actions"><button className="x-btn secondary" onClick={updateActual} disabled={saving}>Simpan Biaya Aktual</button>{selected.status === 'DISETUJUI' && <button className="x-btn primary" onClick={() => finish({ ...selected, biaya_aktual: Number(detailEdit.biaya_aktual || 0) })} disabled={saving}>Selesaikan Service</button>}</div></>}</div></section></div>}
    {approvalModal && <div className="x-overlay"><section className="x-modal"><div className="x-modal-head"><div><span className="eyebrow">APPROVAL SERVICE</span><h3>{approvalModal.service.nomor_service || `#${approvalModal.service.id}`}</h3></div><button onClick={() => setApprovalModal(null)}>×</button></div><div className="x-detail"><p><b>Nilai yang dinilai:</b> {money(Number(approvalModal.service.biaya_aktual ?? approvalModal.service.estimasi_biaya ?? 0))}</p><p><b>Pemberi approval:</b> {approvalModal.required === 'DIREKTUR' ? 'Direktur' : 'Atasan Transport'}</p><label>Catatan Approval<textarea value={approvalNote} onChange={e => setApprovalNote(e.target.value)} placeholder="Opsional" /></label><div className="x-actions"><button className="x-btn secondary" onClick={() => setApprovalModal(null)}>Batal</button><button className="x-btn danger" onClick={() => confirmApproval(false)} disabled={saving}>Tolak</button><button className="x-btn primary" onClick={() => confirmApproval(true)} disabled={saving}>Setujui</button></div></div></section></div>}
  </div>
}
