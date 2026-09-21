import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import './MasterKendaraanExcelAlignedPage.css'
import { formatDateSafe } from '../utils/dateSafe'

const OWNERSHIP = { ASET: 'Aset', SEWA: 'Sewa' }
const VEHICLE_TYPES = ['Pickup', 'Minibus', 'Dump Truck']
const STNK_PHOTO = ['stnk', 'Foto STNK', 'foto_stnk_path']
const LEGACY_PHOTO_FIELDS = ['foto_depan_path', 'foto_belakang_path', 'foto_kiri_path', 'foto_kanan_path']
const EMPTY = {
  nomor_polisi: '', merk: '', tipe: '', jenis_kendaraan: 'Pickup', tahun: '', nomor_mesin: '', nomor_rangka: '',
  pemilik: '', kepemilikan: 'ASET', masa_berlaku_pajak: '', status_pajak: '', unit_kerja: '', driver_id: '', lokasi: '',
  keterangan: '', catatan_hutang: '', status: 'ACTIVE', kode_kendaraan: '',
}

const clean = value => String(value ?? '').trim()
const normalizeOwnership = value => {
  const v = clean(value).toUpperCase().replace(/\s+/g, '_')
  if (v === 'ASET' || v === 'ASET_KANTOR') return 'ASET'
  if (v === 'SEWA' || v === 'RENTAL' || v === 'KENDARAAN_SEWA') return 'SEWA'
  return ''
}
const formatDate = value => formatDateSafe(value)
const isInteractive = target => Boolean(target?.closest?.('button,input,select,textarea,a'))

