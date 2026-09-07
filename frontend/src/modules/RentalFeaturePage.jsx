import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import './TransportOperationsFixed.css'

const money = (v) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(v || 0))
const dateText = (v) => v ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(new Date(v)) : '-'
const EMPTY_OWNER = { jenis_pemilik: 'SEWA_PERORANGAN', nama_pemilik: '', nomor_hp: '', email: '', alamat: '', nomor_identitas: '', nama_perusahaan: '', nomor_rekening: '', nama_bank: '', keterangan: '', aktif: true }
const EMPTY_CONTRACT = { nomor_kontrak: '', kendaraan_id: '', pemilik_sewa_id: '', tanggal_mulai: '', tanggal_selesai: '', waktu_mulai: '', waktu_selesai: '', periode_bulan: 6, nilai_sewa_bulanan: '', tanggal_jatuh_tempo_bulanan: '', status: 'AKTIF', catatan: '' }
const EMPTY_PAYMENT = { kontrak_sewa_id: '', periode_ke: '', bulan_pembayaran: '', tanggal_jatuh_tempo: '', tanggal_pembayaran: '', jumlah_tagihan: '', jumlah_dibayar: '', metode_pembayaran: '', nomor_referensi: '', catatan: '', perbaikan_sewa_id: '', jumlah_potongan: '' }
const EMPTY_REPAIR = { kontrak_sewa_id: '', kendaraan_id: '', tanggal_kejadian: new Date().toISOString().slice(0, 10), kilometer: '', jenis_kerusakan: '', deskripsi_kerusakan: '', penyebab: '', estimasi_biaya: '', biaya_aktual: '', metode_penanganan: '', dibayar_kantor: false, tanggal_dibayar: '', pemilik_diberitahu: false, status: 'DIPROSES', dapat_dipotong: false, jumlah_dipotong: '', catatan: '' }

function Alert({ type = 'success', children }) { return <div className={`x-alert ${type}`}>{children}</div> }
function Header({ title, text, action }) { return <div className="x-head"><div><span className="eyebrow">KENDARAAN SEWA</span><h2>{title}</h2><p>{text}</p></div>{action}</div> }
function Empty() { return <div className="x-empty">Belum ada data.</div> }

