import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import './PermintaanServicePage.css'

const TYPE_LABELS = { SERVICE: 'Jasa / Perbaikan', GANTI_BAN: 'Ganti Ban', GANTI_AKI: 'Ganti Aki / Baterai', PEMERIKSAAN: 'Pemeriksaan' }
const STATUS_LABELS = { MENUNGGU_TRANSPORT: 'Menunggu Transport', DITERIMA_TRANSPORT: 'Diterima Transport', DALAM_PROSES: 'Dalam Proses', MENUNGGU_APPROVAL: 'Menunggu Approval', DISETUJUI: 'Disetujui', DITOLAK: 'Ditolak', SELESAI: 'Selesai', DIBATALKAN: 'Dibatalkan' }
const TERMINAL = ['SELESAI', 'DITOLAK', 'DIBATALKAN']
const EMPTY = { id: null, kendaraan_id: '', jenis_permintaan: 'SERVICE', kilometer: '', keluhan: '', prioritas: 'NORMAL' }
const money = v => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(v || 0))
const number = v => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Number(v || 0))
const fmtDate = value => {
  const raw = String(value ?? '').trim()
  if (!raw) return '-'
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : raw
}
const clean = v => String(v ?? '').trim()
const normalizeItemName = v => clean(v).replace(/^\d+[.)-]\s*/, '').toUpperCase()
const itemCategory = (category, name = '') => {
  const raw = (clean(category) + ' ' + clean(name)).toUpperCase()
  if (/BAN|TYRE|TIRE/.test(raw)) return 'BAN'
  if (/AKI|BATERAI|BATTERY/.test(raw)) return 'AKI'
  if (/OLI|PELUMAS|GREASE|FILTER OLI|FILTER MINYAK|FILTER HAWA|FILTER UDARA|BUSI|KANVAS REM|BRAKE PAD|KAMPAS REM|KOPLING|CLUTCH|SHOCK|ABSORBER|BEARING|RACK END|DRAGLINK|SPAREPART|PENGADAAN BARANG/.test(raw)) return 'SPAREPART'
  if (/JASA|SERVICE|PEKERJAAN|LABOR/.test(raw)) return 'JASA'
  return clean(category).toUpperCase() || 'LAINNYA'
}

