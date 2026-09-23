import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import './TransportOperationsFixed.css'
import { formatDateSafe, formatMonthSafe } from '../utils/dateSafe'

const money = (v) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(v || 0))
const dateText = (v) => formatDateSafe(v)
const EMPTY_OWNER = { jenis_pemilik: 'PERORANGAN', nama_pemilik: '', nomor_hp: '', email: '', alamat: '', nomor_identitas: '', nama_perusahaan: '', nomor_rekening: '', nama_bank: '', keterangan: '', aktif: true }
const EMPTY_CONTRACT = { nomor_kontrak: '', kendaraan_id: '', pemilik_sewa_id: '', tanggal_mulai: '', tanggal_selesai: '', waktu_mulai: '', waktu_selesai: '', periode_bulan: 6, nilai_sewa_bulanan: '', tanggal_jatuh_tempo_bulanan: '', status: 'AKTIF', catatan: '' }
const EMPTY_PAYMENT = { kontrak_sewa_id: '', periode_ke: '', bulan_pembayaran: '', tanggal_jatuh_tempo: '', tanggal_pembayaran: '', jumlah_tagihan: '', jumlah_dibayar: '', metode_pembayaran: '', nomor_referensi: '', catatan: '', perbaikan_sewa_id: '', jumlah_potongan: '' }
const EMPTY_REPAIR = { kontrak_sewa_id: '', kendaraan_id: '', tanggal_kejadian: new Date().toISOString().slice(0, 10), kilometer: '', jenis_kerusakan: '', deskripsi_kerusakan: '', penyebab: '', estimasi_biaya: '', biaya_aktual: '', metode_penanganan: '', dibayar_kantor: false, tanggal_dibayar: '', pemilik_diberitahu: false, status: 'DILAPORKAN', dapat_dipotong: false, jumlah_dipotong: '', catatan: '' }

