import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import './MasterKendaraanPage.css'

const VEHICLE_EMPTY = {
  kode_kendaraan: '', nomor_polisi: '', merk: '', tipe: '', jenis_kendaraan: '', tahun: '', warna: '', nomor_rangka: '', nomor_mesin: '', masa_berlaku_pajak: '',
  status_pajak: '', unit_kerja: '', catatan_hutang: '',
  kepemilikan: 'ASET_KANTOR', jenis_sewa: '', pemilik: '', driver_id: '', lokasi: '', kilometer_terakhir: '', status: 'ACTIVE', kondisi: '', keterangan: '',
}
const DRIVER_EMPTY = { nama_lengkap: '', nomor_hp: '', nomor_sim: '', masa_berlaku_sim: '', lokasi: '', status: 'AKTIF', keterangan: '' }
const STATUS = { ACTIVE: 'Aktif', SERVICE: 'Service', TIDAK_AKTIF: 'Tidak Aktif' }
const DRIVER_STATUS = { AKTIF: 'Aktif', TIDAK_AKTIF: 'Tidak Aktif' }
const OWNERSHIP = { ASET_KANTOR: 'Aset Kantor', SEWA: 'Sewa' }
const RENTAL = { SEWA_PERORANGAN: 'Sewa Perorangan', SEWA_RENTAL: 'Sewa Rental' }

const moneyOrNumber = (v) => v === '' || v == null ? null : Number(v)
const fmtKm = (v) => v == null || v === '' ? '-' : `${new Intl.NumberFormat('id-ID').format(Number(v))} km`

