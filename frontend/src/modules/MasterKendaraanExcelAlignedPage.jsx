import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { humanizeError } from '../utils/feedback.js'
import './MasterKendaraanExcelAlignedPage.css'
import PageBreadcrumb from './PageBreadcrumb.jsx'
import { formatDateSafe } from '../utils/dateSafe'
import { IMAGE_UPLOAD_ACCEPT, validateStorageUploadFile } from '../utils/storageUpload.js'
import { analyzeVehicleIntegrity } from '../utils/vehicleIntegrity.js'
import { inferRentalTypeFromOwner } from '../utils/vehicleOwnership.js'
import { getVehicleTableState, matchesVehicleSearch, retainVisibleVehicleSelection } from '../utils/vehicleSearch.js'

const OWNERSHIP = { ASET: 'Aset', SEWA: 'Sewa' }
const VEHICLE_TYPES = ['Pickup', 'Minibus', 'Dump Truck']
const PHOTO_ITEMS = [
  { key: 'depan', label: 'Foto Sisi Depan', field: 'foto_depan_path', folder: 'foto-depan' },
  { key: 'belakang', label: 'Foto Sisi Belakang', field: 'foto_belakang_path', folder: 'foto-belakang' },
  { key: 'kiri', label: 'Foto Sisi Kiri', field: 'foto_kiri_path', folder: 'foto-kiri' },
  { key: 'kanan', label: 'Foto Sisi Kanan', field: 'foto_kanan_path', folder: 'foto-kanan' },
  { key: 'stnk', label: 'Foto STNK', field: 'foto_stnk_path', folder: 'foto-stnk' },
]
const LEGACY_PHOTO_FIELDS = PHOTO_ITEMS.filter(photo => photo.key !== 'stnk').map(photo => photo.field)
const EMPTY = {
  nomor_polisi: '', merk: '', tipe: '', jenis_kendaraan: 'Pickup', tahun: '', nomor_mesin: '', nomor_rangka: '',
  pemilik: '', kepemilikan: 'ASET', jenis_sewa: '', harga_perolehan: '', masa_berlaku_pajak: '', status_pajak: '', unit_kerja: '', driver_id: '', lokasi: '',
  keterangan: '', catatan_hutang: '', status: 'ACTIVE', kode_kendaraan: '',
}

const clean = value => String(value ?? '').trim()
const normalizeRentalType = value => { const v = clean(value).toUpperCase().replace(/\s+/g, '_'); if (v === 'SEWA_PERUSAHAAN' || v === 'PERUSAHAAN') return 'SEWA_PERUSAHAAN'; if (v === 'SEWA_PERORANGAN' || v === 'PERORANGAN') return 'SEWA_PERORANGAN'; return '' }
const rentalTypeLabel = value => value === 'SEWA_PERORANGAN' ? 'Sewa Perorangan' : value === 'SEWA_PERUSAHAAN' ? 'Sewa Perusahaan' : 'Belum ditentukan'
const rentalTypeForVehicle = vehicle => normalizeRentalType(vehicle?.jenis_sewa) || inferRentalTypeFromOwner(vehicle?.pemilik)
const normalizeOwnership = value => {
  const v = clean(value).toUpperCase().replace(/\s+/g, '_')
  if (v === 'ASET' || v === 'ASET_KANTOR') return 'ASET'
  if (v === 'SEWA' || v === 'RENTAL' || v === 'KENDARAAN_SEWA') return 'SEWA'
  return ''
}
const formatDate = value => formatDateSafe(value)
const isInteractive = target => Boolean(target?.closest?.('button,input,select,textarea,a'))
async function loadVehiclePhotoUrls(vehicle) {
  const pairs = await Promise.all(PHOTO_ITEMS.map(async photo => {
    const path = vehicle?.[photo.field]
    if (!path) return null
    const { data, error } = await supabase.storage.from('kendaraan').createSignedUrl(path, 3600)
    if (error || !data?.signedUrl) {
      if (error) console.warn(`Foto kendaraan ${photo.label} tidak dapat dibuka:`, error.message)
      return null
    }
    return [photo.key, data.signedUrl]
  }))
  return Object.fromEntries(pairs.filter(Boolean))
}

