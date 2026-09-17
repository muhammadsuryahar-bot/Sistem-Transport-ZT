import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import './MasterKendaraanExcelAlignedPage.css'

const VEHICLE_TYPES = ['Pickup', 'Minibus', 'Dump Truck']
const OWNERSHIP = { ASET: 'Aset', SEWA: 'Sewa' }
const PHOTO_SIDES = [
  ['depan', 'Depan', 'foto_depan_path'],
  ['belakang', 'Belakang', 'foto_belakang_path'],
  ['kiri', 'Kiri', 'foto_kiri_path'],
  ['kanan', 'Kanan', 'foto_kanan_path'],
]
const EMPTY = {
  nomor_polisi: '', merk: '', tipe: '', jenis_kendaraan: '', tahun: '', nomor_mesin: '', nomor_rangka: '',
  pemilik: '', kepemilikan: 'ASET', masa_berlaku_pajak: '', status_pajak: '', unit_kerja: '', driver_id: '',
  lokasi: '', keterangan: '', catatan_hutang: '', status: 'ACTIVE', kode_kendaraan: '',
}

const clean = value => String(value ?? '').trim()
const normalizeOwnership = value => {
  const v = clean(value).toUpperCase().replace(/\s+/g, '_')
  if (v === 'ASET' || v === 'ASET_KANTOR') return 'ASET'
  if (v === 'SEWA') return 'SEWA'
  return ''
}
const formatDate = value => {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(date)
}
const isInteractive = target => Boolean(target?.closest?.('button,input,select,textarea,a'))