function Alert({ type = 'success', children }) { return <div className={`x-alert ${type}`}>{children}</div> }
function Header({ title, text, action }) { return <div className="x-head"><div><span className="eyebrow">ADMINISTRASI SEWA</span><h2>{title}</h2><p>{text}</p></div>{action}</div> }
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
  const [rentalHistoryExcel, setRentalHistoryExcel] = useState([])
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
  const [paymentSearch, setPaymentSearch] = useState('')
  const [paymentStatus, setPaymentStatus] = useState('SEMUA')
  const [paymentDetail, setPaymentDetail] = useState(null)
  const [historySearch, setHistorySearch] = useState('')
  const [historyYear, setHistoryYear] = useState('SEMUA')
  const [historySupplier, setHistorySupplier] = useState('SEMUA')
  const [historyForm, setHistoryForm] = useState({ id: null, source_no: '', tahun: new Date().getFullYear(), supplier: '', uraian: '', periode_tagihan: '', nilai_invoice: '' })
  const [editingHistory, setEditingHistory] = useState(null)
  const [historyDetail, setHistoryDetail] = useState(null)
  const [editingOwnerId, setEditingOwnerId] = useState(null), [ownerDetail, setOwnerDetail] = useState(null)
  const [editingContractId, setEditingContractId] = useState(null), [contractDetail, setContractDetail] = useState(null)
  const [editingRepairId, setEditingRepairId] = useState(null), [repairDetail, setRepairDetail] = useState(null)

  const editable = ['ADMIN', 'TRANSPORT', 'AKUNTANSI'].includes(profile?.role)
  const repairEditable = ['ADMIN', 'TRANSPORT'].includes(profile?.role)
  const vehicleMap = useMemo(() => Object.fromEntries(vehicles.map(v => [v.id, v])), [vehicles])
  const repairMap = useMemo(() => Object.fromEntries(repairs.map(r => [r.id, r])), [repairs])
  const historicalRows = useMemo(() => rentalHistoryExcel.map(row => ({
    no_excel: Number(row.source_no) || row.excel_row,
    excel_row: row.excel_row,
    tahun: row.tahun || '-',
    supplier: row.supplier || '-',
    uraian: row.uraian || '-',
    periode_tagihan: row.periode_tagihan || '-',
    nilai_invoice: row.nilai_invoice ?? 0,
  })).sort((a, b) => Number(a.excel_row || 0) - Number(b.excel_row || 0)), [rentalHistoryExcel])

  const load = async () => {
    setLoading(true)
    setError('')
    const rs = await Promise.all([
      supabase.from('pemilik_sewa').select('*').order('nama_pemilik'),
      supabase.from('kontrak_sewa').select('*').order('created_at', { ascending: false }),
      supabase.from('pembayaran_sewa').select('*').order('bulan_pembayaran', { ascending: false }),
      supabase.from('perbaikan_sewa').select('*').order('tanggal_kejadian', { ascending: false }),
      supabase.from('rental_historis_excel').select('*').order('excel_row', { ascending: true }),
      supabase.from('kendaraan').select('id,nomor_polisi,merk,tipe,kepemilikan,jenis_sewa,pemilik').eq('kepemilikan', 'SEWA').order('nomor_polisi'),
    ])
    const names = ['Pemilik', 'Kontrak', 'Pembayaran', 'Perbaikan', 'Histori Excel', 'Kendaraan']
    rs.forEach((r, i) => { if (r.error) setError(e => e || `${names[i]}: ${r.error.message}`) })
    setOwners(rs[0].data || [])
    setContracts(rs[1].data || [])
    setPayments(rs[2].data || [])
    setRepairs(rs[3].data || [])
    setRentalHistoryExcel(rs[4].data || [])
    setVehicles(rs[5].data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    const handleImported = (event) => { if (['sewa', 'kendaraan'].includes(event.detail?.context)) load() }
    window.addEventListener('transport:data-imported', handleImported)
    return () => window.removeEventListener('transport:data-imported', handleImported)
  }, [])

  const clearMessages = () => { setError(''); setSuccess('') }

  const resetOwnerForm = () => { setOwner(EMPTY_OWNER); setEditingOwnerId(null) }
  const editOwner = row => { setEditingOwnerId(row.id); setOwner({ ...EMPTY_OWNER, ...row, nama_pemilik: row.nama_pemilik || '', nama_perusahaan: row.nama_perusahaan || '', nomor_identitas: row.nomor_identitas || '', nomor_hp: row.nomor_hp || '', email: row.email || '', alamat: row.alamat || '', nomor_rekening: row.nomor_rekening || '', nama_bank: row.nama_bank || '', keterangan: row.keterangan || '' }); setTab('pemilik') }
  const deleteOwner = async row => {
    if (!editable) return
    if (contracts.some(c => Number(c.pemilik_sewa_id) === Number(row.id))) return setError('Pemilik masih dipakai pada kontrak. Hapus/ubah kontraknya terlebih dahulu.')
    if (!window.confirm('Hapus pemilik ' + row.nama_pemilik + '?')) return
    setSaving(true); try { const result = await supabase.from('pemilik_sewa').delete().eq('id', row.id); if (result.error) throw result.error; setOwners(current => current.filter(x => x.id !== row.id)); setSuccess('Pemilik sewa dihapus.'); } catch (e) { setError(e.message) } finally { setSaving(false) }
  }
  const saveOwner = async e => {
    e.preventDefault(); clearMessages()
    if (!owner.nama_pemilik.trim()) return setError('Nama pemilik wajib diisi.')
    if (owner.jenis_pemilik === 'PERUSAHAAN_RENTAL' && !owner.nama_perusahaan.trim()) return setError('Nama perusahaan/rental wajib diisi untuk pemilik rental.')
    if (owner.jenis_pemilik === 'PERORANGAN' && !owner.nomor_identitas.trim()) return setError('Nomor identitas pemilik wajib diisi untuk pemilik perorangan.')
    setSaving(true)
    const payload = { ...owner, nama_pemilik: owner.nama_pemilik.trim(), nama_perusahaan: owner.nama_perusahaan.trim() || null, nomor_identitas: owner.nomor_identitas.trim() || null }
    try {
      const result = editingOwnerId ? await supabase.from('pemilik_sewa').update(payload).eq('id', editingOwnerId).select('*').single() : await supabase.from('pemilik_sewa').insert(payload).select('*').single()
      if (result.error) throw result.error
      setOwners(current => editingOwnerId ? current.map(x => x.id === result.data.id ? result.data : x) : [...current, result.data].sort((a,b) => String(a.nama_pemilik || '').localeCompare(String(b.nama_pemilik || ''), 'id')))
      resetOwnerForm(); setSuccess(editingOwnerId ? 'Pemilik sewa diperbarui.' : 'Pemilik sewa tersimpan.')
    } catch (e1) { setError(e1.message) } finally { setSaving(false) }
  }
  const resetContractForm = () => { setContract(EMPTY_CONTRACT); setContractFile(null); setEditingContractId(null) }
  const editContract = row => { setEditingContractId(row.id); setContract({ ...EMPTY_CONTRACT, ...row, kendaraan_id: String(row.kendaraan_id), pemilik_sewa_id: String(row.pemilik_sewa_id), nilai_sewa_bulanan: row.nilai_sewa_bulanan ?? '', tanggal_jatuh_tempo_bulanan: row.tanggal_jatuh_tempo_bulanan ?? '' }); setContractFile(null); setTab('kontrak') }
  const deleteContract = async row => {
    if (!editable) return
    if (payments.some(p => Number(p.kontrak_sewa_id) === Number(row.id)) || repairs.some(p => Number(p.kontrak_sewa_id) === Number(row.id))) return setError('Kontrak sudah memiliki pembayaran/perbaikan. Jangan hapus; ubah statusnya menjadi SELESAI/DIBATALKAN.')
    if (!window.confirm('Hapus kontrak ' + (row.nomor_kontrak || row.id) + '?')) return
    setSaving(true); try { const result = await supabase.from('kontrak_sewa').delete().eq('id', row.id); if (result.error) throw result.error; setContracts(current => current.filter(x => x.id !== row.id)); setSuccess('Kontrak sewa dihapus.') } catch(e){ setError(e.message) } finally { setSaving(false) }
  }
  const saveContract = async e => {
    e.preventDefault(); clearMessages()
    if (!contract.nomor_kontrak.trim() || !contract.kendaraan_id || !contract.pemilik_sewa_id || !contract.tanggal_mulai || !contract.tanggal_selesai) return setError('Nomor kontrak, kendaraan, pemilik, tanggal mulai dan selesai wajib diisi.')
    if (!contract.nilai_sewa_bulanan || Number(contract.nilai_sewa_bulanan) <= 0) return setError('Nilai sewa bulanan wajib lebih dari 0.')
    const start = new Date(`${contract.tanggal_mulai}T00:00:00`); const startYear = start.getFullYear(); const startMonth = start.getMonth(); const startDay = start.getDate(); const targetMonth = new Date(startYear, startMonth + 6, 1); const targetLastDay = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0).getDate(); const clampedDay = Math.min(startDay, targetLastDay); const expectedTarget = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), clampedDay); expectedTarget.setDate(expectedTarget.getDate() - 1); const expectedEnd = expectedTarget; const actualEnd = new Date(`${contract.tanggal_selesai}T00:00:00`)
    if (actualEnd.getTime() !== expectedEnd.getTime()) return setError('Kontrak sewa harus tepat 6 bulan. Tanggal selesai otomatis harus 1 hari sebelum tanggal yang sama pada bulan ke-6.')
    setSaving(true); let contractPath = null
    try {
      if (!editingContractId && !contractFile) throw new Error('Dokumen kontrak wajib diunggah.')
      contractPath = contractFile ? await uploadRentalFile(contractFile, `kontrak/${contract.kendaraan_id}`) : null
      const payload = { ...contract, kendaraan_id: Number(contract.kendaraan_id), pemilik_sewa_id: Number(contract.pemilik_sewa_id), periode_bulan: 6, nilai_sewa_bulanan: Number(contract.nilai_sewa_bulanan), tanggal_jatuh_tempo_bulanan: Number(contract.tanggal_jatuh_tempo_bulanan || 0) || null, dokumen_kontrak_path: contractPath || (editingContractId ? contracts.find(x => x.id === editingContractId)?.dokumen_kontrak_path || null : null) }
      const result = editingContractId ? await supabase.from('kontrak_sewa').update(payload).eq('id', editingContractId).select('*').single() : await supabase.from('kontrak_sewa').insert(payload).select('*').single()
      if (result.error) throw result.error
      const oldPath = editingContractId ? contracts.find(x => x.id === editingContractId)?.dokumen_kontrak_path : null
      if (oldPath && contractPath) await supabase.storage.from('dokumen-sewa').remove([oldPath])
      setContracts(current => editingContractId ? current.map(x => x.id === result.data.id ? result.data : x) : [result.data, ...current])
      resetContractForm(); setSuccess(editingContractId ? 'Kontrak sewa diperbarui.' : 'Kontrak 6 bulan dan dokumen kontrak tersimpan.')
    } catch (e2) { if (contractPath) await supabase.storage.from('dokumen-sewa').remove([contractPath]); setError(e2.message) } finally { setSaving(false) }
  }
  const savePayment = async e => {
    e.preventDefault(); clearMessages()
    if (!payment.kontrak_sewa_id || !payment.periode_ke || !payment.bulan_pembayaran || !payment.tanggal_jatuh_tempo || !payment.jumlah_tagihan) return setError('Kontrak, periode, bulan, jatuh tempo, dan tagihan wajib diisi.')
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
    const status = payment.tanggal_pembayaran && paid >= netBill ? 'SUDAH_DIBAYAR' : (paid > 0 ? 'SEBAGIAN_DIBAYAR' : (payment.tanggal_jatuh_tempo && new Date(payment.tanggal_jatuh_tempo) < new Date() ? 'TERLAMBAT' : 'BELUM_DIBAYAR'))
    if (paid > netBill) return setError('Jumlah dibayar tidak boleh melebihi tagihan bersih setelah potongan.')
    setSaving(true)
    let proofPath = null
    try {
      proofPath = await uploadRentalFile(paymentFile, `pembayaran/${payment.kontrak_sewa_id}`)
      const notePrefix = requestedDeduction > 0 ? `Tagihan bruto ${gross}; potongan repair ${requestedDeduction}; tagihan bersih ${netBill}.` : `Tagihan rental ${gross}.`
      const { data: savedPayment, error: e1 } = await supabase.from('pembayaran_sewa').insert({ kontrak_sewa_id: Number(payment.kontrak_sewa_id), periode_ke: Number(payment.periode_ke), bulan_pembayaran: payment.bulan_pembayaran, tanggal_jatuh_tempo: payment.tanggal_jatuh_tempo || null, tanggal_pembayaran: payment.tanggal_pembayaran || null, jumlah_tagihan: netBill, jumlah_dibayar: paid, status, metode_pembayaran: payment.metode_pembayaran.trim() || null, nomor_referensi: payment.nomor_referensi.trim() || null, bukti_pembayaran_path: proofPath, catatan: [notePrefix, payment.catatan.trim()].filter(Boolean).join(' ') || null, diproses_oleh: profile?.id || null }).select('*').single()
      if (e1) throw e1
      if (requestedDeduction > 0 && savedPayment?.id) {
        const { error: e2 } = await supabase.from('potongan_pembayaran_sewa').insert({ pembayaran_sewa_id: savedPayment.id, perbaikan_sewa_id: Number(payment.perbaikan_sewa_id), jumlah_potongan: requestedDeduction, catatan: `Potongan biaya perbaikan dari pembayaran periode ${payment.periode_ke}.` })
        if (e2) throw e2
      }
      setPayments(current => [savedPayment, ...current]); setPayment(EMPTY_PAYMENT); setPaymentFile(null); setSuccess(requestedDeduction > 0 ? `Pembayaran tersimpan dengan potongan ${money(requestedDeduction)}. Tagihan bersih ${money(netBill)}.` : 'Pembayaran sewa tersimpan.')
    } catch (e3) { if (proofPath) await supabase.storage.from('dokumen-sewa').remove([proofPath]); setError(e3.message) }
    setSaving(false)
  }

  const resetRepairForm = () => { setRepair(EMPTY_REPAIR); setRepairPhoto(null); setRepairProof(null); setEditingRepairId(null) }
  const editRepair = row => { setEditingRepairId(row.id); setRepair({ ...EMPTY_REPAIR, ...row, kontrak_sewa_id: String(row.kontrak_sewa_id), kendaraan_id: String(row.kendaraan_id), kilometer: row.kilometer ?? '', estimasi_biaya: row.estimasi_biaya ?? '', biaya_aktual: row.biaya_aktual ?? '', jumlah_dipotong: row.jumlah_dipotong ?? '' }); setRepairPhoto(null); setRepairProof(null); setTab('repair') }
  const deleteRepair = async row => {
    if (!repairEditable) return
    if (payments.some(p => Number(p.perbaikan_sewa_id) === Number(row.id))) return setError('Perbaikan sudah dipakai sebagai dasar potongan pembayaran. Jangan hapus data ini.')
    if (!window.confirm('Hapus perbaikan ' + (row.jenis_kerusakan || row.id) + '?')) return
    setSaving(true); try { const result = await supabase.from('perbaikan_sewa').delete().eq('id', row.id); if (result.error) throw result.error; const paths=[row.foto_kerusakan_path,row.bukti_perbaikan_path].filter(Boolean); if(paths.length) await supabase.storage.from('dokumen-sewa').remove(paths); setRepairs(current=>current.filter(x=>x.id!==row.id)); setSuccess('Data perbaikan dihapus.') } catch(e){setError(e.message)} finally{setSaving(false)}
  }
  const saveRepair = async e => {
    e.preventDefault(); clearMessages()
    if (!repair.kontrak_sewa_id || !repair.kendaraan_id || !repair.jenis_kerusakan.trim() || !repair.deskripsi_kerusakan.trim()) return setError('Kontrak, kendaraan, jenis kerusakan, dan deskripsi wajib diisi.')
    if (repair.dibayar_kantor && !repair.tanggal_dibayar) return setError('Tanggal pembayaran perbaikan wajib diisi jika dibayar kantor.')
    if (repair.dapat_dipotong && !repair.dibayar_kantor) return setError('Perbaikan baru boleh ditandai dapat dipotong setelah dibayar kantor.')
    if (repair.dapat_dipotong && Number(repair.jumlah_dipotong || 0) <= 0) return setError('Jumlah potongan wajib diisi jika perbaikan dapat dipotong.')
    const selectedContract = contracts.find(c => Number(c.id) === Number(repair.kontrak_sewa_id)); if (!selectedContract) return setError('Kontrak rental tidak ditemukan.'); if (Number(selectedContract.kendaraan_id) !== Number(repair.kendaraan_id)) return setError('Kendaraan perbaikan harus sama dengan kendaraan pada kontrak rental.')
    setSaving(true); let fotoPath = null; let proofPath = null
    try {
      const previous = editingRepairId ? repairs.find(x => x.id === editingRepairId) : null
      fotoPath = repairPhoto ? await uploadRentalFile(repairPhoto, `perbaikan/${repair.kendaraan_id}`) : previous?.foto_kerusakan_path || null
      proofPath = repairProof ? await uploadRentalFile(repairProof, `perbaikan/${repair.kendaraan_id}/bukti`) : previous?.bukti_perbaikan_path || null
      const payload = { ...repair, nomor_perbaikan: previous?.nomor_perbaikan || `REP-${Date.now()}`, kontrak_sewa_id: Number(repair.kontrak_sewa_id), kendaraan_id: Number(repair.kendaraan_id), kilometer: repair.kilometer === '' ? null : Number(repair.kilometer), estimasi_biaya: Number(repair.estimasi_biaya || 0), biaya_aktual: repair.biaya_aktual === '' ? null : Number(repair.biaya_aktual), jumlah_dipotong: repair.dapat_dipotong ? Number(repair.jumlah_dipotong || 0) : 0, foto_kerusakan_path: fotoPath, bukti_perbaikan_path: proofPath, dicatat_oleh: profile?.id || null }
      const result = editingRepairId ? await supabase.from('perbaikan_sewa').update(payload).eq('id', editingRepairId).select('*').single() : await supabase.from('perbaikan_sewa').insert(payload).select('*').single()
      if (result.error) throw result.error
      const old = previous ? [previous.foto_kerusakan_path, previous.bukti_perbaikan_path].filter(Boolean) : []
      const newPaths = [fotoPath, proofPath].filter(Boolean); const removed = old.filter(x => !newPaths.includes(x)); if(removed.length) await supabase.storage.from('dokumen-sewa').remove(removed)
      setRepairs(current => editingRepairId ? current.map(x => x.id === result.data.id ? result.data : x) : [result.data, ...current])
      resetRepairForm(); setSuccess(editingRepairId ? 'Data perbaikan diperbarui.' : 'Perbaikan kendaraan sewa, dokumentasi dan status potongannya tersimpan.')
    } catch (e2) { const currentNew=[fotoPath,proofPath].filter(Boolean); const oldKeep=editingRepairId?repairs.find(x=>x.id===editingRepairId):null; const oldPaths=[oldKeep?.foto_kerusakan_path,oldKeep?.bukti_perbaikan_path].filter(Boolean); const orphan=currentNew.filter(x=>!oldPaths.includes(x)); if(orphan.length) await supabase.storage.from('dokumen-sewa').remove(orphan); setError(e2.message) } finally { setSaving(false) }
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

  const filteredPayments = useMemo(() => {
    const q = paymentSearch.trim().toLowerCase()
    return payments.filter(p => {
      const contractRow = contracts.find(c => c.id === p.kontrak_sewa_id)
      const vehicle = vehicleMap[contractRow?.kendaraan_id]
      const ownerRow = owners.find(o => o.id === contractRow?.pemilik_sewa_id)
      const hay = [p.nomor_referensi, p.status, contractRow?.nomor_kontrak, vehicle?.nomor_polisi, vehicle?.merk, ownerRow?.nama_pemilik, ownerRow?.nama_perusahaan].filter(Boolean).join(' ').toLowerCase()
      return (!q || hay.includes(q)) && (paymentStatus === 'SEMUA' || p.status === paymentStatus)
    })
  }, [payments, contracts, owners, vehicleMap, paymentSearch, paymentStatus])
  const historySuppliers = useMemo(() => Array.from(new Set(rentalHistoryExcel.map(r => String(r.supplier || '').trim()).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'id')), [rentalHistoryExcel])
  const historyYears = useMemo(() => Array.from(new Set(rentalHistoryExcel.map(r => Number(r.tahun)).filter(Number.isFinite))).sort((a,b)=>b-a), [rentalHistoryExcel])
  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase()
    return historicalRows.filter(row => {
      const hay = [row.no_excel, row.tahun, row.supplier, row.uraian, row.periode_tagihan].join(' ').toLowerCase()
      return (!q || hay.includes(q)) && (historyYear === 'SEMUA' || Number(row.tahun) === Number(historyYear)) && (historySupplier === 'SEMUA' || row.supplier === historySupplier)
    })
  }, [historicalRows, historySearch, historyYear, historySupplier])
  const historyTotal = useMemo(() => filteredHistory.reduce((sum,row)=>sum+Number(row.nilai_invoice||0),0), [filteredHistory])
  const resetHistoryForm = () => { setHistoryForm({ id:null, source_no:'', tahun:new Date().getFullYear(), supplier:'', uraian:'', periode_tagihan:'', nilai_invoice:'' }); setEditingHistory(null) }
  const editHistory = row => { setEditingHistory(row); setHistoryForm({ id:row.id, source_no:row.no_excel, tahun:row.tahun, supplier:row.supplier === '-' ? '' : row.supplier, uraian:row.uraian === '-' ? '' : row.uraian, periode_tagihan:row.periode_tagihan === '-' ? '' : row.periode_tagihan, nilai_invoice:row.nilai_invoice }); setTab('historis') }
  const saveHistory = async e => {
    e.preventDefault(); clearMessages()
    if(!String(historyForm.tahun).trim() || !historyForm.supplier.trim() || !historyForm.uraian.trim() || !String(historyForm.periode_tagihan).trim() || Number(historyForm.nilai_invoice) < 0) return setError('Tahun, supplier, uraian, periode tagihan, dan nilai invoice wajib diisi.')
    setSaving(true)
    try {
      const maxRow = rentalHistoryExcel.reduce((m,row)=>Math.max(m,Number(row.excel_row)||0),0)
      const maxNo = rentalHistoryExcel.reduce((m,row)=>Math.max(m,Number(row.source_no)||0),0)
      const payload = { source_no:String(historyForm.source_no || maxNo + 1), excel_row:editingHistory?.excel_row || maxRow + 1, tahun:Number(historyForm.tahun), supplier:historyForm.supplier.trim(), uraian:historyForm.uraian.trim(), periode_tagihan:historyForm.periode_tagihan.trim(), nilai_invoice:Number(historyForm.nilai_invoice), source_file:'Manual', source_sheet:'SUMMERY RENTAL' }
      const result = editingHistory
        ? await supabase.from('rental_historis_excel').update(payload).eq('id',editingHistory.id).select('*').single()
        : await supabase.from('rental_historis_excel').insert(payload).select('*').single()
      if(result.error) throw result.error
      setRentalHistoryExcel(current => { const next=editingHistory?current.map(row=>row.id===result.data.id?result.data:row):[...current,result.data]; return next.sort((a,b)=>Number(a.excel_row||0)-Number(b.excel_row||0)) })
      resetHistoryForm(); setSuccess(editingHistory?'Data SUMMERY RENTAL diperbarui.':'Data SUMMERY RENTAL ditambahkan.')
    } catch(e2) { setError(e2.message) } finally { setSaving(false) }
  }
  const deleteHistory = async row => {
    if(!editable) return
    if(!window.confirm(`Hapus data rental ${row.no_excel || row.id} dari riwayat tagihan?`)) return
    setSaving(true); try { const result=await supabase.from('rental_historis_excel').delete().eq('id',row.id); if(result.error) throw result.error; setRentalHistoryExcel(current=>current.filter(x=>x.id!==row.id)); setSuccess('Data riwayat rental dihapus.'); if(historyDetail?.id===row.id) setHistoryDetail(null) } catch(e){setError(e.message)} finally{setSaving(false)}
  }


  return <div className="x-page">
    <Header title="Administrasi Kendaraan Sewa" text="Master kendaraan tetap berada di menu Kendaraan. Halaman ini khusus untuk administrasi kendaraan Sewa: pemilik, kontrak 6 bulan, pembayaran, bukti, perbaikan, dan potongan." action={<button className="x-btn secondary" onClick={load}>↻ Refresh</button>} />
    {error && <Alert type="error">{error}</Alert>}
    {success && <Alert>{success}</Alert>}
    <div className="x-tabs">{[['kendaraan', 'Daftar Sewa'], ['kontrak', 'Kontrak'], ['pemilik', 'Pemilik'], ['pembayaran', 'Pembayaran'], ['historis', 'Riwayat Excel'], ...(repairEditable ? [['repair', 'Perbaikan']] : [])].map(([v, l]) => <button key={v} className={tab === v ? 'active' : ''} onClick={() => { clearMessages(); setTab(v) }}>{l}</button>)}</div>

    {tab === 'kendaraan' && <section className="x-card">
      <div className="x-card-title"><div><h3>Daftar Kendaraan Sewa</h3><p>Data kendaraan diambil dari Master Kendaraan dengan kepemilikan <b>Sewa</b>. Tambah atau edit kendaraan tetap dilakukan di menu Kendaraan agar tidak ada data kendaraan ganda.</p></div></div>
      <div className="x-table-wrap"><table className="x-table"><thead><tr><th>No. Polisi</th><th>Merk / Type</th><th>Jenis Sewa</th><th>Pemilik</th><th>Kontrak</th><th>Periode</th><th>Nilai Sewa</th><th>Status</th></tr></thead><tbody>{vehicles.length ? vehicles.map(v => { const contractRow = contracts.find(c => Number(c.kendaraan_id) === Number(v.id) && c.status === 'AKTIF') || contracts.find(c => Number(c.kendaraan_id) === Number(v.id)); const ownerRow = owners.find(o => Number(o.id) === Number(contractRow?.pemilik_sewa_id)); return <tr key={v.id}><td><b>{v.nomor_polisi}</b></td><td>{v.merk} {v.tipe || ''}</td><td>{v.jenis_sewa === 'SEWA_PERORANGAN' ? 'Sewa Perorangan' : v.jenis_sewa === 'SEWA_PERUSAHAAN' ? 'Sewa Perusahaan' : 'Belum ditentukan'}</td><td>{ownerRow?.nama_pemilik || v.pemilik || '-' }<small>{ownerRow?.nama_perusahaan || ''}</small></td><td>{contractRow?.nomor_kontrak || '-'}</td><td>{contractRow ? `${dateText(contractRow.tanggal_mulai)} s/d ${dateText(contractRow.tanggal_selesai)}` : '-'}</td><td>{contractRow ? money(contractRow.nilai_sewa_bulanan) : '-'}</td><td>{contractRow?.status || 'BELUM ADA KONTRAK'}</td></tr> }) : <tr><td colSpan="7"><Empty /></td></tr>}</tbody></table></div>
    </section>}

    {tab === 'pemilik' && <section className="x-card">
      <div className="x-card-title"><h3>Data Pemilik Sewa</h3></div>
      {editable && <form className="x-grid" onSubmit={saveOwner}>
        <label>Jenis Pemilik<select value={owner.jenis_pemilik} onChange={e => setOwner({ ...owner, jenis_pemilik: e.target.value })}><option value="PERORANGAN">Perorangan</option><option value="PERUSAHAAN_RENTAL">Perusahaan</option></select></label>
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
      <div className="x-card-title"><div><h3>Pembayaran Sewa Bulanan</h3><p>Rekap pembayaran rental per kontrak. No. rangka tidak digunakan di administrasi sewa.</p></div></div>
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
      <div className="x-toolbar-inline"><input value={paymentSearch} onChange={e => setPaymentSearch(e.target.value)} placeholder="Cari BM, kontrak, pemilik, referensi..." /><select value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)}><option value="SEMUA">Semua status</option><option value="BELUM_DIBAYAR">Belum Dibayar</option><option value="SEBAGIAN_DIBAYAR">Sebagian Dibayar</option><option value="SUDAH_DIBAYAR">Sudah Dibayar</option><option value="TERLAMBAT">Terlambat</option></select><button className="x-btn secondary" type="button" onClick={() => { setPaymentSearch(''); setPaymentStatus('SEMUA') }}>Reset Filter</button></div>
      <div className="x-table-wrap"><table className="x-table"><thead><tr><th>No Kontrak</th><th>No. Polisi</th><th>Pemilik</th><th>Periode Ke</th><th>Jatuh Tempo</th><th>Tagihan</th><th>Dibayar</th><th>Status</th><th>Bukti</th><th>Aksi</th></tr></thead><tbody>{filteredPayments.length ? filteredPayments.map(p => { const key = 'payment-' + p.id; const contractRow = contracts.find(c => c.id === p.kontrak_sewa_id); const ownerRow = owners.find(o => o.id === contractRow?.pemilik_sewa_id); const plate = vehicleMap[contractRow?.kendaraan_id]?.nomor_polisi || '-'; return <tr key={p.id}><td><b>{contractRow?.nomor_kontrak || '-'}</b><small>{formatMonthSafe(p.bulan_pembayaran)}</small></td><td>{plate}</td><td>{ownerRow?.nama_pemilik || '-'}<small>{ownerRow?.nama_perusahaan || ''}</small></td><td>{p.periode_ke} / 6</td><td>{dateText(p.tanggal_jatuh_tempo)}</td><td>{money(p.jumlah_tagihan)}</td><td>{money(p.jumlah_dibayar)}</td><td><span className="x-pill">{p.status}</span></td><td>{p.bukti_pembayaran_path ? <button className="x-btn secondary" onClick={() => openFile(key, 'dokumen-sewa', p.bukti_pembayaran_path)}>{openedFiles[key] === 'loading' ? '…' : 'Lihat'}</button> : '-'}</td><td className="x-action-compact"><button className="x-link" onClick={() => setPaymentDetail(p)}>Detail</button></td></tr> }) : <tr><td colSpan="10"><Empty /></td></tr>}</tbody></table></div>
      {paymentDetail && <div className="x-overlay"><section className="x-modal"><div className="x-modal-head"><div><span className="eyebrow">DETAIL PEMBAYARAN RENTAL</span><h3>{contracts.find(c => c.id === paymentDetail.kontrak_sewa_id)?.nomor_kontrak || '-'}</h3></div><button onClick={() => setPaymentDetail(null)}>×</button></div><div className="x-detail"><p><b>No. Polisi:</b> {vehicleMap[contracts.find(c => c.id === paymentDetail.kontrak_sewa_id)?.kendaraan_id]?.nomor_polisi || '-'}</p><p><b>Periode:</b> {paymentDetail.periode_ke} / 6</p><p><b>Bulan:</b> {formatMonthSafe(paymentDetail.bulan_pembayaran)}</p><p><b>Jatuh Tempo:</b> {dateText(paymentDetail.tanggal_jatuh_tempo)}</p><p><b>Tagihan:</b> {money(paymentDetail.jumlah_tagihan)}</p><p><b>Dibayar:</b> {money(paymentDetail.jumlah_dibayar)}</p><p><b>Status:</b> {paymentDetail.status}</p><p><b>Metode:</b> {paymentDetail.metode_pembayaran || '-'}</p><p><b>Referensi:</b> {paymentDetail.nomor_referensi || '-'}</p><p><b>Catatan:</b> {paymentDetail.catatan || '-'}</p></div><div className="x-actions"><button className="x-btn secondary" onClick={() => setPaymentDetail(null)}>Tutup</button></div></section></div>}
      {Object.entries(openedFiles).filter(([k, v]) => k.startsWith('payment-') && v && v !== 'loading').map(([k, v]) => <div key={k} className="x-alert"><a href={v} target="_blank" rel="noreferrer">Buka bukti pembayaran</a></div>)}
    </section>}

    {tab === 'historis' && <section className="x-card">
      <div className="x-card-title"><div><h3>Summary Rental — Penagihan</h3><p>Fokus halaman ini adalah memeriksa tagihan rental secara jelas: supplier, uraian, periode, tahun, dan nilai invoice. No. rangka tidak diperlukan.</p></div>{editable&&<button className="x-btn primary" type="button" onClick={resetHistoryForm}>+ Tambah Data</button>}</div>
      <div className="x-summary-grid rental-summary-grid"><div><span>Baris tampil</span><b>{filteredHistory.length}</b></div><div><span>Total Invoice</span><b>{money(historyTotal)}</b></div><div><span>Tahun aktif</span><b>{historyYear === 'SEMUA' ? 'Semua' : historyYear}</b></div><div><span>Supplier</span><b>{historySupplier === 'SEMUA' ? 'Semua' : historySupplier}</b></div></div>
      {editable&&<form className="x-grid rental-history-form" onSubmit={saveHistory}><label>Tahun<input type="number" min="2000" max="2100" value={historyForm.tahun} onChange={e=>setHistoryForm({...historyForm,tahun:e.target.value})}/></label><label>Supplier<input value={historyForm.supplier} onChange={e=>setHistoryForm({...historyForm,supplier:e.target.value})} placeholder="Nama perusahaan rental"/></label><label>Uraian<input value={historyForm.uraian} onChange={e=>setHistoryForm({...historyForm,uraian:e.target.value})} placeholder="Uraian tagihan"/></label><label>Periode Tagihan<input value={historyForm.periode_tagihan} onChange={e=>setHistoryForm({...historyForm,periode_tagihan:e.target.value})} placeholder="Januari / 01-2026"/></label><label>Nilai Invoice<input type="number" min="0" value={historyForm.nilai_invoice} onChange={e=>setHistoryForm({...historyForm,nilai_invoice:e.target.value})}/></label><label>No. Sumber (opsional)<input value={historyForm.source_no} onChange={e=>setHistoryForm({...historyForm,source_no:e.target.value})}/></label><div className="full x-actions"><button type="button" className="x-btn secondary" onClick={resetHistoryForm}>Bersihkan</button><button className="x-btn primary" disabled={saving}>{editingHistory?'Perbarui Data':'Simpan Data'}</button></div></form>}
      <div className="x-toolbar-inline"><input value={historySearch} onChange={e=>setHistorySearch(e.target.value)} placeholder="Cari supplier, uraian, periode, nomor..." /><select value={historyYear} onChange={e=>setHistoryYear(e.target.value)}><option value="SEMUA">Semua tahun</option>{historyYears.map(y=><option key={y} value={y}>{y}</option>)}</select><select value={historySupplier} onChange={e=>setHistorySupplier(e.target.value)}><option value="SEMUA">Semua supplier</option>{historySuppliers.map(x=><option key={x} value={x}>{x}</option>)}</select><button className="x-btn secondary" type="button" onClick={()=>{setHistorySearch('');setHistoryYear('SEMUA');setHistorySupplier('SEMUA')}}>Reset Filter</button></div>
      <div className="x-table-wrap"><table className="x-table rental-history-table"><thead><tr><th>No</th><th>Tahun</th><th>Supplier</th><th>Uraian</th><th>Periode Tagihan</th><th>Nilai Invoice</th><th>Aksi</th></tr></thead><tbody>{filteredHistory.length ? filteredHistory.map(row=><tr key={row.excel_row}><td><b>{row.no_excel}</b></td><td>{row.tahun}</td><td>{row.supplier}</td><td>{row.uraian}</td><td>{row.periode_tagihan}</td><td><b>{money(row.nilai_invoice)}</b></td><td className="x-action-compact"><button className="x-link" onClick={()=>setHistoryDetail(row)}>Detail</button>{editable&&<><button className="x-link" onClick={()=>editHistory(row)}>Edit</button><button className="x-link danger" onClick={()=>deleteHistory(row)} disabled={saving}>Hapus</button></>}</td></tr>) : <tr><td colSpan="7"><Empty /></td></tr>}</tbody></table></div>
    </section>}
    {historyDetail && <div className="x-overlay"><section className="x-modal"><div className="x-modal-head"><div><span className="eyebrow">DETAIL TAGIHAN RENTAL</span><h3>{historyDetail.supplier}</h3></div><button onClick={()=>setHistoryDetail(null)}>×</button></div><div className="x-detail"><p><b>No:</b> {historyDetail.no_excel}</p><p><b>Tahun:</b> {historyDetail.tahun}</p><p><b>Supplier:</b> {historyDetail.supplier}</p><p><b>Uraian:</b> {historyDetail.uraian}</p><p><b>Periode:</b> {historyDetail.periode_tagihan}</p><p><b>Nilai Invoice:</b> {money(historyDetail.nilai_invoice)}</p><p><b>Sumber:</b> {historyDetail.source_file || '-'}</p></div><div className="x-actions"><button className="x-btn secondary" onClick={()=>setHistoryDetail(null)}>Tutup</button>{editable&&<button className="x-btn primary" onClick={()=>{setHistoryDetail(null);editHistory(historyDetail)}}>Edit Data</button>}</div></section></div>}
    {tab === 'repair' && <section className="x-card">
      <div className="x-card-title"><h3>Perbaikan Kendaraan Sewa</h3><p>Catat pembayaran kantor dan bukti perbaikan. Setelah dibayar kantor, biaya dapat ditandai untuk dipotong dari rental.</p></div>
      {repairEditable && <form className="x-grid" onSubmit={saveRepair}>
        <label>Kontrak<select value={repair.kontrak_sewa_id} onChange={e => setRepair({ ...repair, kontrak_sewa_id: e.target.value })}><option value="">Pilih kontrak</option>{contracts.map(c => <option key={c.id} value={c.id}>{c.nomor_kontrak || `#${c.id}`}</option>)}</select></label>
        <label>Kendaraan<select value={repair.kendaraan_id} onChange={e => setRepair({ ...repair, kendaraan_id: e.target.value })}><option value="">Pilih</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.nomor_polisi} — {v.merk} {v.tipe || ''}</option>)}</select></label>
        <label>Tanggal<input type="date" value={repair.tanggal_kejadian} onChange={e => setRepair({ ...repair, tanggal_kejadian: e.target.value })} /></label>
        <label>KM<input type="number" min="0" value={repair.kilometer} onChange={e => setRepair({ ...repair, kilometer: e.target.value })} /></label>
        <label>Jenis Kerusakan<input value={repair.jenis_kerusakan} onChange={e => setRepair({ ...repair, jenis_kerusakan: e.target.value })} /></label>
        <label>Penyebab<input value={repair.penyebab} onChange={e => setRepair({ ...repair, penyebab: e.target.value })} /></label>
        <label>Estimasi Biaya<input type="number" min="0" value={repair.estimasi_biaya} onChange={e => setRepair({ ...repair, estimasi_biaya: e.target.value })} /></label>
        <label>Biaya Aktual<input type="number" min="0" value={repair.biaya_aktual} onChange={e => setRepair({ ...repair, biaya_aktual: e.target.value })} /></label>
        <label>Metode Penanganan<select value={repair.metode_penanganan} onChange={e => setRepair({ ...repair, metode_penanganan: e.target.value })}><option value="">Pilih</option><option value="KAS_KANTOR">Kas Kantor</option><option value="BENGKEL_LANGGANAN">Bengkel Langganan</option><option value="LAINNYA">Lainnya</option></select></label>
        <label>Status<select value={repair.status} onChange={e => setRepair({ ...repair, status: e.target.value })}><option value="DILAPORKAN">Dilaporkan</option><option value="DIPERIKSA">Diperiksa</option><option value="DALAM_PERBAIKAN">Dalam Perbaikan</option><option value="SELESAI">Selesai</option><option value="DIBATALKAN">Dibatalkan</option></select></label>
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