export default function MasterKendaraanExcelAlignedPage({ profile, onNavigate }) {
  const canEdit = ['ADMIN', 'TRANSPORT'].includes(profile?.role)
  const canPhoto = profile?.role === 'ADMIN'
  const canDelete = profile?.role === 'ADMIN'
  const [vehicles, setVehicles] = useState([])
  const [drivers, setDrivers] = useState([])
  const [loading, setLoading] = useState(true)
  const rowClickTimer = useRef(null)
  const detailPhotoRequest = useRef(0)
  const editPhotoRequest = useRef(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [vehicleLoadError, setVehicleLoadError] = useState('')
  const [success, setSuccess] = useState('')
  const [query, setQuery] = useState('')
  const [ownershipFilter, setOwnershipFilter] = useState('SEMUA')
  const [typeFilter, setTypeFilter] = useState('SEMUA')
  const [integrityFilter, setIntegrityFilter] = useState(false)
  const [modal, setModal] = useState(false)
  const [detail, setDetail] = useState(null)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ ...EMPTY })
  const [photoFiles, setPhotoFiles] = useState({})
  const [photoUrls, setPhotoUrls] = useState({})
  const [photoLoading, setPhotoLoading] = useState(false)
  const [photoLoadError, setPhotoLoadError] = useState('')
  const [detailPhotoUrls, setDetailPhotoUrls] = useState({})
  const [detailPhotoLoading, setDetailPhotoLoading] = useState(false)
  const [selected, setSelected] = useState([])
  const [selectionMode, setSelectionMode] = useState(false)
  const [activeRowId, setActiveRowId] = useState(null)
  const topScrollRef = useRef(null)
  const topScrollInnerRef = useRef(null)
  const tableWrapRef = useRef(null)

  const syncTableScrollFromTop = () => {
    const rail = topScrollRef.current
    const wrap = tableWrapRef.current
    if (rail && wrap && Math.abs(wrap.scrollLeft - rail.scrollLeft) > 1) wrap.scrollLeft = rail.scrollLeft
  }
  const syncTopScrollFromTable = () => {
    const rail = topScrollRef.current
    const wrap = tableWrapRef.current
    if (rail && wrap && Math.abs(rail.scrollLeft - wrap.scrollLeft) > 1) rail.scrollLeft = wrap.scrollLeft
  }

  const loadData = async () => {
    setLoading(true)
    setError('')
    setVehicleLoadError('')
    const [v, d] = await Promise.all([
      supabase.from('kendaraan').select('id,kode_kendaraan,nomor_polisi,merk,tipe,jenis_kendaraan,tahun,nomor_mesin,nomor_rangka,kepemilikan,jenis_sewa,harga_perolehan,pemilik,driver_id,lokasi,unit_kerja,masa_berlaku_pajak,status_pajak,keterangan,catatan_hutang,status,foto_stnk_path,foto_depan_path,foto_belakang_path,foto_kiri_path,foto_kanan_path').order('nomor_polisi'),
      supabase.from('driver').select('id,nama_lengkap,status').order('nama_lengkap'),
    ])
    if (v.error) { const message = `Data kendaraan: ${humanizeError(v.error)}`; setError(message); setVehicleLoadError(message) } else setVehicles((v.data || []).map(row => ({ ...row, kepemilikan: normalizeOwnership(row.kepemilikan) })))
    if (d.error) setError(prev => prev || `Data driver: ${humanizeError(d.error)}`); else setDrivers(d.data || [])
    setSelected([])
    setSelectionMode(false)
    setActiveRowId(null)
    setLoading(false)
  }

  useEffect(() => {
    loadData()
    const onImported = event => { if (event.detail?.context === 'kendaraan') loadData() }
    window.addEventListener('transport:data-imported', onImported)
    return () => window.removeEventListener('transport:data-imported', onImported)
  }, [])


  const driverMap = useMemo(() => Object.fromEntries(drivers.map(d => [d.id, d])), [drivers])
  const integrityReport = useMemo(() => analyzeVehicleIntegrity(vehicles), [vehicles])
  const ownerOptions = useMemo(() => Array.from(new Set(vehicles.map(v => clean(v.pemilik)).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'id')), [vehicles])
  const typeOptions = useMemo(() => Array.from(new Set([...VEHICLE_TYPES, ...vehicles.map(v => clean(v.jenis_kendaraan)).filter(Boolean)])), [vehicles])
  const filtered = useMemo(() => {
    const q = clean(query).toLowerCase()
    return vehicles.filter(v => {
      const driver = driverMap[v.driver_id]
      return matchesVehicleSearch(v, driver, q) && (ownershipFilter === 'SEMUA' || v.kepemilikan === ownershipFilter) && (typeFilter === 'SEMUA' || v.jenis_kendaraan === typeFilter) && (!integrityFilter || integrityReport.isFlagged(v))
    })
  }, [vehicles, driverMap, query, ownershipFilter, typeFilter, integrityFilter, integrityReport])
  const vehicleTableState = getVehicleTableState({
    loading,
    hasError: Boolean(vehicleLoadError),
    totalCount: vehicles.length,
    visibleCount: filtered.length,
  })

  useEffect(() => {
    const rail = topScrollRef.current
    const railInner = topScrollInnerRef.current
    const wrap = tableWrapRef.current
    const table = wrap?.querySelector('.mep-table')
    if (!rail || !railInner || !wrap || !table) return undefined

    const updateRailWidth = () => {
      const tableWidth = Math.max(table.scrollWidth, table.getBoundingClientRect().width, wrap.clientWidth)
      railInner.style.width = `${tableWidth}px`
      if (Math.abs(rail.scrollLeft - wrap.scrollLeft) > 1) rail.scrollLeft = wrap.scrollLeft
    }
    updateRailWidth()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(updateRailWidth) : null
    observer?.observe(table)
    observer?.observe(wrap)
    window.addEventListener('resize', updateRailWidth)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', updateRailWidth)
    }
  }, [filtered.length, selectionMode, vehicleTableState])

  const cards = useMemo(() => ({
    total: vehicles.length,
    aset: vehicles.filter(v => normalizeOwnership(v.kepemilikan) === 'ASET').length,
    sewa: vehicles.filter(v => normalizeOwnership(v.kepemilikan) === 'SEWA').length,
    pickup: vehicles.filter(v => clean(v.jenis_kendaraan).toLowerCase() === 'pickup').length,
    minibus: vehicles.filter(v => clean(v.jenis_kendaraan).toLowerCase() === 'minibus').length,
  }), [vehicles])

  const resetModal = () => { editPhotoRequest.current += 1; setEditing(null); setForm({ ...EMPTY }); setPhotoFiles({}); setPhotoUrls({}); setPhotoLoading(false); setPhotoLoadError(''); setModal(false); setError('') }
  const openNew = () => { editPhotoRequest.current += 1; setEditing(null); setForm({ ...EMPTY, kode_kendaraan: `KND-${Date.now()}` }); setPhotoFiles({}); setPhotoUrls({}); setPhotoLoading(false); setPhotoLoadError(''); setError(''); setModal(true) }
  const openEdit = useCallback(async vehicle => {
    const requestId = ++editPhotoRequest.current
    setEditing(vehicle)
    setForm({ ...EMPTY, ...vehicle, kepemilikan: normalizeOwnership(vehicle.kepemilikan), jenis_sewa: normalizeRentalType(vehicle.jenis_sewa), harga_perolehan: vehicle.harga_perolehan ?? '', driver_id: vehicle.driver_id ?? '' })
    setPhotoFiles({})
    setPhotoUrls({})
    setPhotoLoading(true)
    setPhotoLoadError('')
    setError('')
    setModal(true)
    try {
      const urls = await loadVehiclePhotoUrls(vehicle)
      if (requestId === editPhotoRequest.current) setPhotoUrls(urls)
    } catch (photoError) {
      if (requestId === editPhotoRequest.current) setPhotoLoadError(humanizeError(photoError, 'Foto kendaraan tidak dapat dimuat.'))
    } finally {
      if (requestId === editPhotoRequest.current) setPhotoLoading(false)
    }
  }, [])
  useEffect(() => {
    if (loading || !canEdit || !vehicles.length) return
    const focusId = localStorage.getItem('transport_vehicle_focus_id')
    if (!focusId) return
    const vehicle = vehicles.find(row => String(row.id) === String(focusId))
    if (!vehicle) return
    localStorage.removeItem('transport_vehicle_focus_id')
    openEdit(vehicle)
  }, [loading, vehicles, canEdit, openEdit])

  const change = event => {
    const { name, value } = event.target
    setForm(current => ({ ...current, [name]: value,  }))
  }

  const uploadVehiclePhoto = async (vehicleId, photo, file) => {
    if (!file) return null
    const contentType = validateStorageUploadFile(file, { imagesOnly: true })
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${photo.folder}/${vehicleId}/${photo.key}-${Date.now()}-${safe}`
    const { error: uploadError } = await supabase.storage.from('kendaraan').upload(path, file, { upsert: false, contentType })
    if (uploadError) throw uploadError
    return path
  }

  const saveVehicle = async event => {
    event.preventDefault()
    if (!canEdit || saving) return
    setSaving(true); setError(''); setSuccess('')
    const uploadedPaths = []
    const pendingPhotos = canPhoto ? PHOTO_ITEMS.filter(photo => photoFiles[photo.key]) : []
    let latestVehicle = null
    let createdVehicleId = null
    let photoPathsCommitted = false
    try {
      const ownership = normalizeOwnership(form.kepemilikan)
      const owner = clean(form.pemilik)
      if (!clean(form.nomor_polisi) || !clean(form.merk) || !clean(form.jenis_kendaraan)) throw new Error('Nomor polisi, merk, dan jenis kendaraan wajib diisi.')
      if (!VEHICLE_TYPES.includes(form.jenis_kendaraan) && !typeOptions.includes(form.jenis_kendaraan)) throw new Error('Jenis kendaraan harus mengikuti data Excel.')
      if (!ownership) throw new Error('Kepemilikan hanya boleh Aset atau Sewa.')
      if (ownership === 'SEWA' && !owner) throw new Error('Identitas pemilik wajib diisi untuk kendaraan sewa.')
      const rentalType = ownership === 'SEWA' ? normalizeRentalType(form.jenis_sewa) : null
      const acquisitionPrice = clean(form.harga_perolehan) === '' ? null : Number(form.harga_perolehan)
      if (acquisitionPrice !== null && (!Number.isFinite(acquisitionPrice) || acquisitionPrice < 0)) throw new Error('Harga perolehan kendaraan tidak valid.')
      if (ownership === 'SEWA' && !['SEWA_PERORANGAN', 'SEWA_PERUSAHAAN'].includes(rentalType)) throw new Error('Jenis sewa wajib dipilih: Sewa Perorangan atau Sewa Perusahaan.')
      const payload = {
        kode_kendaraan: clean(form.kode_kendaraan) || `KND-${Date.now()}`,
        nomor_polisi: clean(form.nomor_polisi).toUpperCase(), merk: clean(form.merk), tipe: clean(form.tipe) || null,
        jenis_kendaraan: clean(form.jenis_kendaraan) || null, tahun: form.tahun === '' ? null : Number(form.tahun),
        nomor_mesin: clean(form.nomor_mesin) || null, nomor_rangka: clean(form.nomor_rangka) || null,
        kepemilikan: ownership, jenis_sewa: ownership === 'SEWA' ? rentalType : null, harga_perolehan: acquisitionPrice, pemilik: owner || null,
        driver_id: form.driver_id === '' ? null : Number(form.driver_id), lokasi: clean(form.lokasi) || null, unit_kerja: clean(form.unit_kerja) || null,
        masa_berlaku_pajak: form.masa_berlaku_pajak || null, status_pajak: clean(form.status_pajak) || null,
        keterangan: clean(form.keterangan) || null, catatan_hutang: clean(form.catatan_hutang) || null,
        status: editing?.status || 'ACTIVE',
      }

      // For existing vehicles upload first; DB metadata changes only after all selected photos upload.
      const photoUpdates = {}
      if (editing && pendingPhotos.length) {
        for (const photo of pendingPhotos) {
          const uploadedPath = await uploadVehiclePhoto(editing.id, photo, photoFiles[photo.key])
          uploadedPaths.push(uploadedPath)
          photoUpdates[photo.field] = uploadedPath
        }
      }

      const result = editing
        ? await supabase.from('kendaraan').update({ ...payload, ...photoUpdates }).eq('id', editing.id).select().single()
        : await supabase.from('kendaraan').insert(payload).select().single()
      if (result.error) throw result.error
      latestVehicle = { ...result.data, kepemilikan: normalizeOwnership(result.data.kepemilikan) }

      if (editing) {
        photoPathsCommitted = true
      } else {
        createdVehicleId = latestVehicle.id
        if (pendingPhotos.length) {
          for (const photo of pendingPhotos) {
            const uploadedPath = await uploadVehiclePhoto(latestVehicle.id, photo, photoFiles[photo.key])
            uploadedPaths.push(uploadedPath)
            photoUpdates[photo.field] = uploadedPath
          }
          const photoResult = await supabase.from('kendaraan').update(photoUpdates).eq('id', latestVehicle.id).select().single()
          if (photoResult.error) throw photoResult.error
          latestVehicle = { ...latestVehicle, ...photoResult.data }
        }
        photoPathsCommitted = true
      }

      if (editing && pendingPhotos.length) {
        const oldPaths = PHOTO_ITEMS
          .filter(photo => photoUpdates[photo.field] && editing[photo.field])
          .map(photo => editing[photo.field])
        if (oldPaths.length) {
          const { error: cleanupError } = await supabase.storage.from('kendaraan').remove(oldPaths)
          if (cleanupError) console.warn('Foto kendaraan lama gagal dibersihkan:', cleanupError.message)
        }
      }

      setVehicles(current => {
        const next = editing
          ? current.map(item => item.id === latestVehicle.id ? { ...item, ...latestVehicle } : item)
          : [...current, latestVehicle]
        return next.sort((a, b) => String(a.nomor_polisi || '').localeCompare(String(b.nomor_polisi || ''), 'id'))
      })
      setSuccess(editing ? 'Data kendaraan diperbarui.' : 'Kendaraan baru berhasil ditambahkan.')
      resetModal()
    } catch (saveError) {
      if (uploadedPaths.length && !photoPathsCommitted) {
        const { error: cleanupError } = await supabase.storage.from('kendaraan').remove(uploadedPaths)
        if (cleanupError) console.warn('Foto baru gagal dibersihkan setelah proses simpan gagal:', cleanupError.message)
      }
      if (createdVehicleId && !photoPathsCommitted) {
        const { error: rollbackError } = await supabase.from('kendaraan').delete().eq('id', createdVehicleId)
        if (rollbackError) console.error('Kendaraan baru gagal di-rollback setelah unggah foto:', rollbackError.message)
      }
      setError(humanizeError(saveError, 'Gagal menyimpan kendaraan.'))
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
    if (deleteError) { setError(humanizeError(deleteError)); return false }
    const photoPaths = [
      vehicle.foto_stnk_path,
      ...LEGACY_PHOTO_FIELDS.map(field => vehicle[field]),
    ].filter(Boolean)
    if (photoPaths.length) {
      const { error: photoDeleteError } = await supabase.storage.from('kendaraan').remove(photoPaths)
      if (photoDeleteError) console.warn('Foto kendaraan gagal dibersihkan dari Storage:', photoDeleteError.message)
    }
    setVehicles(current => current.filter(row => row.id !== vehicle.id))
    return true
  }

  const enterSelectionMode = id => {
    if (selectionMode) return
    setSelectionMode(true)
    setActiveRowId(null)
    setSelected(current => current.includes(id) ? current : [...current, id])
  }
  const toggleSelected = id => setSelected(current => current.includes(id) ? current.filter(x => x !== id) : [...current, id])
  useEffect(() => () => window.clearTimeout(rowClickTimer.current), [])
  useEffect(() => {
    if (!selectionMode) return
    setSelected(current => retainVisibleVehicleSelection(current, filtered))
  }, [filtered, selectionMode])
  useEffect(() => {
    if (selectionMode && selected.length === 0) {
      setSelectionMode(false)
      setActiveRowId(null)
    }
  }, [selectionMode, selected.length])

  useEffect(() => {
    if (activeRowId !== null && !filtered.some(vehicle => vehicle.id === activeRowId)) {
      setActiveRowId(null)
    }
  }, [activeRowId, filtered])
  const allSelected = filtered.length > 0 && filtered.every(v => selected.includes(v.id))
  const applySummaryFilter = (ownership, type) => {
    setQuery('')
    setOwnershipFilter(ownership)
    setTypeFilter(type)
    setIntegrityFilter(false)
    requestAnimationFrame(() => document.querySelector('.mep-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
  const toggleAll = () => setSelected(current => allSelected ? current.filter(id => !filtered.some(v => v.id === id)) : Array.from(new Set([...current, ...filtered.map(v => v.id)])))
  const exitSelection = () => { setSelectionMode(false); setSelected([]); setActiveRowId(null) }
  const bulkDelete = async () => {
    const visibleSelection = filtered.filter(vehicle => selected.includes(vehicle.id))
    if (!canDelete || !visibleSelection.length || !window.confirm(`Hapus ${visibleSelection.length} kendaraan terpilih?`)) return
    setSaving(true); setError(''); let removed = 0
    for (const vehicle of visibleSelection) if (await deleteOne(vehicle)) removed += 1
    exitSelection(); setSaving(false)
    if (removed) setSuccess(`${removed} kendaraan berhasil dihapus.`)
  }
  const closeDetail = () => {
    detailPhotoRequest.current += 1
    setDetail(null)
    setDetailPhotoUrls({})
    setDetailPhotoLoading(false)
  }

  const openDetail = async vehicle => {
    const requestId = ++detailPhotoRequest.current
    setDetail({ ...vehicle, driver: driverMap[vehicle.driver_id] })
    setDetailPhotoUrls({})
    setDetailPhotoLoading(true)
    try {
      const urls = await loadVehiclePhotoUrls(vehicle)
      if (requestId === detailPhotoRequest.current) setDetailPhotoUrls(urls)
    } catch (photoError) {
      console.warn('Foto detail kendaraan gagal dimuat:', photoError)
    } finally {
      if (requestId === detailPhotoRequest.current) setDetailPhotoLoading(false)
    }
  }

  return <div className="master-excel-page">
    <PageBreadcrumb items={['Transport', 'Kendaraan']} />
    <div className="mep-head mep-page-heading"><div><span className="eyebrow">MASTER DATA</span><h2>Kendaraan</h2><p>Kelola data kendaraan aset dan sewa perusahaan.</p></div>{canEdit && <button className="mep-primary" type="button" onClick={openNew}><span aria-hidden="true">＋</span> Tambah kendaraan</button>}</div>
    {success && <div className="mep-alert success">{success}</div>}{error && !modal && <div className="mep-alert error">{error}</div>}
    {integrityReport.reviewCount > 0 && <div className="mep-integrity-alert mep-integrity-alert-compact" role="status"><span className="mep-integrity-icon" aria-hidden="true">!</span><div className="mep-integrity-copy"><div className="mep-integrity-topline"><b>{integrityReport.reviewCount} kendaraan perlu diperiksa</b>{integrityReport.duplicateIdentityPairCount > 0 && <span className="mep-integrity-count">{integrityReport.duplicateIdentityPairCount} konflik nomor mesin/rangka</span>}</div><span>Data yang bertentangan ditandai untuk diperiksa. Sistem tidak mengubah identitas kendaraan otomatis.</span></div><div className="mep-integrity-actions"><button type="button" onClick={() => { setIntegrityFilter(true); setQuery(''); setOwnershipFilter('SEMUA'); setTypeFilter('SEMUA') }}>Periksa data</button>{integrityFilter && <button type="button" className="secondary" onClick={() => setIntegrityFilter(false)}>Tampilkan semua</button>}</div></div>}
    <div className="mep-cards">
      <button type="button" className="mep-summary-card mep-stat-total" onClick={() => applySummaryFilter('SEMUA', 'SEMUA')} aria-label={`Tampilkan semua kendaraan, total ${cards.total}`}>
        <span className="mep-stat-label">Total kendaraan</span><b>{cards.total}</b><span className="mep-stat-note">Semua data</span><i aria-hidden="true">›</i>
      </button>
      <button type="button" className="mep-summary-card" onClick={() => applySummaryFilter('ASET', 'SEMUA')} aria-label={`Filter kendaraan aset, total ${cards.aset}`}>
        <span className="mep-stat-label">Aset</span><b>{cards.aset}</b><span className="mep-stat-note">Milik perusahaan</span><i aria-hidden="true">›</i>
      </button>
      <button type="button" className="mep-summary-card" onClick={() => applySummaryFilter('SEWA', 'SEMUA')} aria-label={`Filter kendaraan sewa, total ${cards.sewa}`}>
        <span className="mep-stat-label">Sewa</span><b>{cards.sewa}</b><span className="mep-stat-note">Kendaraan sewa</span><i aria-hidden="true">›</i>
      </button>
      <button type="button" className="mep-summary-card" onClick={() => applySummaryFilter('SEMUA', 'Pickup')} aria-label={`Filter kendaraan Pickup, total ${cards.pickup}`}>
        <span className="mep-stat-label">Pickup</span><b>{cards.pickup}</b><span className="mep-stat-note">Jenis kendaraan</span><i aria-hidden="true">›</i>
      </button>
      <button type="button" className="mep-summary-card" onClick={() => applySummaryFilter('SEMUA', 'Minibus')} aria-label={`Filter kendaraan Minibus, total ${cards.minibus}`}>
        <span className="mep-stat-label">Minibus</span><b>{cards.minibus}</b><span className="mep-stat-note">Jenis kendaraan</span><i aria-hidden="true">›</i>
      </button>
    </div>
    <section className="mep-card mep-register-card">
      <div className="mep-register-heading"><div><h3>Daftar kendaraan</h3><p>Cari, filter, dan pilih kendaraan untuk melihat tindakannya.</p></div><span className="mep-result-count">{filtered.length} dari {vehicles.length} kendaraan</span></div>
      <div className="mep-toolbar"><input aria-label="Cari kendaraan" value={query} onChange={e => setQuery(e.target.value)} placeholder="Cari nomor polisi, merk, pemilik, driver, atau lokasi..."/><select aria-label="Filter kepemilikan" value={ownershipFilter} onChange={e => setOwnershipFilter(e.target.value)}><option value="SEMUA">Semua kepemilikan</option><option value="ASET">Aset</option><option value="SEWA">Sewa</option></select><select aria-label="Filter jenis kendaraan" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}><option value="SEMUA">Semua jenis</option>{typeOptions.map(item => <option key={item} value={item}>{item}</option>)}</select><button type="button" className="mep-secondary" onClick={loadData} disabled={loading}>↻ Muat ulang</button></div>
      {selectionMode && <div className="mep-selection"><span><b>{selected.length}</b> kendaraan dipilih</span><div><button type="button" onClick={toggleAll}>{allSelected ? 'Batal pilih semua' : 'Pilih semua'}</button><button type="button" onClick={exitSelection}>Batal</button>{canDelete && <button type="button" className="danger" onClick={bulkDelete} disabled={saving}>Hapus yang dipilih</button>}</div></div>}
      {!selectionMode && filtered.length > 0 && <p className="mep-hint mep-hint-simple">Pilih satu baris untuk membuka aksi. Klik dua kali untuk memilih beberapa kendaraan.</p>}
      {selectionMode && <p className="mep-hint mep-hint-simple">Centang kendaraan yang diperlukan, lalu pilih tindakan. Klik dua kali pada baris untuk keluar dari mode pilih.</p>}
      <div className="mep-table-area"><div className="mep-table-scroll-top-caption"><span>Geser untuk melihat kolom lainnya</span><span aria-hidden="true">← Kiri / kanan →</span></div><div className="mep-table-scroll-top" ref={topScrollRef} onScroll={syncTableScrollFromTop} role="region" aria-label="Scrollbar horizontal tabel kendaraan" tabIndex={0}><div className="mep-table-scroll-top-inner" ref={topScrollInnerRef}/></div><div className="mep-table-wrap" ref={tableWrapRef} onScroll={syncTopScrollFromTable}>{vehicleTableState === 'loading' ? <div className="mep-empty">Memuat data...</div> : vehicleTableState === 'load-error' ? <div className="mep-empty"><b>Data kendaraan belum berhasil dimuat.</b><span>Periksa pesan error di atas lalu coba Refresh. Data tidak ditandai kosong saat pemuatan gagal.</span></div> : vehicleTableState === 'empty' ? <div className="mep-empty"><b>Belum ada data kendaraan.</b><span>Master kendaraan masih kosong. Import Excel atau tambah kendaraan secara manual.</span></div> : vehicleTableState === 'no-results' ? <div className="mep-empty"><b>Tidak ada kendaraan yang cocok dengan pencarian atau filter.</b><span>Ubah kata kunci atau reset filter untuk menampilkan kendaraan lain.</span><button type="button" className="mep-secondary" onClick={() => { setQuery(''); setOwnershipFilter('SEMUA'); setTypeFilter('SEMUA'); setIntegrityFilter(false); exitSelection() }}>Reset Pencarian &amp; Filter</button></div> : <table className={`mep-table${!selectionMode && activeRowId !== null ? ' mep-has-active-row' : ''}`} data-native-row-selection="true"><colgroup>{selectionMode && <col className="mep-col-selection" />}<col className="mep-col-identity" /><col className="mep-col-type" /><col className="mep-col-ownership" /><col className="mep-col-rental" /><col className="mep-col-price" /><col className="mep-col-owner" /><col className="mep-col-driver" /><col className="mep-col-location" /><col className="mep-col-tax" /><col className="mep-col-notes" /><col className="mep-col-actions" /></colgroup><thead><tr>{selectionMode && <th className="mep-check"><input type="checkbox" aria-label="Pilih semua" checked={allSelected} onChange={toggleAll}/></th>}<th>No. Pol / Merk / Type</th><th>Jenis</th><th>Kepemilikan</th><th>Jenis Sewa</th><th>Harga Perolehan</th><th>Pemilik</th><th>Driver</th><th>Lokasi Kerja</th><th>Pajak</th><th>Keterangan</th><th>Aksi</th></tr></thead><tbody>{filtered.map(v => { const driver = driverMap[v.driver_id]; const picked = selected.includes(v.id); return <tr key={v.id} className={(picked ? 'picked' : '') + (activeRowId === v.id ? ' dpt-row-selected' : '')} onDoubleClick={e => { if (isInteractive(e.target)) return; e.preventDefault(); window.clearTimeout(rowClickTimer.current); if (selectionMode) { exitSelection(); return }; enterSelectionMode(v.id) }} onClick={e => { if (isInteractive(e.target)) return; window.clearTimeout(rowClickTimer.current); if (selectionMode) return; if (e.detail > 1) return; rowClickTimer.current = window.setTimeout(() => setActiveRowId(current => current === v.id ? null : v.id), 180) }}>
        {selectionMode && <td className="mep-check"><input type="checkbox" checked={picked} onChange={() => toggleSelected(v.id)} aria-label={`Pilih ${v.nomor_polisi}`}/></td>}
        <td><b>{v.nomor_polisi}</b><span>{v.merk} {v.tipe || ''}</span><small>{v.tahun || '-'}{v.nomor_mesin ? ` • Mesin ${v.nomor_mesin}` : ''}</small></td>
        <td><span className="mep-pill">{v.jenis_kendaraan || '-'}</span></td>
        <td><b>{OWNERSHIP[normalizeOwnership(v.kepemilikan)] || '-'}</b></td>
        <td><span>{normalizeOwnership(v.kepemilikan) === 'SEWA' ? rentalTypeLabel(rentalTypeForVehicle(v)) : '-'}</span></td>
        <td><span>{v.harga_perolehan == null ? '-' : `Rp ${Number(v.harga_perolehan).toLocaleString('id-ID')}`}</span></td>
        <td><span>{v.pemilik || '-'}</span></td>
        <td><span>{driver?.nama_lengkap || '-'}</span></td>
        <td><span>{v.lokasi || '-'}</span><small>{v.unit_kerja || '-'}</small></td>
        <td><span>{v.masa_berlaku_pajak ? formatDate(v.masa_berlaku_pajak) : '-'}</span><small>{v.status_pajak || '-'}</small></td>
        <td><span>{v.keterangan || '-'}</span><small>{v.catatan_hutang || ''}</small></td>
        <td className="mep-actions"><div className="mep-actions-inner">{!selectionMode && activeRowId === v.id && <><button type="button" aria-label={`Detail kendaraan ${v.nomor_polisi}`} onClick={() => openDetail(v)}>Detail</button>{canEdit && <button type="button" aria-label={`Edit kendaraan ${v.nomor_polisi}`} onClick={() => openEdit(v)}>Edit</button>}{normalizeOwnership(v.kepemilikan) === 'SEWA' && onNavigate && <button type="button" aria-label={`Kelola sewa kendaraan ${v.nomor_polisi}`} onClick={() => onNavigate('sewa')}>Kelola Sewa</button>}{canDelete && <button type="button" className="danger" aria-label={`Hapus kendaraan ${v.nomor_polisi}`} onClick={async () => { if (window.confirm(`Hapus kendaraan ${v.nomor_polisi}?`)) { const removed = await deleteOne(v); if (removed) setSuccess(`Kendaraan ${v.nomor_polisi} berhasil dihapus.`) } }}>Hapus</button>}</>}</div></td>
      </tr> })}</tbody></table>}</div></div>
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
      {normalizeOwnership(form.kepemilikan) === 'SEWA' && <label>Jenis Sewa<select name="jenis_sewa" value={form.jenis_sewa || ''} onChange={change} required><option value="">Pilih jenis sewa</option><option value="SEWA_PERORANGAN">Sewa Perorangan</option><option value="SEWA_PERUSAHAAN">Sewa Perusahaan</option></select></label>}
      <label>Harga Perolehan<input name="harga_perolehan" type="number" min="0" value={form.harga_perolehan ?? ''} onChange={change} placeholder="Contoh: 60000000"/></label>
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
    <div className="mep-photo-section"><div><b>Foto Kendaraan (opsional)</b><span>Administrator dapat mengunggah setiap sisi secara terpisah beserta foto STNK. Foto disimpan privat dan ditampilkan melalui tautan bertanda tangan.</span></div>{photoLoadError && <div className="mep-alert error">{photoLoadError}</div>}<div className="mep-photo-grid">{PHOTO_ITEMS.map(photo => <label className="mep-photo" key={photo.key}><span>{photo.label}</span>{photoUrls[photo.key] ? <img src={photoUrls[photo.key]} alt={photo.label}/> : <div className="mep-photo-empty">{editing?.[photo.field] ? photoLoading ? 'Memuat foto...' : 'Foto tidak dapat dimuat' : 'Belum ada foto'}</div>}{canPhoto && <input type="file" accept={IMAGE_UPLOAD_ACCEPT} onChange={e => setPhotoFiles(current => ({ ...current, [photo.key]: e.target.files?.[0] || null }))}/>} {!canPhoto && <small>Upload khusus Admin</small>}{editing?.[photo.field] && <small>Foto tersimpan</small>}</label>)}</div></div>
    <div className="mep-form-actions"><button type="button" className="mep-secondary" onClick={resetModal}>Batal</button><button type="submit" className="mep-primary" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan Kendaraan'}</button></div></form></section></div>}

    {detail && <div className="mep-overlay"><section className="mep-modal small"><header><div><span className="eyebrow">DETAIL KENDARAAN</span><h3>{detail.nomor_polisi}</h3></div><button type="button" onClick={closeDetail}>×</button></header><div className="mep-detail"><div><span>Merk / Type</span><b>{detail.merk} {detail.tipe || ''}</b></div><div><span>Jenis</span><b>{detail.jenis_kendaraan || '-'}</b></div><div><span>Kepemilikan</span><b>{OWNERSHIP[normalizeOwnership(detail.kepemilikan)] || '-'}</b></div><div><span>Harga Perolehan</span><b>{detail.harga_perolehan == null ? '-' : `Rp ${Number(detail.harga_perolehan).toLocaleString('id-ID')}`}</b></div><div><span>Jenis Sewa</span><b>{normalizeOwnership(detail.kepemilikan) === 'SEWA' ? rentalTypeLabel(rentalTypeForVehicle(detail)) : '-'}</b></div><div><span>Pemilik</span><b>{detail.pemilik || '-'}</b></div><div><span>Tahun</span><b>{detail.tahun || '-'}</b></div><div><span>No. Mesin</span><b>{detail.nomor_mesin || '-'}</b></div><div><span>No. Rangka</span><b>{detail.nomor_rangka || '-'}</b></div><div><span>Masa Berlaku Pajak</span><b>{formatDate(detail.masa_berlaku_pajak)}</b></div><div><span>Status Pajak</span><b>{detail.status_pajak || '-'}</b></div><div><span>Unit Kerja</span><b>{detail.unit_kerja || '-'}</b></div><div><span>Driver</span><b>{driverMap[detail.driver_id]?.nama_lengkap || '-'}</b></div><div><span>Lokasi Kerja</span><b>{detail.lokasi || '-'}</b></div><div className="full"><span>Keterangan</span><b>{detail.keterangan || '-'}</b></div><div className="full"><span>Catatan Hutang</span><b>{detail.catatan_hutang || '-'}</b></div></div><div className="mep-detail-photos">{PHOTO_ITEMS.map(photo => <div key={photo.key}><span>{photo.label}</span>{detailPhotoUrls[photo.key] ? <img src={detailPhotoUrls[photo.key]} alt={photo.label}/> : <div className="mep-photo-empty">{detailPhotoLoading ? 'Memuat foto...' : detail[photo.field] ? 'Foto tidak dapat dimuat' : 'Belum ada foto'}</div>}</div>)}</div><div className="mep-form-actions"><button type="button" className="mep-secondary" onClick={closeDetail}>Tutup</button>{canEdit && <button type="button" className="mep-primary" onClick={() => { const current = detail; closeDetail(); openEdit(current) }}>Edit Kendaraan</button>}</div></section></div>}
  </div>
}