async function uploadRentalFile(file, prefix) {
  if (!file) return null
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${prefix}/${Date.now()}-${crypto.randomUUID()}-${safe}`
  const { error } = await supabase.storage.from('dokumen-sewa').upload(path, file, { upsert: false, contentType: file.type || undefined })
  if (error) throw error
  return path
}

async function signedRentalFile(path) {
  if (!path) return null
  const { data, error } = await supabase.storage.from('dokumen-sewa').createSignedUrl(path, 3600)
  if (error) throw error
  return data?.signedUrl || null
}

export default function RentalFeaturePage({ profile }) {
  const [tab, setTab] = useState('kontrak')
  const [owners, setOwners] = useState([])
  const [contracts, setContracts] = useState([])
  const [payments, setPayments] = useState([])
  const [repairs, setRepairs] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [owner, setOwner] = useState(EMPTY_OWNER)
  const [contract, setContract] = useState(EMPTY_CONTRACT)
  const [payment, setPayment] = useState(EMPTY_PAYMENT)
  const [repair, setRepair] = useState(EMPTY_REPAIR)
  const [contractFile, setContractFile] = useState(null)
  const [paymentFile, setPaymentFile] = useState(null)
  const [repairPhoto, setRepairPhoto] = useState(null)
  const [repairProof, setRepairProof] = useState(null)
  const [openedFiles, setOpenedFiles] = useState({})

  const editable = ['ADMIN', 'TRANSPORT', 'AKUNTANSI'].includes(profile?.role)
  const vehicleMap = useMemo(() => Object.fromEntries(vehicles.map(v => [v.id, v])), [vehicles])
  const repairMap = useMemo(() => Object.fromEntries(repairs.map(r => [r.id, r])), [repairs])

  const load = async () => {
    setLoading(true)
    setError('')
    const rs = await Promise.all([
      supabase.from('pemilik_sewa').select('*').order('nama_pemilik'),
      supabase.from('kontrak_sewa').select('*').order('created_at', { ascending: false }),
      supabase.from('pembayaran_sewa').select('*').order('bulan_pembayaran', { ascending: false }),
      supabase.from('perbaikan_sewa').select('*').order('tanggal_kejadian', { ascending: false }),
      supabase.from('kendaraan').select('id,nomor_polisi,merk,tipe,kepemilikan,jenis_sewa').eq('kepemilikan', 'SEWA').order('nomor_polisi'),
    ])
    const names = ['Pemilik', 'Kontrak', 'Pembayaran', 'Perbaikan', 'Kendaraan']
    rs.forEach((r, i) => { if (r.error) setError(e => e || `${names[i]}: ${r.error.message}`) })
    setOwners(rs[0].data || [])
    setContracts(rs[1].data || [])
    setPayments(rs[2].data || [])
    setRepairs(rs[3].data || [])
    setVehicles(rs[4].data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const clearMessages = () => { setError(''); setSuccess('') }

  const saveOwner = async e => {
    e.preventDefault(); clearMessages()
    if (!owner.nama_pemilik.trim()) return setError('Nama pemilik wajib diisi.')
    if (owner.jenis_pemilik === 'SEWA_RENTAL' && !owner.nama_perusahaan.trim()) return setError('Nama perusahaan/rental wajib diisi untuk pemilik rental.')
    if (owner.jenis_pemilik === 'SEWA_PERORANGAN' && !owner.nomor_identitas.trim()) return setError('Nomor identitas pemilik wajib diisi untuk pemilik perorangan.')
    setSaving(true)
    const { error: e1 } = await supabase.from('pemilik_sewa').insert({ ...owner, nama_pemilik: owner.nama_pemilik.trim(), nama_perusahaan: owner.nama_perusahaan.trim() || null, nomor_identitas: owner.nomor_identitas.trim() || null })
    if (e1) setError(e1.message)
    else { setOwner(EMPTY_OWNER); setSuccess('Pemilik sewa tersimpan.'); await load() }
    setSaving(false)
  }

  const saveContract = async e => {
    e.preventDefault(); clearMessages()
    if (!contract.kendaraan_id || !contract.pemilik_sewa_id || !contract.tanggal_mulai || !contract.tanggal_selesai) return setError('Kendaraan, pemilik, tanggal mulai dan selesai wajib diisi.')
    if (!contract.nilai_sewa_bulanan || Number(contract.nilai_sewa_bulanan) <= 0) return setError('Nilai sewa bulanan wajib lebih dari 0.')
    const start = new Date(`${contract.tanggal_mulai}T00:00:00`)
    const expectedEnd = new Date(start)
    expectedEnd.setMonth(expectedEnd.getMonth() + 6)
    expectedEnd.setDate(expectedEnd.getDate() - 1)
    const actualEnd = new Date(`${contract.tanggal_selesai}T00:00:00`)
    if (actualEnd.getTime() !== expectedEnd.getTime()) return setError('Kontrak sewa harus tepat 6 bulan. Tanggal selesai otomatis harus 1 hari sebelum tanggal yang sama pada bulan ke-6.')
    setSaving(true)
    try {
      const contractPath = await uploadRentalFile(contractFile, `kontrak/${contract.kendaraan_id}`)
      const payload = { ...contract, kendaraan_id: Number(contract.kendaraan_id), pemilik_sewa_id: Number(contract.pemilik_sewa_id), periode_bulan: 6, nilai_sewa_bulanan: Number(contract.nilai_sewa_bulanan), tanggal_jatuh_tempo_bulanan: Number(contract.tanggal_jatuh_tempo_bulanan || 0) || null, dokumen_kontrak_path: contractPath }
      const { error: e1 } = await supabase.from('kontrak_sewa').insert(payload)
      if (e1) throw e1
      setContract(EMPTY_CONTRACT); setContractFile(null); setSuccess('Kontrak 6 bulan dan dokumen kontrak tersimpan.'); await load()
    } catch (e2) { setError(e2.message) }
    setSaving(false)
  }

  const savePayment = async e => {
    e.preventDefault(); clearMessages()
    if (!payment.kontrak_sewa_id || !payment.periode_ke || !payment.bulan_pembayaran || !payment.jumlah_tagihan) return setError('Kontrak, periode, bulan dan tagihan wajib diisi.')
    if (Number(payment.periode_ke) < 1 || Number(payment.periode_ke) > 6) return setError('Periode pembayaran hanya 1 sampai 6.')
    const gross = Number(payment.jumlah_tagihan || 0)
    const requestedDeduction = Number(payment.jumlah_potongan || 0)
    const selectedRepair = payment.perbaikan_sewa_id ? repairMap[payment.perbaikan_sewa_id] : null
    if (requestedDeduction > 0) {
      if (!selectedRepair) return setError('Pilih perbaikan yang menjadi dasar potongan.')
      if (!selectedRepair.dapat_dipotong || !selectedRepair.dibayar_kantor) return setError('Hanya perbaikan yang dibayar kantor dan ditandai dapat dipotong yang boleh dipotong dari rental.')
      if (Number(selectedRepair.jumlah_dipotong || 0) < requestedDeduction) return setError(`Potongan melebihi nilai potongan yang dicatat untuk perbaikan. Maksimal ${money(selectedRepair.jumlah_dipotong)}.`)
      if (Number(selectedRepair.biaya_aktual || selectedRepair.estimasi_biaya || 0) < requestedDeduction) return setError('Potongan tidak boleh melebihi biaya perbaikan.')
      if (selectedRepair.kontrak_sewa_id && Number(selectedRepair.kontrak_sewa_id) !== Number(payment.kontrak_sewa_id)) return setError('Perbaikan dan kontrak rental harus berasal dari kontrak yang sama.')
    }
    const netBill = Math.max(0, gross - requestedDeduction)
    const paid = Number(payment.jumlah_dibayar || 0)
    const status = payment.tanggal_pembayaran && paid >= netBill ? 'LUNAS' : (payment.tanggal_jatuh_tempo && new Date(payment.tanggal_jatuh_tempo) < new Date() && paid < netBill ? 'TERLAMBAT' : 'BELUM_LUNAS')
    if (paid > netBill) return setError('Jumlah dibayar tidak boleh melebihi tagihan bersih setelah potongan.')
    setSaving(true)
    try {
      const proofPath = await uploadRentalFile(paymentFile, `pembayaran/${payment.kontrak_sewa_id}`)
      const notePrefix = requestedDeduction > 0 ? `Tagihan bruto ${gross}; potongan repair ${requestedDeduction}; tagihan bersih ${netBill}.` : `Tagihan rental ${gross}.`
      const { data: savedPayment, error: e1 } = await supabase.from('pembayaran_sewa').insert({ kontrak_sewa_id: Number(payment.kontrak_sewa_id), periode_ke: Number(payment.periode_ke), bulan_pembayaran: payment.bulan_pembayaran, tanggal_jatuh_tempo: payment.tanggal_jatuh_tempo || null, tanggal_pembayaran: payment.tanggal_pembayaran || null, jumlah_tagihan: netBill, jumlah_dibayar: paid, status, metode_pembayaran: payment.metode_pembayaran.trim() || null, nomor_referensi: payment.nomor_referensi.trim() || null, bukti_pembayaran_path: proofPath, catatan: [notePrefix, payment.catatan.trim()].filter(Boolean).join(' ') || null, diproses_oleh: profile?.id || null }).select('*').single()
      if (e1) throw e1
      if (requestedDeduction > 0 && savedPayment?.id) {
        const { error: e2 } = await supabase.from('potongan_pembayaran_sewa').insert({ pembayaran_sewa_id: savedPayment.id, perbaikan_sewa_id: Number(payment.perbaikan_sewa_id), jumlah_potongan: requestedDeduction, catatan: `Potongan biaya perbaikan dari pembayaran periode ${payment.periode_ke}.` })
        if (e2) throw e2
      }
      setPayment(EMPTY_PAYMENT); setPaymentFile(null); setSuccess(requestedDeduction > 0 ? `Pembayaran tersimpan dengan potongan ${money(requestedDeduction)}. Tagihan bersih ${money(netBill)}.` : 'Pembayaran sewa tersimpan.'); await load()
    } catch (e3) { setError(e3.message) }
    setSaving(false)
  }

  const saveRepair = async e => {
    e.preventDefault(); clearMessages()
    if (!repair.kendaraan_id || !repair.jenis_kerusakan.trim()) return setError('Kendaraan dan jenis kerusakan wajib diisi.')
    if (repair.dibayar_kantor && !repair.tanggal_dibayar) return setError('Tanggal pembayaran perbaikan wajib diisi jika dibayar kantor.')
    if (repair.dapat_dipotong && !repair.dibayar_kantor) return setError('Perbaikan baru boleh ditandai dapat dipotong setelah dibayar kantor.')
    if (repair.dapat_dipotong && Number(repair.jumlah_dipotong || 0) <= 0) return setError('Jumlah potongan wajib diisi jika perbaikan dapat dipotong.')
    setSaving(true)
    try {
      const fotoPath = await uploadRentalFile(repairPhoto, `perbaikan/${repair.kendaraan_id}`)
      const proofPath = await uploadRentalFile(repairProof, `perbaikan/${repair.kendaraan_id}/bukti`)
      const payload = { ...repair, kontrak_sewa_id: repair.kontrak_sewa_id ? Number(repair.kontrak_sewa_id) : null, kendaraan_id: Number(repair.kendaraan_id), kilometer: repair.kilometer === '' ? null : Number(repair.kilometer), estimasi_biaya: Number(repair.estimasi_biaya || 0), biaya_aktual: repair.biaya_aktual === '' ? null : Number(repair.biaya_aktual), jumlah_dipotong: repair.dapat_dipotong ? Number(repair.jumlah_dipotong || 0) : 0, foto_kerusakan_path: fotoPath, bukti_perbaikan_path: proofPath, dicatat_oleh: profile?.id || null }
      const { error: e1 } = await supabase.from('perbaikan_sewa').insert(payload)
      if (e1) throw e1
      setRepair(EMPTY_REPAIR); setRepairPhoto(null); setRepairProof(null); setSuccess('Perbaikan kendaraan sewa, dokumentasi dan status potongannya tersimpan.'); await load()
    } catch (e2) { setError(e2.message) }
    setSaving(false)
  }

  const openFile = async (key, bucket, path) => {
    if (!path) return
    try {
      setOpenedFiles(v => ({ ...v, [key]: 'loading' }))
      const url = await signedRentalFile(path)
      setOpenedFiles(v => ({ ...v, [key]: url }))
    } catch (e) { setError(e.message); setOpenedFiles(v => ({ ...v, [key]: null })) }
  }

  const getRepairAvailableAmount = r => r.dapat_dipotong && r.dibayar_kantor ? Number(r.jumlah_dipotong || 0) : 0

  return <div className="x-page">
    <Header title="Kendaraan Sewa" text="Kelola pemilik, kontrak 6 bulan, pembayaran bulanan, bukti, perbaikan, dan potongan." action={<button className="x-btn secondary" onClick={load}>↻ Refresh</button>} />
    {error && <Alert type="error">{error}</Alert>}
    {success && <Alert>{success}</Alert>}
    <div className="x-tabs">{[['kontrak', 'Kontrak'], ['pemilik', 'Pemilik'], ['pembayaran', 'Pembayaran'], ['repair', 'Perbaikan']].map(([v, l]) => <button key={v} className={tab === v ? 'active' : ''} onClick={() => { clearMessages(); setTab(v) }}>{l}</button>)}</div>

    {tab === 'pemilik' && <section className="x-card">
      <div className="x-card-title"><h3>Data Pemilik Sewa</h3></div>
      {editable && <form className="x-grid" onSubmit={saveOwner}>
        <label>Jenis Pemilik<select value={owner.jenis_pemilik} onChange={e => setOwner({ ...owner, jenis_pemilik: e.target.value })}><option value="SEWA_PERORANGAN">Perorangan</option><option value="SEWA_RENTAL">Perusahaan / Rental</option></select></label>
        <label>Nama Pemilik / Kontak Utama<input value={owner.nama_pemilik} onChange={e => setOwner({ ...owner, nama_pemilik: e.target.value })} /></label>
        <label>No HP<input value={owner.nomor_hp} onChange={e => setOwner({ ...owner, nomor_hp: e.target.value })} /></label>
        <label>Email<input type="email" value={owner.email} onChange={e => setOwner({ ...owner, email: e.target.value })} /></label>
        <label>No Identitas<input value={owner.nomor_identitas} onChange={e => setOwner({ ...owner, nomor_identitas: e.target.value })} /></label>
        <label>Nama Perusahaan<input value={owner.nama_perusahaan} onChange={e => setOwner({ ...owner, nama_perusahaan: e.target.value })} /></label>
        <label>Bank<input value={owner.nama_bank} onChange={e => setOwner({ ...owner, nama_bank: e.target.value })} /></label>
        <label>No Rekening<input value={owner.nomor_rekening} onChange={e => setOwner({ ...owner, nomor_rekening: e.target.value })} /></label>
        <label className="full">Alamat<textarea value={owner.alamat} onChange={e => setOwner({ ...owner, alamat: e.target.value })} /></label>
        <label className="full">Keterangan<textarea value={owner.keterangan} onChange={e => setOwner({ ...owner, keterangan: e.target.value })} /></label>
        <div className="full x-actions"><button className="x-btn primary" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan Pemilik'}</button></div>
      </form>}
      <div className="x-table-wrap"><table className="x-table"><thead><tr><th>Nama</th><th>Jenis</th><th>Kontak</th><th>Bank</th><th>Status</th></tr></thead><tbody>{owners.length ? owners.map(o => <tr key={o.id}><td><b>{o.nama_pemilik}</b><small>{o.nama_perusahaan || o.nomor_identitas || '-'}</small></td><td>{o.jenis_pemilik}</td><td>{o.nomor_hp || o.email || '-'}</td><td>{o.nama_bank || '-'}<small>{o.nomor_rekening || '-'}</small></td><td>{o.aktif ? 'Aktif' : 'Nonaktif'}</td></tr>) : <tr><td colSpan="5"><Empty /></td></tr>}</tbody></table></div>
    </section>}

    {tab === 'kontrak' && <section className="x-card">
      <div className="x-card-title"><h3>Kontrak Sewa Baru — 6 Bulan</h3></div>
      {editable && <form className="x-grid" onSubmit={saveContract}>
        <label>No Kontrak<input value={contract.nomor_kontrak} onChange={e => setContract({ ...contract, nomor_kontrak: e.target.value })} /></label>
        <label>Kendaraan<select value={contract.kendaraan_id} onChange={e => setContract({ ...contract, kendaraan_id: e.target.value })}><option value="">Pilih</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.nomor_polisi} — {v.merk} {v.tipe || ''}</option>)}</select></label>
        <label>Pemilik<select value={contract.pemilik_sewa_id} onChange={e => setContract({ ...contract, pemilik_sewa_id: e.target.value })}><option value="">Pilih</option>{owners.filter(o => o.aktif).map(o => <option key={o.id} value={o.id}>{o.nama_pemilik}{o.nama_perusahaan ? ` — ${o.nama_perusahaan}` : ''}</option>)}</select></label>
        <label>Tanggal Mulai<input type="date" value={contract.tanggal_mulai} onChange={e => { const start = e.target.value; const next = new Date(`${start}T00:00:00`); if (start) { next.setMonth(next.getMonth() + 6); next.setDate(next.getDate() - 1) }; setContract({ ...contract, tanggal_mulai: start, tanggal_selesai: start ? next.toISOString().slice(0, 10) : '' }) }} /></label>
        <label>Tanggal Selesai<input type="date" value={contract.tanggal_selesai} onChange={e => setContract({ ...contract, tanggal_selesai: e.target.value })} /></label>
        <label>Periode Bulan<input type="number" value="6" readOnly /></label>
        <label>Nilai Sewa Bulanan<input type="number" min="0" value={contract.nilai_sewa_bulanan} onChange={e => setContract({ ...contract, nilai_sewa_bulanan: e.target.value })} /></label>
        <label>Jatuh Tempo Bulanan (tanggal)<input type="number" min="1" max="31" value={contract.tanggal_jatuh_tempo_bulanan} onChange={e => setContract({ ...contract, tanggal_jatuh_tempo_bulanan: e.target.value })} /></label>
        <label>Waktu Mulai<input type="time" value={contract.waktu_mulai} onChange={e => setContract({ ...contract, waktu_mulai: e.target.value })} /></label>
        <label>Waktu Selesai<input type="time" value={contract.waktu_selesai} onChange={e => setContract({ ...contract, waktu_selesai: e.target.value })} /></label>
        <label>Status<select value={contract.status} onChange={e => setContract({ ...contract, status: e.target.value })}><option>AKTIF</option><option>SELESAI</option><option>DIBATALKAN</option></select></label>
        <label className="full">Dokumen Kontrak<input type="file" accept=".pdf,image/*" onChange={e => setContractFile(e.target.files?.[0] || null)} /><small>{contractFile ? contractFile.name : 'Wajib untuk arsip kontrak.'}</small></label>
        <label className="full">Catatan<textarea value={contract.catatan} onChange={e => setContract({ ...contract, catatan: e.target.value })} /></label>
        <div className="full x-actions"><button className="x-btn primary" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan Kontrak'}</button></div>
      </form>}
      <div className="x-table-wrap"><table className="x-table"><thead><tr><th>Kontrak</th><th>Kendaraan</th><th>Pemilik</th><th>Periode</th><th>Nilai</th><th>Dokumen</th><th>Status</th></tr></thead><tbody>{contracts.length ? contracts.map(c => { const o = owners.find(x => x.id === c.pemilik_sewa_id); const key = `contract-${c.id}`; return <tr key={c.id}><td>{c.nomor_kontrak || `#${c.id}`}</td><td>{vehicleMap[c.kendaraan_id]?.nomor_polisi || '-'}</td><td>{o?.nama_pemilik || '-'}<small>{o?.nama_perusahaan || ''}</small></td><td>{dateText(c.tanggal_mulai)} s/d {dateText(c.tanggal_selesai)}<small>{c.periode_bulan} bulan</small></td><td>{money(c.nilai_sewa_bulanan)}</td><td>{c.dokumen_kontrak_path ? <button className="x-btn secondary" onClick={() => openFile(key, 'dokumen-sewa', c.dokumen_kontrak_path)}>{openedFiles[key] === 'loading' ? '…' : 'Lihat'}</button> : '-'}</td><td>{c.status}</td></tr> }) : <tr><td colSpan="7"><Empty /></td></tr>}</tbody></table></div>
      {Object.entries(openedFiles).filter(([k, v]) => k.startsWith('contract-') && v && v !== 'loading').map(([k, v]) => <div key={k} className="x-alert"><a href={v} target="_blank" rel="noreferrer">Buka dokumen kontrak</a></div>)}
    </section>}

    {tab === 'pembayaran' && <section className="x-card">
      <div className="x-card-title"><h3>Pembayaran Sewa Bulanan</h3><p>Potongan perbaikan hanya dapat digunakan setelah perbaikan dibayar kantor dan ditandai dapat dipotong.</p></div>
      {editable && <form className="x-grid" onSubmit={savePayment}>
        <label>Kontrak<select value={payment.kontrak_sewa_id} onChange={e => setPayment({ ...payment, kontrak_sewa_id: e.target.value })}><option value="">Pilih</option>{contracts.filter(c => c.status === 'AKTIF').map(c => <option key={c.id} value={c.id}>{c.nomor_kontrak || `#${c.id}`} — {vehicleMap[c.kendaraan_id]?.nomor_polisi || '-'}</option>)}</select></label>
        <label>Periode Ke<input type="number" min="1" max="6" value={payment.periode_ke} onChange={e => setPayment({ ...payment, periode_ke: e.target.value })} /></label>
        <label>Bulan Pembayaran<input type="date" value={payment.bulan_pembayaran} onChange={e => setPayment({ ...payment, bulan_pembayaran: e.target.value })} /></label>
        <label>Jatuh Tempo<input type="date" value={payment.tanggal_jatuh_tempo} onChange={e => setPayment({ ...payment, tanggal_jatuh_tempo: e.target.value })} /></label>
        <label>Tagihan Sewa (sebelum potongan)<input type="number" min="0" value={payment.jumlah_tagihan} onChange={e => setPayment({ ...payment, jumlah_tagihan: e.target.value })} /></label>
        <label>Perbaikan untuk Potongan<select value={payment.perbaikan_sewa_id} onChange={e => { const r = repairMap[e.target.value]; setPayment({ ...payment, perbaikan_sewa_id: e.target.value, jumlah_potongan: r ? String(getRepairAvailableAmount(r)) : '' }) }}><option value="">Tidak ada potongan</option>{repairs.filter(r => r.dapat_dipotong && r.dibayar_kantor && getRepairAvailableAmount(r) > 0).map(r => <option key={r.id} value={r.id}>{vehicleMap[r.kendaraan_id]?.nomor_polisi || '-'} — {r.jenis_kerusakan} — {money(r.jumlah_dipotong)}</option>)}</select></label>
        <label>Jumlah Potongan<input type="number" min="0" value={payment.jumlah_potongan} onChange={e => setPayment({ ...payment, jumlah_potongan: e.target.value })} /></label>
        <label>Tagihan Bersih<input type="number" value={Math.max(0, Number(payment.jumlah_tagihan || 0) - Number(payment.jumlah_potongan || 0))} readOnly /></label>
        <label>Jumlah Dibayar<input type="number" min="0" value={payment.jumlah_dibayar} onChange={e => setPayment({ ...payment, jumlah_dibayar: e.target.value })} /></label>
        <label>Tanggal Pembayaran<input type="date" value={payment.tanggal_pembayaran} onChange={e => setPayment({ ...payment, tanggal_pembayaran: e.target.value })} /></label>
        <label>Metode Pembayaran<input value={payment.metode_pembayaran} onChange={e => setPayment({ ...payment, metode_pembayaran: e.target.value })} /></label>
        <label>No Referensi<input value={payment.nomor_referensi} onChange={e => setPayment({ ...payment, nomor_referensi: e.target.value })} /></label>
        <label className="full">Bukti Pembayaran<input type="file" accept=".pdf,image/*" onChange={e => setPaymentFile(e.target.files?.[0] || null)} /><small>{paymentFile ? paymentFile.name : 'Simpan bukti transfer/kwitansi ke arsip rental.'}</small></label>
        <label className="full">Catatan<textarea value={payment.catatan} onChange={e => setPayment({ ...payment, catatan: e.target.value })} /></label>
        <div className="full x-actions"><button className="x-btn primary" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan Pembayaran'}</button></div>
      </form>}
      <div className="x-table-wrap"><table className="x-table"><thead><tr><th>Kontrak</th><th>Periode</th><th>Jatuh Tempo</th><th>Tagihan</th><th>Dibayar</th><th>Status</th><th>Bukti</th></tr></thead><tbody>{payments.length ? payments.map(p => { const key = `payment-${p.id}`; return <tr key={p.id}><td>#{p.kontrak_sewa_id}</td><td>{p.periode_ke} — {dateText(p.bulan_pembayaran)}</td><td>{dateText(p.tanggal_jatuh_tempo)}</td><td>{money(p.jumlah_tagihan)}<small>{(p.catatan || '').startsWith('Tagihan bruto') ? p.catatan.split('. ')[0] : ''}</small></td><td>{dateText(p.tanggal_pembayaran)}<small>{money(p.jumlah_dibayar)}</small></td><td>{p.status}</td><td>{p.bukti_pembayaran_path ? <button className="x-btn secondary" onClick={() => openFile(key, 'dokumen-sewa', p.bukti_pembayaran_path)}>{openedFiles[key] === 'loading' ? '…' : 'Lihat'}</button> : '-'}</td></tr> }) : <tr><td colSpan="7"><Empty /></td></tr>}</tbody></table></div>
      {Object.entries(openedFiles).filter(([k, v]) => k.startsWith('payment-') && v && v !== 'loading').map(([k, v]) => <div key={k} className="x-alert"><a href={v} target="_blank" rel="noreferrer">Buka bukti pembayaran</a></div>)}
    </section>}

    {tab === 'repair' && <section className="x-card">
      <div className="x-card-title"><h3>Perbaikan Kendaraan Sewa</h3><p>Catat pembayaran kantor dan bukti perbaikan. Setelah dibayar kantor, biaya dapat ditandai untuk dipotong dari rental.</p></div>
      {editable && <form className="x-grid" onSubmit={saveRepair}>
        <label>Kontrak<select value={repair.kontrak_sewa_id} onChange={e => setRepair({ ...repair, kontrak_sewa_id: e.target.value })}><option value="">Opsional</option>{contracts.map(c => <option key={c.id} value={c.id}>{c.nomor_kontrak || `#${c.id}`}</option>)}</select></label>
        <label>Kendaraan<select value={repair.kendaraan_id} onChange={e => setRepair({ ...repair, kendaraan_id: e.target.value })}><option value="">Pilih</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.nomor_polisi} — {v.merk} {v.tipe || ''}</option>)}</select></label>
        <label>Tanggal<input type="date" value={repair.tanggal_kejadian} onChange={e => setRepair({ ...repair, tanggal_kejadian: e.target.value })} /></label>
        <label>KM<input type="number" min="0" value={repair.kilometer} onChange={e => setRepair({ ...repair, kilometer: e.target.value })} /></label>
        <label>Jenis Kerusakan<input value={repair.jenis_kerusakan} onChange={e => setRepair({ ...repair, jenis_kerusakan: e.target.value })} /></label>
        <label>Penyebab<input value={repair.penyebab} onChange={e => setRepair({ ...repair, penyebab: e.target.value })} /></label>
        <label>Estimasi Biaya<input type="number" min="0" value={repair.estimasi_biaya} onChange={e => setRepair({ ...repair, estimasi_biaya: e.target.value })} /></label>
        <label>Biaya Aktual<input type="number" min="0" value={repair.biaya_aktual} onChange={e => setRepair({ ...repair, biaya_aktual: e.target.value })} /></label>
        <label>Metode Penanganan<input value={repair.metode_penanganan} onChange={e => setRepair({ ...repair, metode_penanganan: e.target.value })} /></label>
        <label>Status<select value={repair.status} onChange={e => setRepair({ ...repair, status: e.target.value })}><option>DIPROSES</option><option>SELESAI</option><option>DIBATALKAN</option></select></label>
        <label>Dibayar Kantor<select value={String(repair.dibayar_kantor)} onChange={e => setRepair({ ...repair, dibayar_kantor: e.target.value === 'true' })}><option value="false">Tidak</option><option value="true">Ya</option></select></label>
        <label>Tanggal Dibayar<input type="date" value={repair.tanggal_dibayar} onChange={e => setRepair({ ...repair, tanggal_dibayar: e.target.value })} /></label>
        <label>Pemilik Diberitahu<select value={String(repair.pemilik_diberitahu)} onChange={e => setRepair({ ...repair, pemilik_diberitahu: e.target.value === 'true' })}><option value="false">Belum</option><option value="true">Ya</option></select></label>
        <label>Dapat Dipotong<select value={String(repair.dapat_dipotong)} onChange={e => setRepair({ ...repair, dapat_dipotong: e.target.value === 'true' })}><option value="false">Tidak</option><option value="true">Ya</option></select></label>
        <label>Jumlah Potongan<input type="number" min="0" value={repair.jumlah_dipotong} onChange={e => setRepair({ ...repair, jumlah_dipotong: e.target.value })} /></label>
        <label className="full">Foto Kerusakan<input type="file" accept="image/*" onChange={e => setRepairPhoto(e.target.files?.[0] || null)} /><small>{repairPhoto ? repairPhoto.name : 'Dokumentasi kondisi kendaraan.'}</small></label>
        <label className="full">Bukti Perbaikan<input type="file" accept=".pdf,image/*" onChange={e => setRepairProof(e.target.files?.[0] || null)} /><small>{repairProof ? repairProof.name : 'Bon/invoice/foto pekerjaan bila tersedia.'}</small></label>
        <label className="full">Deskripsi Kerusakan<textarea value={repair.deskripsi_kerusakan} onChange={e => setRepair({ ...repair, deskripsi_kerusakan: e.target.value })} /></label>
        <label className="full">Catatan<textarea value={repair.catatan} onChange={e => setRepair({ ...repair, catatan: e.target.value })} /></label>
        <div className="full x-actions"><button className="x-btn primary" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan Perbaikan'}</button></div>
      </form>}
      <div className="x-table-wrap"><table className="x-table"><thead><tr><th>Kendaraan</th><th>Tanggal</th><th>Kerusakan</th><th>Biaya</th><th>Potongan</th><th>Bukti</th><th>Status</th></tr></thead><tbody>{repairs.length ? repairs.map(r => { const key1 = `repair-photo-${r.id}`, key2 = `repair-proof-${r.id}`; return <tr key={r.id}><td>{vehicleMap[r.kendaraan_id]?.nomor_polisi || '-'}</td><td>{dateText(r.tanggal_kejadian)}</td><td><b>{r.jenis_kerusakan}</b><small>{r.deskripsi_kerusakan || '-'}</small></td><td>{money(r.biaya_aktual)}<small>Estimasi {money(r.estimasi_biaya)}</small></td><td>{r.dapat_dipotong ? money(r.jumlah_dipotong) : 'Tidak'}</td><td>{r.foto_kerusakan_path && <button className="x-btn secondary" onClick={() => openFile(key1, 'dokumen-sewa', r.foto_kerusakan_path)}>{openedFiles[key1] === 'loading' ? '…' : 'Foto'}</button>} {r.bukti_perbaikan_path && <button className="x-btn secondary" onClick={() => openFile(key2, 'dokumen-sewa', r.bukti_perbaikan_path)}>{openedFiles[key2] === 'loading' ? '…' : 'Bukti'}</button>}</td><td>{r.status}<small>{r.dibayar_kantor ? 'Dibayar kantor' : ''}</small></td></tr> }) : <tr><td colSpan="7"><Empty /></td></tr>}</tbody></table></div>
      {Object.entries(openedFiles).filter(([k, v]) => k.startsWith('repair-') && v && v !== 'loading').map(([k, v]) => <div key={k} className="x-alert"><a href={v} target="_blank" rel="noreferrer">Buka file perbaikan</a></div>)}
    </section>}
    {loading && <div className="x-card"><Empty /></div>}
  </div>
}