export default function MasterKendaraanFinalPage({ profile }) {
  const canEdit = ['ADMIN', 'TRANSPORT'].includes(profile?.role)
  const canDelete = profile?.role === 'ADMIN'
  const canPhoto = profile?.role === 'ADMIN'
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
    const [vehiclesResult, driversResult] = await Promise.all([
      supabase.from('kendaraan').select('id,kode_kendaraan,nomor_polisi,merk,tipe,jenis_kendaraan,tahun,nomor_mesin,nomor_rangka,kepemilikan,pemilik,driver_id,lokasi,unit_kerja,masa_berlaku_pajak,status_pajak,keterangan,catatan_hutang,status,foto_depan_path,foto_belakang_path,foto_kiri_path,foto_kanan_path').order('nomor_polisi'),
      supabase.from('driver').select('id,nama_lengkap,status').order('nama_lengkap'),
    ])
    if (vehiclesResult.error) setError(`Data kendaraan: ${vehiclesResult.error.message}`)
    else setVehicles((vehiclesResult.data || []).map(row => ({ ...row, kepemilikan: normalizeOwnership(row.kepemilikan) })))
    if (driversResult.error) setError(previous => previous || `Data driver: ${driversResult.error.message}`)
    else setDrivers(driversResult.data || [])
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

  const driverMap = useMemo(() => Object.fromEntries(drivers.map(driver => [driver.id, driver])), [drivers])
  const ownerOptions = useMemo(() => Array.from(new Set(vehicles.map(vehicle => clean(vehicle.pemilik)).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'id')), [vehicles])
  const typeOptions = useMemo(() => Array.from(new Set([...VEHICLE_TYPES, ...vehicles.map(vehicle => clean(vehicle.jenis_kendaraan)).filter(Boolean)])), [vehicles])
  const filtered = useMemo(() => {
    const needle = clean(query).toLowerCase()
    return vehicles.filter(vehicle => {
      const driverName = driverMap[vehicle.driver_id]?.nama_lengkap || ''
      const haystack = [vehicle.nomor_polisi, vehicle.merk, vehicle.tipe, vehicle.jenis_kendaraan, vehicle.pemilik, vehicle.unit_kerja, vehicle.lokasi, vehicle.status_pajak, vehicle.keterangan, vehicle.catatan_hutang, driverName].filter(Boolean).join(' ').toLowerCase()
      return (!needle || haystack.includes(needle)) && (ownershipFilter === 'SEMUA' || vehicle.kepemilikan === ownershipFilter) && (typeFilter === 'SEMUA' || vehicle.jenis_kendaraan === typeFilter)
    })
  }, [vehicles, driverMap, query, ownershipFilter, typeFilter])
  const cards = useMemo(() => ({
    total: vehicles.length,
    pickup: vehicles.filter(v => clean(v.jenis_kendaraan).toLowerCase() === 'pickup').length,
    minibus: vehicles.filter(v => clean(v.jenis_kendaraan).toLowerCase() === 'minibus').length,
    dumpTruck: vehicles.filter(v => clean(v.jenis_kendaraan).toLowerCase() === 'dump truck').length,
  }), [vehicles])

  const resetForm = () => {
    setEditing(null)
    setForm({ ...EMPTY })
    setPhotoFiles({})
    setPhotoUrls({})
    setModal(false)
  }
  const openNew = () => {
    if (!canEdit) return
    setEditing(null)
    setForm({ ...EMPTY, jenis_kendaraan: VEHICLE_TYPES[0], kepemilikan: 'ASET', kode_kendaraan: `KND-${Date.now()}` })
    setPhotoFiles({})
    setPhotoUrls({})
    setError('')
    setModal(true)
  }
  const openEdit = async vehicle => {
    if (!canEdit) return
    setEditing(vehicle)
    setForm({ ...EMPTY, ...vehicle, kepemilikan: normalizeOwnership(vehicle.kepemilikan), driver_id: vehicle.driver_id ?? '' })
    setPhotoFiles({})
    setPhotoUrls({})
    setError('')
    setModal(true)
    if (canPhoto) await loadPhotoUrls(vehicle)
  }
  const change = event => {
    const { name, value } = event.target
    setForm(current => ({ ...current, [name]: value }))
  }
  const loadPhotoUrls = async vehicle => {
    const entries = await Promise.all(PHOTO_SIDES.filter(([, , field]) => vehicle[field]).map(async ([side, , field]) => {
      const { data } = await supabase.storage.from('kendaraan').createSignedUrl(vehicle[field], 3600)
      return [side, data?.signedUrl || '']
    }))
    setPhotoUrls(Object.fromEntries(entries.filter(([, url]) => url)))
  }
  const choosePhoto = (side, file) => setPhotoFiles(current => ({ ...current, [side]: file || null }))

  const uploadPhoto = async (vehicleId, side, file) => {
    if (!file) return null
    if (!file.type.startsWith('image/')) throw new Error(`Foto ${side} harus berupa gambar.`)
    if (file.size > 5 * 1024 * 1024) throw new Error(`Foto ${side} maksimal 5 MB.`)
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `foto-kendaraan/${vehicleId}/${side}-${Date.now()}-${safeName}`
    const { error: uploadError } = await supabase.storage.from('kendaraan').upload(path, file, { upsert: true, contentType: file.type })
    if (uploadError) throw uploadError
    return path
  }

  const saveVehicle = async event => {
    event.preventDefault()
    if (!canEdit || saving) return
    setSaving(true); setError(''); setSuccess('')
    try {
      const ownership = normalizeOwnership(form.kepemilikan)
      if (!clean(form.nomor_polisi) || !clean(form.merk) || !clean(form.tipe) || !clean(form.jenis_kendaraan)) throw new Error('No. Pol, Merk, Type, dan Jenis wajib diisi.')
      if (!['ASET', 'SEWA'].includes(ownership)) throw new Error('Status kepemilikan harus Aset atau Sewa.')
      if (!typeOptions.includes(form.jenis_kendaraan)) throw new Error('Jenis kendaraan harus mengikuti data Excel.')
      if (!ownerOptions.includes(clean(form.pemilik))) throw new Error('Pemilik harus dipilih dari data Excel yang tersedia.')
      if (form.tahun !== '' && !/^\d{4}$/.test(String(form.tahun))) throw new Error('Tahun harus 4 digit.')

      const payload = {
        kode_kendaraan: clean(form.kode_kendaraan) || `KND-${Date.now()}`,
        nomor_polisi: clean(form.nomor_polisi).toUpperCase(),
        merk: clean(form.merk),
        tipe: clean(form.tipe),
        jenis_kendaraan: clean(form.jenis_kendaraan),
        tahun: form.tahun === '' ? null : Number(form.tahun),
        nomor_mesin: clean(form.nomor_mesin) || null,
        nomor_rangka: clean(form.nomor_rangka) || null,
        kepemilikan: ownership,
        pemilik: clean(form.pemilik),
        driver_id: form.driver_id === '' ? null : Number(form.driver_id),
        lokasi: clean(form.lokasi) || null,
        unit_kerja: clean(form.unit_kerja) || null,
        masa_berlaku_pajak: form.masa_berlaku_pajak || null,
        status_pajak: clean(form.status_pajak) || null,
        keterangan: clean(form.keterangan) || null,
        catatan_hutang: clean(form.catatan_hutang) || null,
        status: editing?.status || 'ACTIVE',
      }
      const result = editing
        ? await supabase.from('kendaraan').update(payload).eq('id', editing.id).select().single()
        : await supabase.from('kendaraan').insert(payload).select().single()
      if (result.error) throw result.error

      if (canPhoto) {
        for (const [side, , field] of PHOTO_SIDES) {
          const file = photoFiles[side]
          if (!file) continue
          const path = await uploadPhoto(result.data.id, side, file)
          const { error: pathError } = await supabase.from('kendaraan').update({ [field]: path }).eq('id', result.data.id)
          if (pathError) throw pathError
        }
      }
      resetForm()
      setSuccess(editing ? 'Data kendaraan berhasil diperbarui.' : 'Kendaraan baru berhasil ditambahkan.')
      await loadData()
    } catch (saveError) {
      setError(saveError.message || 'Gagal menyimpan kendaraan.')
    } finally {
      setSaving(false)
    }
  }

  const checkDelete = async vehicle => {
    const relations = await Promise.all([
      supabase.from('permintaan_service').select('id', { count: 'exact', head: true }).eq('kendaraan_id', vehicle.id),
      supabase.from('service').select('id', { count: 'exact', head: true }).eq('kendaraan_id', vehicle.id),
      supabase.from('dokumen_kendaraan').select('id', { count: 'exact', head: true }).eq('kendaraan_id', vehicle.id),
      supabase.from('kontrak_sewa').select('id', { count: 'exact', head: true }).eq('kendaraan_id', vehicle.id),
      supabase.from('perbaikan_sewa').select('id', { count: 'exact', head: true }).eq('kendaraan_id', vehicle.id),
    ])
    if (relations.some(row => row.error)) return { ok: false, reason: 'Pemeriksaan relasi kendaraan gagal. Data tidak dihapus.' }
    if (relations.some(row => Number(row.count || 0) > 0)) return { ok: false, reason: `Kendaraan ${vehicle.nomor_polisi} masih terhubung ke data transaksi.` }
    return { ok: true }
  }
  const deleteOne = async vehicle => {
    const check = await checkDelete(vehicle)
    if (!check.ok) { setError(check.reason); return false }
    const photoPaths = PHOTO_SIDES.map(([, , field]) => vehicle[field]).filter(Boolean)
    if (photoPaths.length) {
      const { error: storageError } = await supabase.storage.from('kendaraan').remove(photoPaths)
      if (storageError) { setError(`Foto kendaraan gagal dihapus: ${storageError.message}`); return false }
    }
    const { error: deleteError } = await supabase.from('kendaraan').delete().eq('id', vehicle.id)
    if (deleteError) { setError(deleteError.message); return false }
    return true
  }

  const startPress = (event, id) => {
    if (event.button !== undefined && event.button !== 0) return
    if (selectionMode || isInteractive(event.target)) return
    const startX = event.clientX; const startY = event.clientY
    pressRef.current = { timer: window.setTimeout(() => { setSelectionMode(true); setSelected(current => current.includes(id) ? current : [...current, id]); pressRef.current = null }, 480), startX, startY }
  }
  const movePress = event => {
    if (!pressRef.current) return
    if (Math.hypot(event.clientX - pressRef.current.startX, event.clientY - pressRef.current.startY) > 10) {
      window.clearTimeout(pressRef.current.timer); pressRef.current = null
    }
  }
  const endPress = () => {
    if (pressRef.current?.timer) window.clearTimeout(pressRef.current.timer)
    pressRef.current = null
  }
  const toggleSelected = id => setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  const allSelected = filtered.length > 0 && filtered.every(vehicle => selected.includes(vehicle.id))
  const toggleAll = () => setSelected(current => allSelected ? current.filter(id => !filtered.some(vehicle => vehicle.id === id)) : Array.from(new Set([...current, ...filtered.map(vehicle => vehicle.id)])))
  const cancelSelection = () => { setSelectionMode(false); setSelected([]) }
  const bulkDelete = async () => {
    if (!canDelete || !selected.length) return
    if (!window.confirm(`Hapus ${selected.length} kendaraan yang dipilih?`)) return
    setSaving(true); setError(''); let removed = 0
    for (const vehicle of vehicles.filter(item => selected.includes(item.id))) if (await deleteOne(vehicle)) removed += 1
    cancelSelection()
    await loadData()
    if (removed) setSuccess(`${removed} kendaraan berhasil dihapus.`)
    setSaving(false)
  }
  const openDetail = async vehicle => {
    setDetail({ ...vehicle, driver: driverMap[vehicle.driver_id] })
    setPhotoUrls({})
    await loadPhotoUrls(vehicle)
  }

  return <div className="master-excel-page">
    <div className="mep-head">
      <div><span className="eyebrow">MASTER DATA KENDARAAN</span><h2>Kendaraan</h2><p>Kolom utama mengikuti Data Kendaraan Excel. Status kepemilikan hanya Aset atau Sewa.</p></div>
      {canEdit && <button className="mep-primary" type="button" onClick={openNew}>+ Kendaraan</button>}
    </div>
    {success && <div className="mep-alert success">{success}</div>}
    {error && !modal && <div className="mep-alert error">{error}</div>}

    <div className="mep-cards">
      <div><span>Total Kendaraan</span><b>{cards.total}</b></div>
      <div><span>Pickup</span><b>{cards.pickup}</b></div>
      <div><span>Minibus</span><b>{cards.minibus}</b></div>
      <div><span>Dump Truck</span><b>{cards.dumpTruck}</b></div>
    </div>

    <section className="mep-card">
      <div className="mep-toolbar">
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Cari No. Pol, merk, type, pemilik, driver..." />
        <select value={ownershipFilter} onChange={event => setOwnershipFilter(event.target.value)}><option value="SEMUA">Semua status</option><option value="ASET">Aset</option><option value="SEWA">Sewa</option></select>
        <select value={typeFilter} onChange={event => setTypeFilter(event.target.value)}><option value="SEMUA">Semua jenis</option>{typeOptions.map(type => <option key={type} value={type}>{type}</option>)}</select>
        {selectionMode ? <button className="mep-secondary" type="button" onClick={cancelSelection}>Batal pilih</button> : <span className="mep-hint">Tekan & tahan satu baris untuk memilih.</span>}
      </div>

      {selectionMode && <div className="mep-selection"><strong>{selected.length} dipilih</strong><div><button type="button" onClick={toggleAll}>{allSelected ? 'Batal semua' : 'Pilih semua'}</button>{canDelete && <button className="danger" type="button" disabled={!selected.length || saving} onClick={bulkDelete}>Hapus yang dipilih</button>}</div></div>}

      <div className="mep-table-wrap">
        <table className="mep-table">
          <thead><tr>
            {selectionMode && <th className="mep-check">Pilih</th>}
            <th>No. Pol</th><th>Merk</th><th>Type</th><th>Jenis</th><th>Tahun</th><th>No. Mesin</th><th>No. Rangka</th><th>Pemilik</th><th>Status</th><th>Masa Berlaku Pajak</th><th>Status Pajak</th><th>Unit Kerja</th><th>Driver</th><th>Lokasi Kerja</th><th>Keterangan</th><th>Catatan Hutang</th><th>Aksi</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={selectionMode ? 18 : 17} className="mep-empty">Memuat data kendaraan...</td></tr> : filtered.length === 0 ? <tr><td colSpan={selectionMode ? 18 : 17} className="mep-empty"><b>Data kendaraan tidak ditemukan.</b><span>Sesuaikan pencarian atau filter.</span></td></tr> : filtered.map(vehicle => {
              const driver = driverMap[vehicle.driver_id]
              const picked = selected.includes(vehicle.id)
              return <tr key={vehicle.id} className={picked ? 'picked' : ''} onMouseDown={event => startPress(event, vehicle.id)} onMouseMove={movePress} onMouseUp={endPress} onMouseLeave={endPress} onTouchStart={event => startPress(event, vehicle.id)} onTouchMove={movePress} onTouchEnd={endPress}>
                {selectionMode && <td className="mep-check"><input type="checkbox" checked={picked} onChange={() => toggleSelected(vehicle.id)} aria-label={`Pilih ${vehicle.nomor_polisi}`} /></td>}
                <td><b>{vehicle.nomor_polisi || '-'}</b></td><td>{vehicle.merk || '-'}</td><td>{vehicle.tipe || '-'}</td><td>{vehicle.jenis_kendaraan || '-'}</td><td>{vehicle.tahun || '-'}</td><td>{vehicle.nomor_mesin || '-'}</td><td>{vehicle.nomor_rangka || '-'}</td><td>{vehicle.pemilik || '-'}</td><td><span className="mep-pill">{OWNERSHIP[vehicle.kepemilikan] || '-'}</span></td><td>{formatDate(vehicle.masa_berlaku_pajak)}</td><td>{vehicle.status_pajak || '-'}</td><td>{vehicle.unit_kerja || '-'}</td><td>{driver?.nama_lengkap || '-'}</td><td>{vehicle.lokasi || '-'}</td><td>{vehicle.keterangan || '-'}</td><td>{vehicle.catatan_hutang || '-'}</td>
                <td className="mep-actions">{canEdit && <button type="button" onClick={() => openEdit(vehicle)}>Edit</button>}<button type="button" onClick={() => openDetail(vehicle)}>Detail</button>{canDelete && <button type="button" onClick={async () => { if (!window.confirm(`Hapus ${vehicle.nomor_polisi}?`)) return; setSaving(true); const removed = await deleteOne(vehicle); await loadData(); setSaving(false); if (removed) setSuccess(`Kendaraan ${vehicle.nomor_polisi} berhasil dihapus.`) }}>Hapus</button>}</td>
              </tr>
            })}
          </tbody>
        </table>
      </div>
    </section>

    {modal && <div className="mep-overlay"><form className="mep-modal" onSubmit={saveVehicle}>
      <header><div><span className="eyebrow">{editing ? 'EDIT DATA' : 'TAMBAH DATA'}</span><h3>{editing ? `Edit ${editing.nomor_polisi}` : 'Kendaraan Baru'}</h3></div><button type="button" onClick={resetForm}>×</button></header>
      {error && <div className="mep-alert error">{error}</div>}
      <div className="mep-form">
        <label>No. Pol<input name="nomor_polisi" value={form.nomor_polisi} onChange={change} /></label>
        <label>Merk<input name="merk" value={form.merk} onChange={change} /></label>
        <label>Type<input name="tipe" value={form.tipe} onChange={change} /></label>
        <label>Jenis<select name="jenis_kendaraan" value={form.jenis_kendaraan} onChange={change}><option value="">— Pilih jenis —</option>{typeOptions.map(type => <option key={type} value={type}>{type}</option>)}</select></label>
        <label>Tahun<input name="tahun" inputMode="numeric" maxLength={4} value={form.tahun} onChange={change} /></label>
        <label>No. Mesin<input name="nomor_mesin" value={form.nomor_mesin} onChange={change} /></label>
        <label>No. Rangka<input name="nomor_rangka" value={form.nomor_rangka} onChange={change} /></label>
        <label>Status<select name="kepemilikan" value={form.kepemilikan} onChange={change}><option value="ASET">Aset</option><option value="SEWA">Sewa</option></select></label>
        <label>Pemilik<select name="pemilik" value={form.pemilik} onChange={change}><option value="">— Pilih pemilik dari data Excel —</option>{ownerOptions.map(owner => <option key={owner} value={owner}>{owner}</option>)}</select></label>
        <label>Driver<select name="driver_id" value={form.driver_id} onChange={change}><option value="">— Pilih driver —</option>{drivers.map(driver => <option key={driver.id} value={driver.id}>{driver.nama_lengkap}{driver.status ? ` • ${driver.status}` : ''}</option>)}</select></label>
        <label>Lokasi Kerja<input name="lokasi" value={form.lokasi} onChange={change} /></label>
        <label>Unit Kerja<input name="unit_kerja" value={form.unit_kerja} onChange={change} /></label>
        <label>Masa Berlaku Pajak<input type="date" name="masa_berlaku_pajak" value={form.masa_berlaku_pajak || ''} onChange={change} /></label>
        <label>Status Pajak<input name="status_pajak" value={form.status_pajak} onChange={change} /></label>
        <label className="full">Keterangan<textarea name="keterangan" value={form.keterangan} onChange={change} /></label>
        <label className="full">Catatan Hutang<textarea name="catatan_hutang" value={form.catatan_hutang} onChange={change} /></label>
      </div>
      {canPhoto && <section className="mep-photo-section"><div><b>Foto Kendaraan</b><span>Opsional • 4 sisi • maksimal 5 MB per foto</span></div><div className="mep-photo-grid">{PHOTO_SIDES.map(([side, label]) => <label className="mep-photo" key={side}><span>{label}</span>{photoUrls[side] ? <img src={photoUrls[side]} alt={`Foto ${label}`} /> : <div className="mep-photo-empty">Belum ada foto</div>}<input type="file" accept="image/*" onChange={event => choosePhoto(side, event.target.files?.[0])} />{photoFiles[side] && <small>{photoFiles[side].name}</small>}</label>)}</div></section>}
      <div className="mep-form-actions"><button className="mep-secondary" type="button" onClick={resetForm}>Batal</button><button className="mep-primary" type="submit" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</button></div>
    </form></div>}

    {detail && <div className="mep-overlay"><div className="mep-modal small">
      <header><div><span className="eyebrow">DETAIL KENDARAAN</span><h3>{detail.nomor_polisi}</h3></div><button type="button" onClick={() => { setDetail(null); setPhotoUrls({}) }}>×</button></header>
      <div className="mep-detail">
        <div><span>Merk</span><b>{detail.merk || '-'}</b></div><div><span>Type</span><b>{detail.tipe || '-'}</b></div><div><span>Jenis</span><b>{detail.jenis_kendaraan || '-'}</b></div><div><span>Status</span><b>{OWNERSHIP[detail.kepemilikan] || '-'}</b></div><div><span>Pemilik</span><b>{detail.pemilik || '-'}</b></div><div><span>Driver</span><b>{detail.driver?.nama_lengkap || '-'}</b></div><div><span>Unit Kerja</span><b>{detail.unit_kerja || '-'}</b></div><div><span>Lokasi Kerja</span><b>{detail.lokasi || '-'}</b></div><div><span>Masa Berlaku Pajak</span><b>{formatDate(detail.masa_berlaku_pajak)}</b></div><div><span>Status Pajak</span><b>{detail.status_pajak || '-'}</b></div><div className="full"><span>Keterangan</span><b>{detail.keterangan || '-'}</b></div><div className="full"><span>Catatan Hutang</span><b>{detail.catatan_hutang || '-'}</b></div>
      </div>
      <div className="mep-detail-photos">{PHOTO_SIDES.map(([side, label]) => <div key={side}><span>{label}</span>{photoUrls[side] ? <img src={photoUrls[side]} alt={`Foto ${label}`} /> : <div className="mep-photo-empty">Tidak ada foto</div>}</div>)}</div>
    </div></div>}
  </div>
}