export default function PermintaanServicePage({ profile }) {
  const [vehicles, setVehicles] = useState([])
  const [services, setServices] = useState([])
  const [items, setItems] = useState([])
  const [kilometers, setKilometers] = useState([])
  const [bans, setBans] = useState([])
  const [akis, setAkis] = useState([])
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [detail, setDetail] = useState(null)
  const [printRequest, setPrintRequest] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('SEMUA')
  const [vehicleFilter, setVehicleFilter] = useState('SEMUA')
  const [brandFilter, setBrandFilter] = useState('SEMUA')
  const [summarySearch, setSummarySearch] = useState('')
  const [summaryOwnership, setSummaryOwnership] = useState('SEMUA')
  const [benchmarkSearch, setBenchmarkSearch] = useState('')
  const [benchmarks, setBenchmarks] = useState([])
  const [benchmarkForm, setBenchmarkForm] = useState({ id: null, nama_item: '', kategori: 'SPAREPART', satuan: 'pcs', harga_patokan: '', berlaku_mulai: new Date().toISOString().slice(0, 10), keterangan: '' })
  const [editingBenchmark, setEditingBenchmark] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])
  const [selectionMode, setSelectionMode] = useState(false)
  const [viewMode, setViewMode] = useState('ringkasan')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const pressRef = useRef(null)
  const ignoreClickRef = useRef(false)

  const canCreate = ['ADMIN', 'OPERASIONAL', 'TRANSPORT'].includes(profile?.role)
  const canDelete = profile?.role === 'ADMIN'
  const canEditRequest = ['ADMIN', 'OPERASIONAL', 'TRANSPORT'].includes(profile?.role)

  const loadData = async () => {
    setLoading(true); setError('')
    const rs = await Promise.all([
      supabase.from('kendaraan').select('id,kode_kendaraan,nomor_polisi,merk,tipe,jenis_kendaraan,tahun,kepemilikan,jenis_sewa,pemilik,lokasi,unit_kerja,harga_perolehan,kilometer_terakhir,status').order('nomor_polisi'),
      supabase.from('permintaan_service').select('*').order('created_at', { ascending: false }),
      supabase.from('service').select('id,nomor_service,permintaan_service_id,kendaraan_id,tanggal_service,kilometer,bengkel,jenis_service,keluhan,estimasi_biaya,biaya_aktual,status,total').order('tanggal_service', { ascending: false }),
      supabase.from('service_item').select('id,service_id,nama_item,kategori,jumlah,satuan,harga_satuan,subtotal,keterangan').order('created_at', { ascending: false }),
      supabase.from('riwayat_kilometer').select('id,kendaraan_id,tanggal,kilometer,sumber').order('tanggal', { ascending: true }),
      supabase.from('riwayat_ban').select('id,kendaraan_id,tanggal_penggantian,kilometer,biaya,merek_ban,ukuran_ban').order('tanggal_penggantian', { ascending: true }),
      supabase.from('riwayat_aki').select('id,kendaraan_id,tanggal_penggantian,kilometer,biaya,merek_aki,tipe_aki').order('tanggal_penggantian', { ascending: true }),
      supabase.from('patokan_harga_service').select('*').eq('aktif', true).order('nama_item'),
    ])
    const names = ['Kendaraan', 'Pengajuan', 'Service', 'Item Service', 'Riwayat KM', 'Riwayat Ban', 'Riwayat Aki', 'Patokan Harga']
    rs.forEach((r, i) => { if (r.error) setError(prev => prev || `${names[i]}: ${r.error.message}`) })
    setVehicles(rs[0].data || []); setRequests(rs[1].data || []); setServices(rs[2].data || []); setItems(rs[3].data || [])
    setKilometers(rs[4].data || []); setBans(rs[5].data || []); setAkis(rs[6].data || []); setBenchmarks(rs[7].data || [])
    setSelectedIds([]); setSelectionMode(false); setLoading(false)
  }

  useEffect(() => {
    loadData()
    const onImported = event => { if (['service', 'pengajuan', 'kendaraan'].includes(event.detail?.context)) loadData() }
    window.addEventListener('transport:data-imported', onImported)
    return () => window.removeEventListener('transport:data-imported', onImported)
  }, [])

  useEffect(() => {
    const handleKey = event => { if ((event.ctrlKey || event.metaKey) && event.key === 'p' && printRequest) { event.preventDefault(); window.print() } }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [printRequest])

  const vehicleMap = useMemo(() => Object.fromEntries(vehicles.map(v => [v.id, v])), [vehicles])

  const summaryRows = useMemo(() => vehicles.map(vehicle => {
    const vehicleServices = services.filter(s => Number(s.kendaraan_id) === Number(vehicle.id))
    const serviceIds = new Set(vehicleServices.map(s => s.id))
    const vehicleItems = items.filter(i => serviceIds.has(i.service_id))
    const categorizedItems = vehicleItems.map(i => ({ ...i, computedCategory: itemCategory(i.kategori, i.nama_item) }))
    const jasaItems = categorizedItems.filter(i => i.computedCategory === 'JASA')
    const spareItems = categorizedItems.filter(i => ['SPAREPART', 'BAN', 'AKI'].includes(i.computedCategory))
    const noItemService = vehicleServices.filter(s => !vehicleItems.some(i => i.service_id === s.id) && ['SERVICE', 'PEMERIKSAAN'].includes(String(s.jenis_service || '').toUpperCase()))
    const totalJasa = jasaItems.reduce((sum, i) => sum + Number(i.subtotal || 0), 0) + noItemService.reduce((sum, s) => sum + Number(s.total ?? s.biaya_aktual ?? s.estimasi_biaya ?? 0), 0)
    const totalSpare = spareItems.reduce((sum, i) => sum + Number(i.subtotal || 0), 0) + bans.filter(r => Number(r.kendaraan_id) === Number(vehicle.id)).reduce((sum, r) => sum + Number(r.biaya || 0), 0) + akis.filter(r => Number(r.kendaraan_id) === Number(vehicle.id)).reduce((sum, r) => sum + Number(r.biaya || 0), 0)
    const totalService = vehicleServices.reduce((sum, s) => sum + Number(s.total ?? s.biaya_aktual ?? s.estimasi_biaya ?? 0), 0)
    const totalRepair = bans.filter(r => Number(r.kendaraan_id) === Number(vehicle.id)).reduce((sum, r) => sum + Number(r.biaya || 0), 0) + akis.filter(r => Number(r.kendaraan_id) === Number(vehicle.id)).reduce((sum, r) => sum + Number(r.biaya || 0), 0)
    const totalPengeluaran = totalService + totalRepair
    const jasaServiceIds = new Set(jasaItems.map(i => i.service_id))
    noItemService.forEach(s => jasaServiceIds.add(s.id))
    const spareServiceIds = new Set(spareItems.map(i => i.service_id))
    const usagePoints = [
      ...kilometers.filter(k => Number(k.kendaraan_id) === Number(vehicle.id)).map(k => Number(k.kilometer)),
      ...vehicleServices.map(s => Number(s.kilometer)).filter(Number.isFinite),
      ...requests.filter(r => Number(r.kendaraan_id) === Number(vehicle.id)).map(r => Number(r.kilometer_pengajuan)).filter(Number.isFinite),
      Number(vehicle.kilometer_terakhir || 0),
    ].filter(n => Number.isFinite(n) && n >= 0)
    const kmAwal = usagePoints.length ? Math.min(...usagePoints) : 0
    const kmAkhir = usagePoints.length ? Math.max(...usagePoints) : Number(vehicle.kilometer_terakhir || 0)
    const serviceHistory = [...vehicleServices].sort((a, b) => String(b.tanggal_service || '').localeCompare(String(a.tanggal_service || ''))).map(s => ({ id: s.id, tanggal: s.tanggal_service, kilometer: s.kilometer, bengkel: s.bengkel, jenis: itemCategory(s.jenis_service, s.keluhan), jenisLabel: TYPE_LABELS[s.jenis_service] || s.jenis_service || '-', keluhan: s.keluhan || '-', total: Number(s.total ?? s.biaya_aktual ?? s.estimasi_biaya ?? 0), items: items.filter(i => i.service_id === s.id).map(i => ({ nama_item: i.nama_item, kategori: itemCategory(i.kategori, i.nama_item), jumlah: i.jumlah, satuan: i.satuan, harga_satuan: Number(i.harga_satuan || 0), subtotal: Number(i.subtotal || 0) })) }))
    const jarak = Math.max(0, kmAkhir - kmAwal)
    const vehiclePrice = Number(vehicle.harga_perolehan || 0)
    const ratio = vehiclePrice > 0 ? totalPengeluaran / vehiclePrice : null
    const lastJasa = [...vehicleServices.filter(s => jasaServiceIds.has(s.id)), ...requests.filter(r => Number(r.kendaraan_id) === Number(vehicle.id) && r.jenis_permintaan === 'SERVICE')].sort((a, b) => String(b.tanggal_service || b.tanggal_pengajuan || '').localeCompare(String(a.tanggal_service || a.tanggal_pengajuan || '')))[0]
    const lastSpareDate = [...vehicleServices.filter(s => spareServiceIds.has(s.id)), ...bans.filter(r => Number(r.kendaraan_id) === Number(vehicle.id)).map(r => ({ tanggal_service: r.tanggal_penggantian })), ...akis.filter(r => Number(r.kendaraan_id) === Number(vehicle.id)).map(r => ({ tanggal_service: r.tanggal_penggantian }))].sort((a, b) => String(b.tanggal_service || '').localeCompare(String(a.tanggal_service || '')))[0]?.tanggal_service
    return {
      vehicle, totalTransaksi: vehicleServices.length, jasaKali: jasaServiceIds.size, spareKali: spareServiceIds.size + bans.filter(r => Number(r.kendaraan_id) === Number(vehicle.id)).length + akis.filter(r => Number(r.kendaraan_id) === Number(vehicle.id)).length,
      totalJasa, totalSpare, totalService, totalRepair, totalPengeluaran, vehiclePrice, ratio, jarak, kmAwal, kmAkhir, serviceHistory,
      lastJasa: lastJasa?.tanggal_service || lastJasa?.tanggal_pengajuan || null, lastSpare: lastSpareDate,
      costFlag: vehiclePrice > 0 && totalPengeluaran > vehiclePrice ? 'MELEWATI_HARGA' : vehiclePrice > 0 && totalPengeluaran >= vehiclePrice * 0.8 ? 'MENDEKATI_HARGA' : vehiclePrice > 0 ? 'DI_BAWAH_HARGA' : 'HARGA_BELUM_DIISI',
    }
  }), [vehicles, services, items, kilometers, bans, akis, requests])

  const brands = useMemo(() => Array.from(new Set(vehicles.map(v => clean(v.merk)).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'id')), [vehicles])
  const summaryFiltered = useMemo(() => {
    const q = summarySearch.trim().toLowerCase()
    return summaryRows.filter(row => {
      const v = row.vehicle
      const hay = [v.nomor_polisi, v.merk, v.tipe, v.jenis_kendaraan, v.pemilik, v.unit_kerja].filter(Boolean).join(' ').toLowerCase()
      return (!q || hay.includes(q)) && (brandFilter === 'SEMUA' || v.merk === brandFilter) && (summaryOwnership === 'SEMUA' || v.kepemilikan === summaryOwnership)
    })
  }, [summaryRows, summarySearch, brandFilter, summaryOwnership])

  const totalSummaryExpense = useMemo(() => summaryRows.reduce((sum, row) => sum + row.totalPengeluaran, 0), [summaryRows])
  const overPriceCount = useMemo(() => summaryRows.filter(r => r.costFlag === 'MELEWATI_HARGA').length, [summaryRows])

  const benchmarkRows = useMemo(() => {
    const grouped = new Map()
    items.forEach(item => {
      const name = normalizeItemName(item.nama_item)
      if (!name) return
      const kategori = itemCategory(item.kategori, item.nama_item)
      const key = name + '|' + kategori
      const current = grouped.get(key) || { nama_item: name, kategori, harga: [], satuan: item.satuan || '-', jumlah: 0 }
      current.harga.push(Number(item.harga_satuan || 0))
      current.jumlah += 1
      if (item.satuan && current.satuan === '-') current.satuan = item.satuan
      grouped.set(key, current)
    })
    const q = benchmarkSearch.trim().toLowerCase()
    return Array.from(grouped.values()).map(row => {
      const sorted = row.harga.filter(Number.isFinite).sort((a, b) => a - b)
      const avg = sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0
      const median = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : sorted.length ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2 : 0
      const reference = benchmarks.find(b => normalizeItemName(b.nama_item) === row.nama_item && itemCategory(b.kategori, b.nama_item) === row.kategori && String(b.satuan || '-') === String(row.satuan || '-'))
      return { ...row, min: sorted[0] || 0, max: sorted[sorted.length - 1] || 0, avg, median, reference }
    }).filter(row => !q || (row.nama_item + ' ' + row.kategori).toLowerCase().includes(q)).sort((a, b) => a.nama_item.localeCompare(b.nama_item, 'id'))
  }, [items, benchmarks, benchmarkSearch])
  const resetBenchmarkForm = () => {
    setEditingBenchmark(null)
    setBenchmarkForm({ id: null, nama_item: '', kategori: 'SPAREPART', satuan: 'pcs', harga_patokan: '', berlaku_mulai: new Date().toISOString().slice(0, 10), keterangan: '' })
  }
  const saveBenchmark = async event => {
    event.preventDefault(); clearMessages()
    const nama = normalizeItemName(benchmarkForm.nama_item)
    const harga = Number(benchmarkForm.harga_patokan)
    if (!nama || !Number.isFinite(harga) || harga < 0) return setError('Nama item dan harga patokan wajib diisi dengan benar.')
    setSaving(true)
    try {
      const payload = { nama_item: nama, kategori: benchmarkForm.kategori, satuan: clean(benchmarkForm.satuan) || null, harga_patokan: harga, berlaku_mulai: benchmarkForm.berlaku_mulai || new Date().toISOString().slice(0, 10), aktif: true, keterangan: clean(benchmarkForm.keterangan) || null, updated_at: new Date().toISOString() }
      const result = editingBenchmark
        ? await supabase.from('patokan_harga_service').update(payload).eq('id', editingBenchmark.id).select('*').single()
        : await supabase.from('patokan_harga_service').insert({ ...payload, dibuat_oleh: profile?.id || null }).select('*').single()
      if (result.error) throw result.error
      setBenchmarks(current => {
        const next = editingBenchmark ? current.map(row => row.id === result.data.id ? result.data : row) : [...current, result.data]
        return next.sort((a, b) => String(a.nama_item || '').localeCompare(String(b.nama_item || ''), 'id'))
      })
      resetBenchmarkForm()
      setSuccess(editingBenchmark ? 'Patokan harga diperbarui.' : 'Patokan harga ditambahkan.')
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }
  const editBenchmark = row => {
    setEditingBenchmark(row)
    setBenchmarkForm({ id: row.id, nama_item: row.nama_item, kategori: row.kategori || 'SPAREPART', satuan: row.satuan || '', harga_patokan: row.harga_patokan, berlaku_mulai: row.berlaku_mulai || '', keterangan: row.keterangan || '' })
  }
  const deleteBenchmark = async row => {
    if (!['ADMIN', 'TRANSPORT'].includes(profile?.role)) return
    if (!window.confirm('Hapus patokan harga ' + row.nama_item + '?')) return
    setSaving(true)
    try {
      const result = await supabase.from('patokan_harga_service').delete().eq('id', row.id)
      if (result.error) throw result.error
      setBenchmarks(current => current.filter(item => item.id !== row.id))
      setSuccess('Patokan harga dihapus.')
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }
  const filteredRequests = useMemo(() => {
    const q = search.trim().toLowerCase()
    return requests.filter(r => {
      const v = vehicleMap[r.kendaraan_id]
      const hay = [r.nomor_pengajuan, r.keluhan, v?.nomor_polisi, v?.kode_kendaraan, v?.merk, v?.tipe].filter(Boolean).join(' ').toLowerCase()
      return (!q || hay.includes(q)) && (statusFilter === 'SEMUA' || r.status === statusFilter) && (vehicleFilter === 'SEMUA' || String(r.kendaraan_id) === String(vehicleFilter))
    })
  }, [requests, vehicleMap, search, statusFilter, vehicleFilter])

  const openCreate = () => { setForm({ ...EMPTY }); setShowForm(true); setDetail(null); setError(''); setSuccess('') }
  const openEdit = request => { setForm({ id: request.id, kendaraan_id: String(request.kendaraan_id), jenis_permintaan: request.jenis_permintaan || 'SERVICE', kilometer: request.kilometer_pengajuan ?? '', keluhan: request.keluhan || '', prioritas: request.prioritas || 'NORMAL' }); setShowForm(true); setDetail(null); setError(''); setSuccess('') }
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
    const payload = { kendaraan_id: Number(form.kendaraan_id), kilometer_pengajuan: km, jenis_permintaan: form.jenis_permintaan, keluhan: form.keluhan.trim(), prioritas: form.prioritas }
    const result = form.id
      ? await supabase.from('permintaan_service').update(payload).eq('id', form.id).select('*').single()
      : await supabase.from('permintaan_service').insert({ ...payload, pemohon_id: profile.id, tanggal_pengajuan: new Date().toISOString().slice(0, 10), status: 'MENUNGGU_TRANSPORT' }).select('*').single()
    if (result.error) setError(`Gagal menyimpan data service: ${result.error.message}`)
    else { setRequests(current => form.id ? current.map(row => row.id === form.id ? result.data : row) : [result.data, ...current]); setShowForm(false); setSuccess(form.id ? 'Pengajuan service diperbarui.' : `Pengajuan ${result.data?.nomor_pengajuan || ''} berhasil dibuat.`) }
    setSaving(false)
  }

  const canDeleteRequest = request => TERMINAL.includes(request.status)
  const deleteOne = async request => {
    if (!canDelete || !canDeleteRequest(request)) { setError('Hanya pengajuan yang sudah terminal yang dapat dihapus oleh Administrator.'); return false }
    const serviceCheck = await supabase.from('service').select('id', { count: 'exact', head: true }).eq('permintaan_service_id', request.id)
    if (serviceCheck.error) { setError(`Gagal memeriksa histori service: ${serviceCheck.error.message}`); return false }
    if (serviceCheck.count) { setError(`Pengajuan ${request.nomor_pengajuan || request.id} memiliki histori service dan tidak boleh dihapus.`); return false }
    const result = await supabase.from('permintaan_service').delete().eq('id', request.id)
    if (result.error) { setError(result.error.message); return false }
    setRequests(current => current.filter(row => row.id !== request.id))
    return true
  }

  const selectedForDelete = async () => {
    for (const request of requests.filter(row => selectedIds.includes(row.id))) await deleteOne(request)
    setSelectedIds([]); setSelectionMode(false)
  }

  const clearPress = () => { if (pressRef.current?.timer) window.clearTimeout(pressRef.current.timer); pressRef.current = null }
  const beginLongPress = (event, id) => {
    if (!canDelete || selectionMode || (event.button !== undefined && event.button !== 0) || event.target?.closest?.('button,input,select,textarea,a')) return
    clearPress()
    pressRef.current = { x: event.clientX, y: event.clientY, timer: window.setTimeout(() => { setSelectionMode(true); setSelectedIds(current => current.includes(id) ? current : [...current, id]); ignoreClickRef.current = true; pressRef.current = null }, 480) }
  }
  const moveLongPress = event => { const state = pressRef.current; if (state && Math.hypot(event.clientX - state.x, event.clientY - state.y) > 10) clearPress() }

  const summaryStats = [
    ['Kendaraan dipantau', summaryRows.filter(r => r.totalTransaksi > 0).length, 'Memiliki histori service'],
    ['Total transaksi service', services.length, 'Semua service tersimpan'],
    ['Total pengeluaran', money(totalSummaryExpense), 'Service + ban + aki'],
    ['Melewati harga perolehan', overPriceCount, 'Flag data untuk review']
  ]

  return <div className="request-page">
    <div className="request-header"><div><span className="eyebrow">TRANSPORT • DATA SERVICE</span><h2>Data Service</h2><p>Cari kendaraan seperti katalog berdasarkan nomor polisi, merk, dan type. Dari sini admin dapat melihat histori, biaya, KM, pengajuan, serta membuat surat pengantar service.</p></div>{canCreate && <button className="request-primary-button" onClick={openCreate}>+ Buat Pengajuan Service</button>}</div>
    {success && <div className="request-alert success">{success}</div>}{error && !showForm && <div className="request-alert error">{error}</div>}

    <section className="request-summary-grid service-kpi-grid">{summaryStats.map(([label, value, note]) => <div key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>)}</section>

    <div className="request-toolbar service-view-toolbar">
      <div className="request-view-toggle"><button className={viewMode === 'ringkasan' ? 'request-light-button active' : 'request-light-button'} onClick={() => setViewMode('ringkasan')}>Ringkasan Kendaraan</button><button className={viewMode === 'pengajuan' ? 'request-light-button active' : 'request-light-button'} onClick={() => setViewMode('pengajuan')}>Pengajuan Service</button><button className={viewMode === 'harga' ? 'request-light-button active' : 'request-light-button'} onClick={() => setViewMode('harga')}>Patokan Harga</button></div>
    </div>

    {viewMode === 'ringkasan' && <section className="request-panel">
      <div className="request-toolbar"><input value={summarySearch} onChange={e => setSummarySearch(e.target.value)} placeholder="Cari BM, nomor polisi, merk, type, pemilik..." /><select value={brandFilter} onChange={e => setBrandFilter(e.target.value)}><option value="SEMUA">Semua merk</option>{brands.map(brand => <option key={brand} value={brand}>{brand}</option>)}</select><select value={summaryOwnership} onChange={e => setSummaryOwnership(e.target.value)}><option value="SEMUA">Semua kepemilikan</option><option value="ASET">Aset</option><option value="SEWA">Sewa</option></select><button className="request-light-button" onClick={loadData} disabled={loading}>↻ Refresh</button></div>
      <div className="request-table-wrap service-summary-table-wrap"><table className="request-table service-summary-table"><thead><tr><th>No Polisi</th><th>Kendaraan</th><th>Service</th><th>Jasa</th><th>Sparepart</th><th>Total Jasa</th><th>Total Sparepart</th><th>Total Pengeluaran</th><th>Harga Perolehan</th><th>KM/Jarak</th><th>Service Terakhir</th><th>Sparepart Terakhir</th><th>Patokan</th><th>Aksi</th></tr></thead><tbody>{summaryFiltered.length ? summaryFiltered.map(row => <tr key={row.vehicle.id}><td><strong>{row.vehicle.nomor_polisi}</strong></td><td><strong>{row.vehicle.merk}</strong><small>{row.vehicle.tipe || '-'} • {row.vehicle.jenis_kendaraan || '-'}</small></td><td><strong>{row.totalTransaksi} kali</strong></td><td>{row.jasaKali} kali</td><td>{row.spareKali} kali</td><td>{money(row.totalJasa)}</td><td>{money(row.totalSpare)}</td><td><strong>{money(row.totalPengeluaran)}</strong></td><td>{row.vehiclePrice ? money(row.vehiclePrice) : 'Belum diisi'}</td><td>{number(row.kmAkhir)} km<small>Jarak terpantau: {number(row.jarak)} km</small></td><td>{fmtDate(row.lastJasa)}</td><td>{fmtDate(row.lastSpare)}</td><td><span className={`request-status request-cost-flag ${row.costFlag.toLowerCase()}`}>{row.costFlag === 'MELEWATI_HARGA' ? 'Melewati' : row.costFlag === 'MENDEKATI_HARGA' ? '≥ 80%' : row.costFlag === 'DI_BAWAH_HARGA' ? 'Di bawah' : 'Harga belum diisi'}</span>{row.ratio != null && <small>{(row.ratio * 100).toFixed(1)}% dari harga</small>}</td><td><button className="request-detail-button" onClick={() => setDetail({ type: 'vehicle', row })}>Detail</button></td></tr>) : <tr><td colSpan="14"><div className="request-empty">Belum ada kendaraan yang cocok.</div></td></tr>}</tbody></table></div>
    </section>}

    {viewMode === 'harga' && <section className="request-panel">
      <div className="request-toolbar">
        <input value={benchmarkSearch} onChange={e => setBenchmarkSearch(e.target.value)} placeholder="Cari oli, ban, kaca, jasa, sparepart..." />
        {['ADMIN', 'TRANSPORT'].includes(profile?.role) && <button className="request-light-button" onClick={resetBenchmarkForm}>+ Patokan Harga</button>}
        <span className="request-toolbar-note">{benchmarkRows.length} item historis • {benchmarks.length} patokan admin</span>
      </div>
      {['ADMIN', 'TRANSPORT'].includes(profile?.role) && (benchmarkForm.nama_item || editingBenchmark) && <form className="request-benchmark-form" onSubmit={saveBenchmark}>
        <div className="request-benchmark-grid">
          <label>Nama Item<input value={benchmarkForm.nama_item} onChange={e => setBenchmarkForm({ ...benchmarkForm, nama_item: e.target.value })} placeholder="Contoh: Oli Mesin" /></label>
          <label>Kategori<select value={benchmarkForm.kategori} onChange={e => setBenchmarkForm({ ...benchmarkForm, kategori: e.target.value })}><option>SPAREPART</option><option>JASA</option><option>BAN</option><option>AKI</option><option>OLI</option><option>LAINNYA</option></select></label>
          <label>Satuan<input value={benchmarkForm.satuan} onChange={e => setBenchmarkForm({ ...benchmarkForm, satuan: e.target.value })} placeholder="Pcs / Ltr" /></label>
          <label>Harga Patokan<input type="number" min="0" value={benchmarkForm.harga_patokan} onChange={e => setBenchmarkForm({ ...benchmarkForm, harga_patokan: e.target.value })} /></label>
          <label>Berlaku Mulai<input type="date" value={benchmarkForm.berlaku_mulai} onChange={e => setBenchmarkForm({ ...benchmarkForm, berlaku_mulai: e.target.value })} /></label>
          <label>Keterangan<input value={benchmarkForm.keterangan} onChange={e => setBenchmarkForm({ ...benchmarkForm, keterangan: e.target.value })} placeholder="Sumber/ketentuan harga" /></label>
        </div>
        <div className="request-form-actions"><button type="button" className="request-light-button" onClick={resetBenchmarkForm}>Batal</button><button className="request-primary-button" disabled={saving}>{editingBenchmark ? 'Perbarui Patokan' : 'Simpan Patokan'}</button></div>
      </form>}
      <div className="request-toolbar-note service-benchmark-note">Harga terendah/tertinggi/median berasal dari histori service. Patokan Admin adalah angka referensi internal yang dapat diperbarui.</div>
      <div className="request-table-wrap service-summary-table-wrap"><table className="request-table">
        <thead><tr><th>Item</th><th>Kategori</th><th>Satuan</th><th>Transaksi</th><th>Terendah</th><th>Tertinggi</th><th>Median</th><th>Patokan Admin</th><th>Selisih Rata-rata</th><th>Aksi</th></tr></thead>
        <tbody>{benchmarkRows.length ? benchmarkRows.map(row => {
          const ref = row.reference
          const diff = ref ? Number(row.avg) - Number(ref.harga_patokan) : null
          return <tr key={row.nama_item + '-' + row.kategori + '-' + row.satuan}>
            <td><strong>{row.nama_item}</strong></td>
            <td>{row.kategori}</td>
            <td>{row.satuan || '-'}</td>
            <td>{row.jumlah}</td>
            <td>{money(row.min)}</td>
            <td>{money(row.max)}</td>
            <td>{money(row.median)}</td>
            <td>{ref ? <><b>{money(ref.harga_patokan)}</b><small>{fmtDate(ref.berlaku_mulai)}</small></> : <span className="request-toolbar-note">Belum diatur</span>}</td>
            <td>{ref ? <span className={'request-status ' + (Math.abs(diff) > Math.max(1, Number(ref.harga_patokan || 0) * 0.1) ? 'status-warning' : 'status-ok')}>{diff > 0 ? '+' : ''}{money(diff)}</span> : '-'}</td>
            <td className="request-actions">{ref && <button className="request-detail-button" onClick={() => editBenchmark(ref)}>Edit</button>}{ref && <button className="request-detail-button danger" onClick={() => deleteBenchmark(ref)} disabled={saving}>Hapus</button>}</td>
          </tr>
        }) : <tr><td colSpan="10"><div className="request-empty">Belum ada data item service untuk dijadikan patokan.</div></td></tr>}</tbody>
      </table></div>
    </section>}
    {viewMode === 'pengajuan' && <section className="request-panel">
      <div className="request-toolbar"><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nomor pengajuan, BM, merk, type, keluhan..." /><select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="SEMUA">Semua status</option>{Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select><select value={vehicleFilter} onChange={e => setVehicleFilter(e.target.value)}><option value="SEMUA">Semua kendaraan</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.nomor_polisi} — {v.merk}</option>)}</select><button className="request-light-button" onClick={loadData} disabled={loading || saving}>↻ Refresh</button></div>
      {selectionMode && <div className="request-selection-bar"><div className="request-selection-meta"><span>Mode pilih pengajuan</span><strong>{selectedIds.length} dipilih</strong></div><div className="request-selection-actions"><button className="ghost" onClick={() => setSelectedIds(summary => summary.length ? [] : filteredRequests.map(r => r.id))}>{selectedIds.length ? 'Batalkan semua' : 'Pilih semua'}</button><button className="ghost" onClick={() => { setSelectedIds([]); setSelectionMode(false) }}>Batal</button>{canDelete && <button className="danger" onClick={selectedForDelete} disabled={saving || !selectedIds.length}>Hapus {selectedIds.length} Pengajuan</button>}</div></div>}
      {!selectionMode && filteredRequests.length > 0 && <p className="request-selection-hint">Tekan dan tahan satu baris sekitar setengah detik untuk memilih banyak pengajuan.</p>}
      <div className="request-table-wrap"><table className="request-table"><thead><tr>{selectionMode && <th className="request-select-cell"><input type="checkbox" aria-label="Pilih semua pengajuan" checked={selectedIds.length === filteredRequests.length && filteredRequests.length > 0} onChange={() => setSelectedIds(current => current.length ? [] : filteredRequests.map(r => r.id))}/></th>}<th>Pengajuan</th><th>Kendaraan</th><th>Kebutuhan</th><th>KM</th><th>Prioritas</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{filteredRequests.map(r => { const v = vehicleMap[r.kendaraan_id]; const selected = selectedIds.includes(r.id); const editableRow = canEditRequest && !TERMINAL.includes(r.status); return <tr key={r.id} className={selected ? 'request-selected' : ''} onPointerDown={e => beginLongPress(e, r.id)} onPointerMove={moveLongPress} onPointerUp={clearPress} onPointerCancel={clearPress}>{selectionMode && <td className="request-select-cell"><input type="checkbox" checked={selected} onChange={() => setSelectedIds(current => current.includes(r.id) ? current.filter(x => x !== r.id) : [...current, r.id])}/></td>}<td><strong>{r.nomor_pengajuan || `#${r.id}`}</strong><small>{fmtDate(r.tanggal_pengajuan)}</small></td><td><strong>{v?.nomor_polisi || '-'}</strong><small>{v ? `${v.merk} • ${v.tipe || '-'}` : 'Data kendaraan tidak ditemukan'}</small></td><td><strong>{TYPE_LABELS[r.jenis_permintaan] || r.jenis_permintaan}</strong><small>{r.keluhan}</small></td><td>{number(r.kilometer_pengajuan)} km</td><td><span className={`request-priority priority-${String(r.prioritas || 'NORMAL').toLowerCase()}`}>{r.prioritas === 'MENDESAK' ? 'Mendesak' : 'Normal'}</span></td><td><span className={`request-status status-${String(r.status || '').toLowerCase()}`}>{STATUS_LABELS[r.status] || r.status}</span></td><td className="request-actions">{<button className="request-detail-button" onClick={() => setDetail({ type: 'request', request: r })}>Detail</button>}{editableRow && <button className="request-detail-button" onClick={() => openEdit(r)}>Edit</button>}<button className="request-detail-button" onClick={() => setPrintRequest(r)}>Surat</button>{canDelete && TERMINAL.includes(r.status) && <button className="request-detail-button danger" onClick={() => window.confirm(`Hapus pengajuan ${r.nomor_pengajuan || r.id}?`) && deleteOne(r)}>Hapus</button>}</td></tr>})}</tbody></table></div>
      <div className="request-footer">Menampilkan {filteredRequests.length} dari {requests.length} pengajuan</div>
    </section>}

    {showForm && <div className="request-modal-backdrop"><section className="request-modal" role="dialog" aria-modal="true"><div className="request-modal-header"><div><span className="eyebrow">DATA SERVICE</span><h3>{form.id ? 'Edit Pengajuan Service' : 'Buat Pengajuan Service'}</h3></div><button type="button" className="request-close-button" onClick={() => !saving && setShowForm(false)}>×</button></div>{error && <div className="request-alert error">{error}</div>}<form onSubmit={submit}><div className="request-form-grid"><div className="request-field full"><label>Kendaraan*</label><select value={form.kendaraan_id} onChange={e => updateForm('kendaraan_id', e.target.value)} disabled={saving}><option value="">Pilih kendaraan...</option>{vehicles.filter(v => v.status !== 'TIDAK_AKTIF').map(v => <option key={v.id} value={v.id}>{v.nomor_polisi} — {v.merk} {v.tipe || ''}</option>)}</select></div><div className="request-field"><label>Jenis Kebutuhan*</label><select value={form.jenis_permintaan} onChange={e => updateForm('jenis_permintaan', e.target.value)} disabled={saving}>{Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div><div className="request-field"><label>KM Saat Pengajuan*</label><input type="number" min="0" step="1" value={form.kilometer} onChange={e => updateForm('kilometer', e.target.value)} disabled={saving}/></div><div className="request-field full"><label>Prioritas</label><select value={form.prioritas} onChange={e => updateForm('prioritas', e.target.value)} disabled={saving}><option value="NORMAL">Normal</option><option value="MENDESAK">Mendesak</option></select></div><div className="request-field full"><label>Keluhan / Pekerjaan yang Diminta*</label><textarea rows="5" value={form.keluhan} onChange={e => updateForm('keluhan', e.target.value)} disabled={saving} placeholder="Contoh: Perbaiki kaca depan, ganti oli, cek rem, atau ganti ban." /></div></div><div className="request-form-actions"><button className="request-light-button" type="button" onClick={() => setShowForm(false)} disabled={saving}>Batal</button><button className="request-primary-button" type="submit" disabled={saving}>{saving ? 'Menyimpan...' : form.id ? 'Perbarui Pengajuan' : 'Kirim Pengajuan'}</button></div></form></section></div>}

    {detail?.type === 'request' && <div className="request-modal-backdrop"><section className="request-modal request-detail-modal" role="dialog" aria-modal="true"><div className="request-modal-header"><div><span className="eyebrow">DETAIL DATA SERVICE</span><h3>{detail.request.nomor_pengajuan || `Pengajuan #${detail.request.id}`}</h3></div><button type="button" className="request-close-button" onClick={() => setDetail(null)}>×</button></div><div className="request-detail-grid"><div><span>Status</span><strong>{STATUS_LABELS[detail.request.status] || detail.request.status}</strong></div><div><span>Tanggal</span><strong>{fmtDate(detail.request.tanggal_pengajuan)}</strong></div><div><span>Kendaraan</span><strong>{vehicleMap[detail.request.kendaraan_id]?.nomor_polisi || '-'}</strong></div><div><span>KM</span><strong>{number(detail.request.kilometer_pengajuan)} km</strong></div><div><span>Jenis</span><strong>{TYPE_LABELS[detail.request.jenis_permintaan] || detail.request.jenis_permintaan}</strong></div><div><span>Prioritas</span><strong>{detail.request.prioritas === 'MENDESAK' ? 'Mendesak' : 'Normal'}</strong></div><div className="full"><span>Keluhan / Pekerjaan</span><p>{detail.request.keluhan}</p></div><div className="full"><span>Catatan Transport</span><p>{detail.request.catatan_transport || 'Belum ada catatan.'}</p></div></div><div className="request-form-actions"><button className="request-light-button" onClick={() => setDetail(null)}>Tutup</button><button className="request-primary-button" onClick={() => setPrintRequest(detail.request)}>Cetak Surat</button></div></section></div>}

    {detail?.type === 'vehicle' && <div className="request-modal-backdrop"><section className="request-modal request-detail-modal" role="dialog" aria-modal="true"><div className="request-modal-header"><div><span className="eyebrow">KATALOG KENDARAAN</span><h3>{detail.row.vehicle.nomor_polisi}</h3></div><button type="button" className="request-close-button" onClick={() => setDetail(null)}>×</button></div><div className="request-detail-grid"><div><span>Merk / Type</span><strong>{detail.row.vehicle.merk} {detail.row.vehicle.tipe || ''}</strong></div><div><span>Total Service</span><strong>{detail.row.totalTransaksi} kali</strong></div><div><span>Jasa</span><strong>{detail.row.jasaKali} kali • {money(detail.row.totalJasa)}</strong></div><div><span>Sparepart</span><strong>{detail.row.spareKali} kali • {money(detail.row.totalSpare)}</strong></div><div><span>Total Pengeluaran</span><strong>{money(detail.row.totalPengeluaran)}</strong></div><div><span>Harga Perolehan</span><strong>{detail.row.vehiclePrice ? money(detail.row.vehiclePrice) : 'Belum diisi'}</strong></div><div><span>Status Perbandingan</span><strong>{detail.row.costFlag === 'MELEWATI_HARGA' ? 'Pengeluaran tercatat sudah melewati harga perolehan; perlu evaluasi kelayakan kendaraan.' : detail.row.costFlag === 'MENDEKATI_HARGA' ? 'Pengeluaran tercatat sudah mencapai minimal 80% harga perolehan; perlu dipantau.' : 'Belum melewati harga perolehan.'}</strong></div><div><span>KM Awal Terpantau</span><strong>{number(detail.row.kmAwal)} km</strong></div><div><span>KM Akhir</span><strong>{number(detail.row.kmAkhir)} km</strong></div><div className="full"><span>Jarak Terpantau</span><strong>{number(detail.row.jarak)} km</strong></div><div className="full"><span>Histori Service per Mobil</span><div className="request-table-wrap"><table className="request-table"><thead><tr><th>Tanggal</th><th>KM</th><th>Jenis</th><th>Bengkel</th><th>Uraian</th><th>Total</th></tr></thead><tbody>{detail.row.serviceHistory.length ? detail.row.serviceHistory.map(h => <tr key={h.id}><td>{fmtDate(h.tanggal)}</td><td>{number(h.kilometer)} km</td><td>{h.jenisLabel}</td><td>{h.bengkel || '-'}</td><td>{h.items.length ? h.items.map(item => item.nama_item).join(' • ') : h.keluhan}</td><td>{money(h.total)}</td></tr>) : <tr><td colSpan="6">Belum ada histori service.</td></tr>}</tbody></table></div></div><div><span>Service/Jasa Terakhir</span><strong>{fmtDate(detail.row.lastJasa)}</strong></div><div><span>Sparepart Terakhir</span><strong>{fmtDate(detail.row.lastSpare)}</strong></div></div><div className="request-form-actions"><button className="request-light-button" onClick={() => setDetail(null)}>Tutup</button><button className="request-primary-button" onClick={() => { setViewMode('pengajuan'); setDetail(null); openCreate() }}>+ Buat Pengajuan</button></div></section></div>}

    {printRequest && <div className="request-modal-backdrop request-print-modal"><section className="request-print-sheet"><div className="request-print-header"><div><strong>PT ZAMAN TEKNINDO</strong><span>SURAT PENGANTAR SERVICE / PERBAIKAN</span></div><div className="request-print-meta"><span>No. Pengajuan: {printRequest.nomor_pengajuan || `#${printRequest.id}`}</span><span>Tanggal: {fmtDate(printRequest.tanggal_pengajuan)}</span></div></div><div className="request-print-grid"><div><span>Nomor Polisi</span><strong>{vehicleMap[printRequest.kendaraan_id]?.nomor_polisi || '-'}</strong></div><div><span>Merk / Type</span><strong>{vehicleMap[printRequest.kendaraan_id]?.merk || '-'} {vehicleMap[printRequest.kendaraan_id]?.tipe || ''}</strong></div><div><span>KM</span><strong>{number(printRequest.kilometer_pengajuan)} km</strong></div><div><span>Jenis</span><strong>{TYPE_LABELS[printRequest.jenis_permintaan] || printRequest.jenis_permintaan}</strong></div><div><span>Prioritas</span><strong>{printRequest.prioritas === 'MENDESAK' ? 'Mendesak' : 'Normal'}</strong></div><div className="full"><span>Uraian pekerjaan / keluhan</span><p>{printRequest.keluhan}</p></div></div><div className="request-print-checklist"><strong>Ruang pekerjaan yang diminta</strong><p>☐ Pemeriksaan awal &nbsp;&nbsp; ☐ Estimasi biaya &nbsp;&nbsp; ☐ Jasa/perbaikan &nbsp;&nbsp; ☐ Sparepart &nbsp;&nbsp; ☐ Dokumentasi sebelum/sesudah</p></div><div className="request-print-sign"><div>Pengaju / Pemohon</div><div>Transport</div><div>Atasan / Approval</div></div><div className="request-print-actions no-print"><button className="request-light-button" onClick={() => setPrintRequest(null)}>Tutup</button><button className="request-primary-button" onClick={() => window.print()}>Cetak / Print</button></div></section></div>}
  </div>
}