export default function MasterKendaraanPage({ profile }) {
  const canDelete = profile?.role === 'ADMIN'
  const canDeleteDriver = profile?.role === 'ADMIN'
  const canEditMaster = profile?.role === 'ADMIN' || profile?.role === 'TRANSPORT'
  const [vehicles, setVehicles] = useState([])
  const [drivers, setDrivers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('SEMUA')
  const [ownershipFilter, setOwnershipFilter] = useState('SEMUA')
  const [vehicleModal, setVehicleModal] = useState(false)
  const [driverModal, setDriverModal] = useState(false)
  const [editingVehicle, setEditingVehicle] = useState(null)
  const [editingDriver, setEditingDriver] = useState(null)
  const [vehicleForm, setVehicleForm] = useState(VEHICLE_EMPTY)
  const [driverForm, setDriverForm] = useState(DRIVER_EMPTY)
  const [detail, setDetail] = useState(null)
  const [selectedVehicleIds, setSelectedVehicleIds] = useState([])
  const [selectedDriverIds, setSelectedDriverIds] = useState([])

  const loadData = async () => {
    setLoading(true); setError('')
    const [v, d] = await Promise.all([
      supabase.from('kendaraan').select('id,kode_kendaraan,nomor_polisi,merk,tipe,jenis_kendaraan,tahun,warna,nomor_rangka,nomor_mesin,masa_berlaku_pajak,status_pajak,unit_kerja,catatan_hutang,kepemilikan,jenis_sewa,pemilik,driver_id,lokasi,kilometer_terakhir,status,kondisi,keterangan,created_at,updated_at').order('nomor_polisi'),
      supabase.from('driver').select('id,nama_lengkap,nomor_hp,nomor_sim,masa_berlaku_sim,lokasi,status,keterangan,created_at').order('nama_lengkap'),
    ])
    if (v.error) setError(`Data kendaraan: ${v.error.message}`); else setVehicles(v.data || [])
    if (d.error) setError((x) => x || `Data driver: ${d.error.message}`); else setDrivers(d.data || [])
    setSelectedVehicleIds([]); setSelectedDriverIds([])
    setLoading(false)
  }
  useEffect(() => {
    loadData()
    const handleImported = (event) => { if (['kendaraan', 'service'].includes(event.detail?.context)) loadData() }
    window.addEventListener('transport:data-imported', handleImported)
    return () => window.removeEventListener('transport:data-imported', handleImported)
  }, [])

  const driverMap = useMemo(() => Object.fromEntries(drivers.map((d) => [d.id, d])), [drivers])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return vehicles.filter((v) => {
      const driver = driverMap[v.driver_id]
      const text = [v.kode_kendaraan,v.nomor_polisi,v.merk,v.tipe,v.jenis_kendaraan,v.pemilik,v.lokasi,v.unit_kerja,v.status_pajak,v.kondisi,v.keterangan,v.catatan_hutang,driver?.nama_lengkap].filter(Boolean).join(' ').toLowerCase()
      return (!q || text.includes(q)) && (statusFilter === 'SEMUA' || v.status === statusFilter) && (ownershipFilter === 'SEMUA' || v.kepemilikan === ownershipFilter)
    })
  }, [vehicles, driverMap, query, statusFilter, ownershipFilter])

  const openVehicle = (vehicle = null) => {
    setEditingVehicle(vehicle)
    setVehicleForm(vehicle ? { ...VEHICLE_EMPTY, ...vehicle, driver_id: vehicle.driver_id ?? '' } : { ...VEHICLE_EMPTY })
    setVehicleModal(true); setError(''); setSuccess('')
  }
  const openDriver = (driver = null) => {
    setEditingDriver(driver)
    setDriverForm(driver ? { ...DRIVER_EMPTY, ...driver } : { ...DRIVER_EMPTY })
    setDriverModal(true); setError(''); setSuccess('')
  }
  const changeVehicle = (e) => {
    const { name, value } = e.target
    setVehicleForm((f) => ({ ...f, [name]: value, ...(name === 'kepemilikan' && value === 'ASET_KANTOR' ? { jenis_sewa: '' } : {}) }))
  }

  const saveVehicle = async (e) => {
    e.preventDefault(); setSaving(true); setError(''); setSuccess('')
    if (!canEditMaster) { setError('Anda tidak memiliki akses untuk mengubah master kendaraan.'); setSaving(false); return }
    if (!vehicleForm.kode_kendaraan.trim() || !vehicleForm.nomor_polisi.trim() || !vehicleForm.merk.trim()) { setError('Kode kendaraan, nomor polisi, dan merk wajib diisi.'); setSaving(false); return }
    if (vehicleForm.kepemilikan === 'SEWA' && !vehicleForm.jenis_sewa) { setError('Jenis sewa wajib dipilih untuk kendaraan sewa.'); setSaving(false); return }
    const numericValues = [vehicleForm.tahun, vehicleForm.kilometer_terakhir].filter((v) => v !== '' && v != null)
    if (numericValues.some((v) => !Number.isFinite(Number(v)) || Number(v) < 0)) { setError('Tahun dan KM tidak boleh bernilai negatif atau tidak valid.'); setSaving(false); return }
    const payload = {
      kode_kendaraan: vehicleForm.kode_kendaraan.trim().toUpperCase(), nomor_polisi: vehicleForm.nomor_polisi.trim().toUpperCase(), merk: vehicleForm.merk.trim(),
      tipe: vehicleForm.tipe.trim() || null, jenis_kendaraan: vehicleForm.jenis_kendaraan.trim() || null, tahun: moneyOrNumber(vehicleForm.tahun), warna: vehicleForm.warna.trim() || null,
      nomor_rangka: vehicleForm.nomor_rangka.trim() || null, nomor_mesin: vehicleForm.nomor_mesin.trim() || null, masa_berlaku_pajak: vehicleForm.masa_berlaku_pajak || null, kepemilikan: vehicleForm.kepemilikan,
      jenis_sewa: vehicleForm.kepemilikan === 'SEWA' ? vehicleForm.jenis_sewa : null, pemilik: vehicleForm.pemilik.trim() || null, driver_id: moneyOrNumber(vehicleForm.driver_id),
      lokasi: vehicleForm.lokasi.trim() || null, status_pajak: vehicleForm.status_pajak.trim() || null, unit_kerja: vehicleForm.unit_kerja.trim() || null, catatan_hutang: vehicleForm.catatan_hutang.trim() || null, kilometer_terakhir: moneyOrNumber(vehicleForm.kilometer_terakhir) ?? 0, status: vehicleForm.status,
      kondisi: vehicleForm.kondisi.trim() || null, keterangan: vehicleForm.keterangan.trim() || null,
    }
    const result = editingVehicle ? await supabase.from('kendaraan').update(payload).eq('id', editingVehicle.id) : await supabase.from('kendaraan').insert(payload)
    if (result.error) setError(`Gagal menyimpan kendaraan: ${result.error.message}`)
    else { setSuccess(editingVehicle ? 'Kendaraan diperbarui.' : 'Kendaraan ditambahkan.'); setVehicleModal(false); await loadData() }
    setSaving(false)
  }

  const saveDriver = async (e) => {
    e.preventDefault(); setSaving(true); setError(''); setSuccess('')
    if (!canEditMaster) { setError('Anda tidak memiliki akses untuk mengubah master driver.'); setSaving(false); return }
    if (!driverForm.nama_lengkap.trim()) { setError('Nama driver wajib diisi.'); setSaving(false); return }
    const payload = { nama_lengkap: driverForm.nama_lengkap.trim(), nomor_hp: driverForm.nomor_hp.trim() || null, nomor_sim: driverForm.nomor_sim.trim() || null, masa_berlaku_sim: driverForm.masa_berlaku_sim || null, lokasi: driverForm.lokasi.trim() || null, status: driverForm.status, keterangan: driverForm.keterangan.trim() || null }
    const result = editingDriver ? await supabase.from('driver').update(payload).eq('id', editingDriver.id) : await supabase.from('driver').insert(payload)
    if (result.error) setError(`Gagal menyimpan driver: ${result.error.message}`)
    else { setSuccess(editingDriver ? 'Driver diperbarui.' : 'Driver ditambahkan.'); setDriverModal(false); await loadData() }
    setSaving(false)
  }

  const canDeleteVehicle = async (vehicle) => {
    const checks = await Promise.all([
      supabase.from('permintaan_service').select('id', { count: 'exact', head: true }).eq('kendaraan_id', vehicle.id),
      supabase.from('service').select('id', { count: 'exact', head: true }).eq('kendaraan_id', vehicle.id),
      supabase.from('dokumen_kendaraan').select('id', { count: 'exact', head: true }).eq('kendaraan_id', vehicle.id),
      supabase.from('kontrak_sewa').select('id', { count: 'exact', head: true }).eq('kendaraan_id', vehicle.id),
      supabase.from('perbaikan_sewa').select('id', { count: 'exact', head: true }).eq('kendaraan_id', vehicle.id),
    ])
    if (checks.some(x => x.error)) return { ok: false, reason: 'Pemeriksaan relasi kendaraan gagal. Silakan coba lagi.' }
    if (checks.some(x => Number(x.count || 0) > 0)) return { ok: false, reason: `Kendaraan ${vehicle.nomor_polisi} masih memiliki data operasional terkait. Gunakan status Tidak Aktif.` }
    return { ok: true }
  }

  const deleteVehicle = async (vehicle) => {
    if (!canDelete) { setError('Hanya Administrator yang dapat menghapus kendaraan.'); return false }
    const check = await canDeleteVehicle(vehicle)
    if (!check.ok) { setError(check.reason); return false }
    const { error: e } = await supabase.from('kendaraan').delete().eq('id', vehicle.id)
    if (e) { setError(`Gagal menghapus kendaraan ${vehicle.nomor_polisi}: ${e.message}`); return false }
    return true
  }

  const deleteSelectedVehicles = async () => {
    if (!canDelete || !selectedVehicleIds.length) return
    if (!window.confirm(`Hapus ${selectedVehicleIds.length} kendaraan yang dipilih? Kendaraan yang masih terhubung data tidak akan dihapus.`)) return
    setSaving(true); setError(''); setSuccess('')
    const selected = vehicles.filter(v => selectedVehicleIds.includes(v.id))
    let removed = 0; let blocked = 0
    for (const vehicle of selected) {
      if (await deleteVehicle(vehicle)) removed += 1; else blocked += 1
    }
    setSelectedVehicleIds([])
    await loadData(); setSaving(false)
    if (removed) setSuccess(`${removed} kendaraan berhasil dihapus${blocked ? ` • ${blocked} kendaraan dilewati karena masih terhubung data` : ''}.`)
  }

  const deleteDriver = async (driver) => {
    if (!canDeleteDriver) { setError('Hanya Administrator yang dapat menghapus driver. Nonaktifkan driver bila sudah tidak digunakan.'); return false }
    const used = vehicles.some((v) => v.driver_id === driver.id)
    if (used) { setError('Driver tidak bisa dihapus karena masih dipakai kendaraan. Nonaktifkan saja.'); return false }
    const { error: e } = await supabase.from('driver').delete().eq('id', driver.id)
    if (e) setError(`Gagal menghapus driver: ${e.message}`); else return true
    return false
  }

  const deleteSelectedDrivers = async () => {
    if (!canDeleteDriver || !selectedDriverIds.length) return
    if (!window.confirm(`Hapus ${selectedDriverIds.length} driver yang dipilih? Driver yang masih dipakai kendaraan tidak akan dihapus.`)) return
    setSaving(true); setError(''); setSuccess('')
    let removed = 0; let blocked = 0
    for (const id of selectedDriverIds) {
      const driver = drivers.find(d => d.id === id)
      if (driver && await deleteDriver(driver)) removed += 1; else blocked += 1
    }
    setSelectedDriverIds([])
    await loadData(); setSaving(false)
    if (removed) setSuccess(`${removed} driver berhasil dihapus${blocked ? ` • ${blocked} driver dilewati karena masih digunakan` : ''}.`)
  }

  const toggleSelected = (setter, id) => setter(current => current.includes(id) ? current.filter(x => x !== id) : [...current, id])

  return <div className="master-page">
    <div className="master-head"><div><span className="eyebrow">MASTER DATA</span><h2>Kendaraan & Driver</h2><p>Kelola pusat data armada, kepemilikan, driver/PIC, lokasi, pajak, dan catatan operasional.</p></div><div className="master-actions">{canDeleteDriver && selectedDriverIds.length>0 && <button className="m-btn danger" onClick={deleteSelectedDrivers} disabled={saving}>Hapus {selectedDriverIds.length} Driver</button>}{canDelete && selectedVehicleIds.length>0 && <button className="m-btn danger" onClick={deleteSelectedVehicles} disabled={saving}>Hapus {selectedVehicleIds.length} Kendaraan</button>}{canEditMaster && <button className="m-btn secondary" onClick={() => openDriver()}>+ Driver</button>}{canEditMaster && <button className="m-btn primary" onClick={() => openVehicle()}>+ Kendaraan</button>}</div></div>
    {success && <div className="m-alert success">{success}</div>}{error && !vehicleModal && !driverModal && <div className="m-alert error">{error}</div>}
    <div className="master-stats"><div><span>Total Kendaraan</span><b>{vehicles.length}</b></div><div><span>Aktif</span><b>{vehicles.filter(v=>v.status==='ACTIVE').length}</b></div><div><span>Service</span><b>{vehicles.filter(v=>v.status==='SERVICE').length}</b></div><div><span>Driver Aktif</span><b>{drivers.filter(d=>d.status==='AKTIF').length}</b></div></div>
    <section className="m-card"><div className="m-toolbar"><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Cari plat, kode, merk, driver, lokasi, keterangan..."/><select value={statusFilter} onChange={(e)=>setStatusFilter(e.target.value)}><option value="SEMUA">Semua status</option>{Object.entries(STATUS).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select><select value={ownershipFilter} onChange={(e)=>setOwnershipFilter(e.target.value)}><option value="SEMUA">Semua kepemilikan</option><option value="ASET_KANTOR">Aset kantor</option><option value="SEWA">Sewa</option></select><button className="m-btn secondary" onClick={loadData} disabled={loading}>↻ Refresh</button></div>
      <div className="m-table-wrap">{loading?<div className="m-empty">Memuat data...</div>:filtered.length===0?<div className="m-empty"><b>Belum ada data kendaraan.</b><span>Data kosong adalah kondisi normal sebelum armada dimasukkan.</span></div>:<table className="m-table"><thead><tr><th><input type="checkbox" aria-label="Pilih semua kendaraan" checked={filtered.length>0&&selectedVehicleIds.length===filtered.length} onChange={()=>setSelectedVehicleIds(selectedVehicleIds.length===filtered.length?[]:filtered.map(v=>v.id))}/></th><th>Kendaraan</th><th>Identitas</th><th>Kepemilikan</th><th>Driver / PIC</th><th>KM</th><th>Status</th><th>Catatan & Keterangan</th><th>Aksi</th></tr></thead><tbody>{filtered.map(v=>{const d=driverMap[v.driver_id]; return <tr key={v.id}><td><input type="checkbox" aria-label={`Pilih kendaraan ${v.nomor_polisi}`} checked={selectedVehicleIds.includes(v.id)} onChange={()=>toggleSelected(setSelectedVehicleIds,v.id)}/></td><td><b>{v.nomor_polisi}</b><span>{v.merk} {v.tipe||''}</span><small>{v.kode_kendaraan}</small></td><td><span>{v.jenis_kendaraan||'-'}</span><small>{v.tahun||'-'}{v.warna?` • ${v.warna}`:''}</small></td><td><b>{OWNERSHIP[v.kepemilikan]||v.kepemilikan}</b><small>{v.kepemilikan==='SEWA'?(RENTAL[v.jenis_sewa]||'-'):'Milik perusahaan'}</small></td><td><span>{d?.nama_lengkap||v.pemilik||'-'}</span><small>{v.lokasi||'-'}{v.unit_kerja?` • ${v.unit_kerja}`:''}</small></td><td><b>{fmtKm(v.kilometer_terakhir)}</b></td><td><em className={`m-status ${v.status}`}>{STATUS[v.status]||v.status}</em></td><td><div><b>{v.catatan_hutang||'-'}</b><small>{v.keterangan||'Tidak ada keterangan'}</small></div></td><td className="m-row-actions"><button onClick={()=>setDetail(v)}>Detail</button>{canEditMaster && <button onClick={()=>openVehicle(v)}>Edit</button>}{canDelete && <button onClick={()=>{if(window.confirm(`Hapus kendaraan ${v.nomor_polisi}?`)) deleteVehicle(v).then(ok=>ok&&loadData())}} disabled={saving}>Hapus</button>}</td></tr>})}</tbody></table>}</div>
    </section>
    <section className="m-card"><div className="m-section-head"><div><span className="eyebrow">DRIVER / PIC</span><h3>Daftar Driver</h3></div></div><div className="m-table-wrap"><table className="m-table"><thead><tr><th><input type="checkbox" aria-label="Pilih semua driver" checked={drivers.length>0&&selectedDriverIds.length===drivers.length} onChange={()=>setSelectedDriverIds(selectedDriverIds.length===drivers.length?[]:drivers.map(d=>d.id))}/></th><th>Nama</th><th>Kontak</th><th>SIM</th><th>Lokasi</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{drivers.length===0?<tr><td colSpan="7"><div className="m-empty">Belum ada driver.</div></td></tr>:drivers.map(d=><tr key={d.id}><td><input type="checkbox" aria-label={`Pilih driver ${d.nama_lengkap}`} checked={selectedDriverIds.includes(d.id)} onChange={()=>toggleSelected(setSelectedDriverIds,d.id)}/></td><td><b>{d.nama_lengkap}</b><small>{d.keterangan||'-'}</small></td><td>{d.nomor_hp||'-'}</td><td><span>{d.nomor_sim||'-'}</span><small>Berlaku {d.masa_berlaku_sim||'-'}</small></td><td>{d.lokasi||'-'}</td><td><em className={`m-status ${d.status}`}>{DRIVER_STATUS[d.status]||d.status}</em></td><td className="m-row-actions">{canEditMaster && <button onClick={()=>openDriver(d)}>Edit</button>}{canDeleteDriver && <button onClick={()=>{if(window.confirm(`Hapus driver ${d.nama_lengkap}?`)) deleteDriver(d).then(ok=>ok&&loadData())}} disabled={saving}>Hapus</button>}</td></tr>)}</tbody></table></div></section>

    {vehicleModal&&<div className="m-overlay"><section className="m-modal"><div className="m-modal-head"><div><span className="eyebrow">KENDARAAN</span><h3>{editingVehicle?'Edit Kendaraan':'Tambah Kendaraan'}</h3></div><button onClick={()=>setVehicleModal(false)}>×</button></div>{error&&<div className="m-alert error">{error}</div>}<form onSubmit={saveVehicle}><div className="m-form-grid">{[['kode_kendaraan','Kode Kendaraan'],['nomor_polisi','Nomor Polisi'],['merk','Merk'],['tipe','Tipe'],['jenis_kendaraan','Jenis Kendaraan'],['tahun','Tahun'],['warna','Warna'],['nomor_rangka','Nomor Rangka'],['nomor_mesin','Nomor Mesin'],['masa_berlaku_pajak','Masa Berlaku Pajak'],['status_pajak','Status Pajak'],['unit_kerja','Unit Kerja'],['pemilik','Pemilik / PIC'],['lokasi','Lokasi'],['kilometer_terakhir','KM Terakhir']].map(([name,label])=><label key={name}>{label}<input name={name} min={name==='tahun'||name==='kilometer_terakhir'?'0':undefined} type={name==='tahun'||name==='kilometer_terakhir'?'number':name==='masa_berlaku_pajak'?'date':'text'} value={vehicleForm[name]??''} onChange={changeVehicle}/></label>)}<label>Kepemilikan<select name="kepemilikan" value={vehicleForm.kepemilikan} onChange={changeVehicle}><option value="ASET_KANTOR">Aset Kantor</option><option value="SEWA">Sewa</option></select></label>{vehicleForm.kepemilikan==='SEWA'&&<label>Jenis Sewa<select name="jenis_sewa" value={vehicleForm.jenis_sewa} onChange={changeVehicle}><option value="">Pilih</option><option value="SEWA_PERORANGAN">Sewa Perorangan</option><option value="SEWA_RENTAL">Sewa Rental</option></select></label>}<label>Driver / PIC<select name="driver_id" value={vehicleForm.driver_id??''} onChange={changeVehicle}><option value="">Belum ditentukan</option>{drivers.filter(d=>d.status==='AKTIF' || d.id === vehicleForm.driver_id).map(d=><option key={d.id} value={d.id}>{d.nama_lengkap}{d.status==='TIDAK_AKTIF'?' (Tidak Aktif)':''}</option>)}</select></label><label>Status<select name="status" value={vehicleForm.status} onChange={changeVehicle}>{Object.entries(STATUS).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label className="m-full"><span>Keterangan Operasional</span><textarea name="keterangan" value={vehicleForm.keterangan??''} onChange={changeVehicle} placeholder="Catatan umum kendaraan, kebutuhan operasional, atau informasi penting..."/></label><label className="m-full"><span>Catatan Hutang</span><textarea name="catatan_hutang" value={vehicleForm.catatan_hutang??''} onChange={changeVehicle} placeholder="Contoh: Hutang 2 ban luar / rusak dari tgl 11 Juni 2026..."/></label><label className="m-full"><span>Kondisi</span><textarea name="kondisi" value={vehicleForm.kondisi??''} onChange={changeVehicle}/></label></div><div className="m-form-actions"><button type="button" className="m-btn secondary" onClick={()=>setVehicleModal(false)}>Batal</button><button type="submit" className="m-btn primary" disabled={saving}>{saving?'Menyimpan...':'Simpan Kendaraan'}</button></div></form></section></div>}
    {driverModal&&<div className="m-overlay"><section className="m-modal small"><div className="m-modal-head"><div><span className="eyebrow">DRIVER / PIC</span><h3>{editingDriver?'Edit Driver':'Tambah Driver'}</h3></div><button onClick={()=>setDriverModal(false)}>×</button></div>{error&&<div className="m-alert error">{error}</div>}<form onSubmit={saveDriver}><div className="m-form-grid">{[['nama_lengkap','Nama Lengkap'],['nomor_hp','Nomor HP'],['nomor_sim','Nomor SIM'],['masa_berlaku_sim','Masa Berlaku SIM'],['lokasi','Lokasi']].map(([name,label])=><label key={name}>{label}<input name={name} type={name==='masa_berlaku_sim'?'date':'text'} value={driverForm[name]??''} onChange={e=>setDriverForm(f=>({...f,[name]:e.target.value}))}/></label>)}<label>Status<select name="status" value={driverForm.status} onChange={e=>setDriverForm(f=>({...f,status:e.target.value}))}><option value="AKTIF">Aktif</option><option value="TIDAK_AKTIF">Tidak Aktif</option></select></label><label className="m-full">Keterangan<textarea name="keterangan" value={driverForm.keterangan??''} onChange={e=>setDriverForm(f=>({...f,keterangan:e.target.value}))}/></label></div><div className="m-form-actions"><button type="button" className="m-btn secondary" onClick={()=>setDriverModal(false)}>Batal</button><button type="submit" className="m-btn primary" disabled={saving}>{saving?'Menyimpan...':'Simpan Driver'}</button></div></form></section></div>}
    {detail&&<div className="m-overlay"><section className="m-modal small"><div className="m-modal-head"><div><span className="eyebrow">DETAIL KENDARAAN</span><h3>{detail.nomor_polisi}</h3></div><button onClick={()=>setDetail(null)}>×</button></div><div className="m-detail-grid">{[['Kode',detail.kode_kendaraan],['Merk / Tipe',[detail.merk,detail.tipe].filter(Boolean).join(' ')],['Jenis',detail.jenis_kendaraan],['Tahun / Warna',[detail.tahun,detail.warna].filter(Boolean).join(' • ')],['Rangka',detail.nomor_rangka],['Mesin',detail.nomor_mesin],['Kepemilikan',OWNERSHIP[detail.kepemilikan]||detail.kepemilikan],['Jenis Sewa',RENTAL[detail.jenis_sewa]||'-'],['Pemilik',detail.pemilik],['Driver',driverMap[detail.driver_id]?.nama_lengkap||'-'],['Lokasi',detail.lokasi],['Unit Kerja',detail.unit_kerja],['Masa Berlaku Pajak',detail.masa_berlaku_pajak],['Status Pajak',detail.status_pajak],['Catatan Hutang',detail.catatan_hutang],['Keterangan',detail.keterangan],['KM Terakhir',fmtKm(detail.kilometer_terakhir)],['Status',STATUS[detail.status]||detail.status],['Kondisi',detail.kondisi]].map(([l,v])=><div key={l}><span>{l}</span><b>{v||'-'}</b></div>)}</div><div className="m-form-actions"><button type="button" className="m-btn secondary" onClick={()=>setDetail(null)}>Tutup</button>{canEditMaster && <button type="button" className="m-btn primary" onClick={()=>{ setDetail(null); openVehicle(detail) }}>Edit Kendaraan</button>}</div></section></div>}
  </div>
}