export default function MasterKendaraanExcelAlignedPage({ profile }) {
  const canEdit = ['ADMIN', 'TRANSPORT'].includes(profile?.role)
  const canPhoto = profile?.role === 'ADMIN'
  const canDelete = profile?.role === 'ADMIN'
  const [vehicles, setVehicles] = useState([])
  const [drivers, setDrivers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [query, setQuery] = useState('')
  const [ownershipFilter, setOwnershipFilter] = useState('SEMUA')
  const [typeFilter, setTypeFilter] = useState('SEMUA')
  const [modal, setModal] = useState(false)
  const [detail, setDetail] = useState(null)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ ...EMPTY })
  const [photoFiles, setPhotoFiles] = useState({})
  const [photoUrls, setPhotoUrls] = useState({})
  const [selected, setSelected] = useState([])
  const [selectionMode, setSelectionMode] = useState(false)
  const pressRef = useRef(null)

  const loadData = async () => {
    setLoading(true)
    setError('')
    const [v, d] = await Promise.all([
      supabase.from('kendaraan').select('id,kode_kendaraan,nomor_polisi,merk,tipe,jenis_kendaraan,tahun,nomor_mesin,nomor_rangka,kepemilikan,pemilik,driver_id,lokasi,unit_kerja,masa_berlaku_pajak,status_pajak,keterangan,catatan_hutang,status,foto_stnk_path,foto_depan_path,foto_belakang_path,foto_kiri_path,foto_kanan_path').order('nomor_polisi'),
      supabase.from('driver').select('id,nama_lengkap,status').order('nama_lengkap'),
    ])
    if (v.error) setError(`Data kendaraan: ${v.error.message}`); else setVehicles((v.data || []).map(row => ({ ...row, kepemilikan: normalizeOwnership(row.kepemilikan) })))
    if (d.error) setError(prev => prev || `Data driver: ${d.error.message}`); else setDrivers(d.data || [])
    setSelected([])
    setSelectionMode(false)
    setLoading(false)
  }

  useEffect(() => {
    loadData()
    const onImported = event => { if (event.detail?.context === 'kendaraan') loadData() }
    window.addEventListener('transport:data-imported', onImported)
    return () => window.removeEventListener('transport:data-imported', onImported)
  }, [])

  const driverMap = useMemo(() => Object.fromEntries(drivers.map(d => [d.id, d])), [drivers])
  const ownerOptions = useMemo(() => Array.from(new Set(vehicles.map(v => clean(v.pemilik)).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'id')), [vehicles])
  const typeOptions = useMemo(() => Array.from(new Set([...VEHICLE_TYPES, ...vehicles.map(v => clean(v.jenis_kendaraan)).filter(Boolean)])), [vehicles])
  const filtered = useMemo(() => {
    const q = clean(query).toLowerCase()
    return vehicles.filter(v => {
      const driver = driverMap[v.driver_id]
      const haystack = [v.nomor_polisi, v.merk, v.tipe, v.jenis_kendaraan, v.pemilik, v.unit_kerja, v.lokasi, v.status_pajak, v.keterangan, v.catatan_hutang, driver?.nama_lengkap].filter(Boolean).join(' ').toLowerCase()
      return (!q || haystack.includes(q)) && (ownershipFilter === 'SEMUA' || v.kepemilikan === ownershipFilter) && (typeFilter === 'SEMUA' || v.jenis_kendaraan === typeFilter)
    })
  }, [vehicles, driverMap, query, ownershipFilter, typeFilter])

  const cards = useMemo(() => ({
    total: vehicles.length,
    pickup: vehicles.filter(v => clean(v.jenis_kendaraan).toLowerCase() === 'pickup').length,
    minibus: vehicles.filter(v => clean(v.jenis_kendaraan).toLowerCase() === 'minibus').length,
    dumpTruck: vehicles.filter(v => clean(v.jenis_kendaraan).toLowerCase() === 'dump truck').length,
  }), [vehicles])

  const resetModal = () => { setEditing(null); setForm({ ...EMPTY }); setPhotoFiles({}); setPhotoUrls({}); setModal(false); setError('') }
  const openNew = () => { setEditing(null); setForm({ ...EMPTY, kode_kendaraan: `KND-${Date.now()}` }); setPhotoFiles({}); setPhotoUrls({}); setError(''); setModal(true) }
  const openEdit = async vehicle => {
    setEditing(vehicle)
    setForm({ ...EMPTY, ...vehicle, kepemilikan: normalizeOwnership(vehicle.kepemilikan), driver_id: vehicle.driver_id ?? '' })
    setPhotoFiles({})
    setPhotoUrls({})
    setError('')
    setModal(true)
    if (vehicle.foto_stnk_path) {
      const { data } = await supabase.storage.from('kendaraan').createSignedUrl(vehicle.foto_stnk_path, 3600)
      if (data?.signedUrl) setPhotoUrls({ stnk: data.signedUrl })
    }
  }
  const change = event => {
    const { name, value } = event.target
    setForm(current => ({ ...current, [name]: value,  }))
  }

  const uploadStnkPhoto = async (vehicleId, file) => {
    if (!file) return null
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `foto-stnk/${vehicleId}/stnk-${Date.now()}-${safe}`
    const { error: uploadError } = await supabase.storage.from('kendaraan').upload(path, file, { upsert: true, contentType: file.type || undefined })
    if (uploadError) throw uploadError
    return path
  }

  const saveVehicle = async event => {
    event.preventDefault()
    if (!canEdit || saving) return
    setSaving(true); setError(''); setSuccess('')
    try {
      const ownership = normalizeOwnership(form.kepemilikan)
      const owner = clean(form.pemilik)
      if (!clean(form.nomor_polisi) || !clean(form.merk) || !clean(form.jenis_kendaraan)) throw new Error('Nomor polisi, merk, dan jenis kendaraan wajib diisi.')
      if (!VEHICLE_TYPES.includes(form.jenis_kendaraan) && !typeOptions.includes(form.jenis_kendaraan)) throw new Error('Jenis kendaraan harus mengikuti data Excel.')
      if (!ownership) throw new Error('Kepemilikan hanya boleh Aset atau Sewa.')
      if (ownership === 'SEWA' && !owner) throw new Error('Identitas pemilik wajib diisi untuk kendaraan sewa.')
      const payload = {
        kode_kendaraan: clean(form.kode_kendaraan) || `KND-${Date.now()}`,
        nomor_polisi: clean(form.nomor_polisi).toUpperCase(), merk: clean(form.merk), tipe: clean(form.tipe) || null,
        jenis_kendaraan: clean(form.jenis_kendaraan) || null, tahun: form.tahun === '' ? null : Number(form.tahun),
        nomor_mesin: clean(form.nomor_mesin) || null, nomor_rangka: clean(form.nomor_rangka) || null,
        kepemilikan: ownership, pemilik: owner || null,
        driver_id: form.driver_id === '' ? null : Number(form.driver_id), lokasi: clean(form.lokasi) || null, unit_kerja: clean(form.unit_kerja) || null,
        masa_berlaku_pajak: form.masa_berlaku_pajak || null, status_pajak: clean(form.status_pajak) || null,
        keterangan: clean(form.keterangan) || null, catatan_hutang: clean(form.catatan_hutang) || null,
        status: editing?.status || 'ACTIVE',
      }
      let result
      if (editing) result = await supabase.from('kendaraan').update(payload).eq('id', editing.id).select().single()
      else result = await supabase.from('kendaraan').insert(payload).select().single()
      if (result.error) throw result.error
      const vehicle = result.data
      if (canPhoto && photoFiles.stnk) {
        const uploadedPaths = []
        try {
          const uploadedPath = await uploadStnkPhoto(vehicle.id, photoFiles.stnk)
          uploadedPaths.push(uploadedPath)
          const { error: photoUpdateError } = await supabase.from('kendaraan').update({ foto_stnk_path: uploadedPath }).eq('id', vehicle.id)
          if (photoUpdateError) throw photoUpdateError
          if (editing?.foto_stnk_path) {
            const { error: cleanupError } = await supabase.storage.from('kendaraan').remove([editing.foto_stnk_path])
            if (cleanupError) console.warn('Foto STNK lama gagal dibersihkan:', cleanupError.message)
          }
        } catch (photoError) {
          if (uploadedPaths.length) await supabase.storage.from('kendaraan').remove(uploadedPaths)
          if (!editing) await supabase.from('kendaraan').delete().eq('id', vehicle.id)
          throw photoError
        }
      }
      setSuccess(editing ? 'Data kendaraan diperbarui.' : 'Kendaraan baru berhasil ditambahkan.')
      resetModal()
      await loadData()
    } catch (saveError) {
      setError(saveError.message || 'Gagal menyimpan kendaraan.')
    } finally { setSaving(false) }
  }

  const canDeleteVehicle = async vehicle => {
    const checks = await Promise.all([
      supabase.from('permintaan_service').select('id', { count: 'exact', head: true }).eq('kendaraan_id', vehicle.id),
      supabase.from('service').select('id', { count: 'exact', head: true }).eq('kendaraan_id', vehicle.id),
      supabase.from('dokumen_kendaraan').select('id', { count: 'exact', head: true }).eq('kendaraan_id', vehicle.id),
      supabase.from('kontrak_sewa').select('id', { count: 'exact', head: true }).eq('kendaraan_id', vehicle.id),
      supabase.from('perbaikan_sewa').select('id', { count: 'exact', head: true }).eq('kendaraan_id', vehicle.id),
      supabase.from('riwayat_ban').select('id', { count: 'exact', head: true }).eq('kendaraan_id', vehicle.id),
      supabase.from('riwayat_aki').select('id', { count: 'exact', head: true }).eq('kendaraan_id', vehicle.id),
      supabase.from('riwayat_kilometer').select('id', { count: 'exact', head: true }).eq('kendaraan_id', vehicle.id),
    ])
    if (checks.some(item => item.error)) return { ok: false, reason: 'Pemeriksaan relasi kendaraan gagal.' }
    if (checks.some(item => Number(item.count || 0) > 0)) return { ok: false, reason: `Kendaraan ${vehicle.nomor_polisi} masih terhubung ke riwayat/transaksi lain. Data tidak dihapus.` }
    return { ok: true }
  }
  const deleteOne = async vehicle => {
    if (!canDelete) return false
    const check = await canDeleteVehicle(vehicle)
    if (!check.ok) { setError(check.reason); return false }
    const { error: deleteError } = await supabase.from('kendaraan').delete().eq('id', vehicle.id)
    if (deleteError) { setError(deleteError.message); return false }
    const photoPaths = [
      vehicle.foto_stnk_path,
      ...LEGACY_PHOTO_FIELDS.map(field => vehicle[field]),
    ].filter(Boolean)
    if (photoPaths.length) {
      const { error: photoDeleteError } = await supabase.storage.from('kendaraan').remove(photoPaths)
      if (photoDeleteError) console.warn('Foto kendaraan gagal dibersihkan dari Storage:', photoDeleteError.message)
    }
    return true
  }

  const beginLongPress = (event, id) => {
    if (event.button !== undefined && event.button !== 0) return
    if (isInteractive(event.target) || selectionMode) return
    const startX = event.clientX; const startY = event.clientY
    if (pressRef.current?.timer) clearTimeout(pressRef.current.timer)
    pressRef.current = { timer: window.setTimeout(() => { setSelectionMode(true); setSelected(current => current.includes(id) ? current : [...current, id]); pressRef.current = null }, 480), startX, startY }
  }
  const moveLongPress = event => {
    const state = pressRef.current
    if (!state) return
    if (Math.hypot(event.clientX - state.startX, event.clientY - state.startY) > 10) { clearTimeout(state.timer); pressRef.current = null }
  }
  const stopLongPress = () => { if (pressRef.current?.timer) clearTimeout(pressRef.current.timer); pressRef.current = null }
  const toggleSelected = id => setSelected(current => current.includes(id) ? current.filter(x => x !== id) : [...current, id])
  const allSelected = filtered.length > 0 && filtered.every(v => selected.includes(v.id))
  const toggleAll = () => setSelected(current => allSelected ? current.filter(id => !filtered.some(v => v.id === id)) : Array.from(new Set([...current, ...filtered.map(v => v.id)])))
  const exitSelection = () => { setSelectionMode(false); setSelected([]) }
  const bulkDelete = async () => {
    if (!canDelete || !selected.length || !window.confirm(`Hapus ${selected.length} kendaraan terpilih?`)) return
    setSaving(true); setError(''); let removed = 0
    for (const vehicle of vehicles.filter(v => selected.includes(v.id))) if (await deleteOne(vehicle)) removed += 1
    exitSelection(); await loadData(); setSaving(false)
    if (removed) setSuccess(`${removed} kendaraan berhasil dihapus.`)
  }
  const openDetail = async vehicle => {
    setDetail({ ...vehicle, driver: driverMap[vehicle.driver_id] })
    setPhotoUrls({})
    if (vehicle.foto_stnk_path) {
      const { data } = await supabase.storage.from('kendaraan').createSignedUrl(vehicle.foto_stnk_path, 3600)
      if (data?.signedUrl) setPhotoUrls({ stnk: data.signedUrl })
    }
  }

  return <div className="master-excel-page">
    <div className="mep-head"><div><span className="eyebrow">MASTER DATA KENDARAAN</span><h2>Kendaraan</h2><p>Kolom dan pilihan mengikuti Data Kendaraan Excel. Kepemilikan hanya Aset atau Sewa.</p></div>{canEdit && <button className="mep-primary" type="button" onClick={openNew}>+ Kendaraan</button>}</div>
    {success && <div className="mep-alert success">{success}</div>}{error && !modal && <div className="mep-alert error">{error}</div>}
    <div className="mep-cards"><div><span>Total Kendaraan</span><b>{cards.total}</b></div><div><span>Pickup</span><b>{cards.pickup}</b></div><div><span>Minibus</span><b>{cards.minibus}</b></div><div><span>Dump Truck</span><b>{cards.dumpTruck}</b></div></div>
    <section className="mep-card"><div className="mep-toolbar"><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Cari No. Pol, merk, pemilik, driver, lokasi..."/><select value={ownershipFilter} onChange={e => setOwnershipFilter(e.target.value)}><option value="SEMUA">Semua kepemilikan</option><option value="ASET">Aset</option><option value="SEWA">Sewa</option></select><select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}><option value="SEMUA">Semua jenis</option>{typeOptions.map(item => <option key={item} value={item}>{item}</option>)}</select><button type="button" className="mep-secondary" onClick={loadData} disabled={loading}>↻ Refresh</button></div>
      {selectionMode && <div className="mep-selection"><span><b>{selected.length}</b> kendaraan dipilih</span><div><button type="button" onClick={toggleAll}>{allSelected ? 'Batal pilih semua' : 'Pilih semua'}</button><button type="button" onClick={exitSelection}>Batal</button>{canDelete && <button type="button" className="danger" onClick={bulkDelete} disabled={saving}>Hapus yang dipilih</button>}</div></div>}
      {!selectionMode && filtered.length > 0 && <p className="mep-hint">Tekan dan tahan baris sekitar 0,5 detik untuk masuk mode pilih.</p>}
      <div className="mep-table-wrap">{loading ? <div className="mep-empty">Memuat data...</div> : filtered.length === 0 ? <div className="mep-empty"><b>Belum ada data kendaraan.</b><span>Import Excel atau tambah kendaraan secara manual.</span></div> : <table className="mep-table"><thead><tr>{selectionMode && <th className="mep-check"><input type="checkbox" aria-label="Pilih semua" checked={allSelected} onChange={toggleAll}/></th>}<th>No. Pol / Merk / Type</th><th>Jenis</th><th>Kepemilikan</th><th>Pemilik</th><th>Driver</th><th>Lokasi Kerja</th><th>Pajak</th><th>Keterangan</th><th>Aksi</th></tr></thead><tbody>{filtered.map(v => { const driver = driverMap[v.driver_id]; const picked = selected.includes(v.id); return <tr key={v.id} className={picked ? 'picked' : ''} onPointerDown={e => beginLongPress(e, v.id)} onPointerMove={moveLongPress} onPointerUp={stopLongPress} onPointerCancel={stopLongPress} onClick={e => { if (isInteractive(e.target)) return; if (selectionMode) toggleSelected(v.id) }}>
        {selectionMode && <td className="mep-check"><input type="checkbox" checked={picked} onChange={() => toggleSelected(v.id)} aria-label={`Pilih ${v.nomor_polisi}`}/></td>}
        <td><b>{v.nomor_polisi}</b><span>{v.merk} {v.tipe || ''}</span><small>{v.tahun || '-'}{v.nomor_mesin ? ` • Mesin ${v.nomor_mesin}` : ''}</small></td>
        <td><span className="mep-pill">{v.jenis_kendaraan || '-'}</span></td>
        <td><b>{OWNERSHIP[normalizeOwnership(v.kepemilikan)] || '-'}</b></td>
        <td><span>{v.pemilik || '-'}</span></td>
        <td><span>{driver?.nama_lengkap || '-'}</span></td>
        <td><span>{v.lokasi || '-'}</span><small>{v.unit_kerja || '-'}</small></td>
        <td><span>{v.masa_berlaku_pajak ? formatDate(v.masa_berlaku_pajak) : '-'}</span><small>{v.status_pajak || '-'}</small></td>
        <td><span>{v.keterangan || '-'}</span><small>{v.catatan_hutang || ''}</small></td>
        <td className="mep-actions"><button type="button" onClick={() => openDetail(v)}>Detail</button>{canEdit && <button type="button" onClick={() => openEdit(v)}>Edit</button>}{canDelete && <button type="button" onClick={async () => { if (window.confirm(`Hapus kendaraan ${v.nomor_polisi}?`)) { if (await deleteOne(v)) await loadData() } }}>Hapus</button>}</td>
      </tr> })}</tbody></table>}</div>
    </section>

    {modal && <div className="mep-overlay"><section className="mep-modal"><header><div><span className="eyebrow">DATA KENDARAAN</span><h3>{editing ? 'Edit Kendaraan' : 'Tambah Kendaraan'}</h3></div><button type="button" onClick={resetModal}>×</button></header>{error && <div className="mep-alert error">{error}</div>}<form onSubmit={saveVehicle}><div className="mep-form">
      <label>No. Pol<input name="nomor_polisi" value={form.nomor_polisi} onChange={change} required/></label>
      <label>Merk<input name="merk" value={form.merk} onChange={change} required/></label>
      <label>Type<input name="tipe" value={form.tipe} onChange={change}/></label>
      <label>Jenis<select name="jenis_kendaraan" value={form.jenis_kendaraan} onChange={change}>{typeOptions.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
      <label>Tahun<input name="tahun" type="number" min="1900" max="2100" value={form.tahun ?? ''} onChange={change}/></label>
      <label>No. Mesin<input name="nomor_mesin" value={form.nomor_mesin ?? ''} onChange={change}/></label>
      <label>No. Rangka<input name="nomor_rangka" value={form.nomor_rangka ?? ''} onChange={change}/></label>
      <label>Kepemilikan<select name="kepemilikan" value={normalizeOwnership(form.kepemilikan) || 'ASET'} onChange={change}><option value="ASET">Aset</option><option value="SEWA">Sewa</option></select></label>
      <label>Pemilik<input name="pemilik" value={form.pemilik ?? ''} onChange={change} placeholder={normalizeOwnership(form.kepemilikan) === 'SEWA' ? 'Wajib diisi untuk kendaraan sewa' : 'Opsional untuk aset'} required={normalizeOwnership(form.kepemilikan) === 'SEWA'} list="transport-owner-options" /></label>
      <datalist id="transport-owner-options">{ownerOptions.map(owner => <option key={owner} value={owner} />)}</datalist>
      <label>Masa Berlaku Pajak<input name="masa_berlaku_pajak" type="date" value={form.masa_berlaku_pajak ?? ''} onChange={change}/></label>
      <label>Status Pajak<input name="status_pajak" value={form.status_pajak ?? ''} onChange={change}/></label>
      <label>Unit Kerja<input name="unit_kerja" value={form.unit_kerja ?? ''} onChange={change}/></label>
      <label>Driver<select name="driver_id" value={form.driver_id ?? ''} onChange={change}><option value="">Tanpa driver</option>{drivers.filter(d => d.status === 'AKTIF' || d.id === Number(form.driver_id)).map(d => <option key={d.id} value={d.id}>{d.nama_lengkap}</option>)}</select></label>
      <label>Lokasi Kerja<input name="lokasi" value={form.lokasi ?? ''} onChange={change}/></label>
      <label className="full">Keterangan<textarea name="keterangan" value={form.keterangan ?? ''} onChange={change}/></label>
      <label className="full">Catatan Hutang<textarea name="catatan_hutang" value={form.catatan_hutang ?? ''} onChange={change}/></label>
    </div>
    <div className="mep-photo-section"><div><b>Foto STNK (opsional)</b><span>Hanya Administrator yang dapat mengunggah atau mengganti foto STNK kendaraan.</span></div><div className="mep-photo-grid mep-photo-grid-stnk"><label className="mep-photo"><span>{STNK_PHOTO[1]}</span>{photoUrls.stnk ? <img src={photoUrls.stnk} alt="Foto STNK kendaraan"/> : <div className="mep-photo-empty">Belum ada foto STNK</div>}{canPhoto && <input type="file" accept="image/*" onChange={e => setPhotoFiles(current => ({ ...current, stnk: e.target.files?.[0] || null }))}/>} {!canPhoto && <small>Upload khusus Admin</small>}{editing?.foto_stnk_path && <small>Foto STNK tersimpan</small>}</label></div></div>
    <div className="mep-form-actions"><button type="button" className="mep-secondary" onClick={resetModal}>Batal</button><button type="submit" className="mep-primary" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan Kendaraan'}</button></div></form></section></div>}

    {detail && <div className="mep-overlay"><section className="mep-modal small"><header><div><span className="eyebrow">DETAIL KENDARAAN</span><h3>{detail.nomor_polisi}</h3></div><button type="button" onClick={() => setDetail(null)}>×</button></header><div className="mep-detail"><div><span>Merk / Type</span><b>{detail.merk} {detail.tipe || ''}</b></div><div><span>Jenis</span><b>{detail.jenis_kendaraan || '-'}</b></div><div><span>Kepemilikan</span><b>{OWNERSHIP[normalizeOwnership(detail.kepemilikan)] || '-'}</b></div><div><span>Pemilik</span><b>{detail.pemilik || '-'}</b></div><div><span>Tahun</span><b>{detail.tahun || '-'}</b></div><div><span>No. Mesin</span><b>{detail.nomor_mesin || '-'}</b></div><div><span>No. Rangka</span><b>{detail.nomor_rangka || '-'}</b></div><div><span>Masa Berlaku Pajak</span><b>{formatDate(detail.masa_berlaku_pajak)}</b></div><div><span>Status Pajak</span><b>{detail.status_pajak || '-'}</b></div><div><span>Unit Kerja</span><b>{detail.unit_kerja || '-'}</b></div><div><span>Driver</span><b>{driverMap[detail.driver_id]?.nama_lengkap || '-'}</b></div><div><span>Lokasi Kerja</span><b>{detail.lokasi || '-'}</b></div><div className="full"><span>Keterangan</span><b>{detail.keterangan || '-'}</b></div><div className="full"><span>Catatan Hutang</span><b>{detail.catatan_hutang || '-'}</b></div></div><div className="mep-detail-photos mep-detail-photos-stnk"><div><span>Foto STNK</span>{photoUrls.stnk ? <img src={photoUrls.stnk} alt="Foto STNK kendaraan"/> : <div className="mep-photo-empty">Belum ada foto STNK</div>}</div></div><div className="mep-form-actions"><button type="button" className="mep-secondary" onClick={() => setDetail(null)}>Tutup</button>{canEdit && <button type="button" className="mep-primary" onClick={() => { const current = detail; setDetail(null); openEdit(current) }}>Edit Kendaraan</button>}</div></section></div>}
  </div>
}