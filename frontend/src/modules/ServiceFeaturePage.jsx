import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { humanizeError } from '../utils/feedback.js'
import './TransportOperationsFixed.css'
import PageBreadcrumb from './PageBreadcrumb.jsx'
import { formatDateSafe } from '../utils/dateSafe'
import { decodeExcelMeta, encodeExcelMeta } from '../utils/excelSourceMeta.js'
import { historyNumberInput, normalizeHistoryPpn } from '../utils/serviceHistoryMoney.js'
import { DOCUMENT_UPLOAD_ACCEPT, IMAGE_UPLOAD_ACCEPT, validateStorageUploadFile } from '../utils/storageUpload.js'

const money = v => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(v || 0))
const dateText = v => formatDateSafe(v)
const TYPES = { SERVICE: 'Service', GANTI_BAN: 'Ganti Ban', GANTI_AKI: 'Ganti Aki / Baterai', PEMERIKSAAN: 'Pemeriksaan' }
const STAT = { MENUNGGU_TRANSPORT: 'Menunggu Transport', DITERIMA_TRANSPORT: 'Diterima Transport', DALAM_PROSES: 'Dalam Proses', MENUNGGU_APPROVAL: 'Menunggu Approval', DISETUJUI: 'Disetujui', DITOLAK: 'Ditolak', DALAM_PENGERJAAN: 'Dalam Pengerjaan', SELESAI: 'Selesai', DIBATALKAN: 'Dibatalkan', DRAFT: 'Draft' }
const emptyService = { permintaan_service_id: '', kendaraan_id: '', tanggal_service: new Date().toISOString().slice(0, 10), kilometer: '', bengkel: '', jenis_service: 'SERVICE', keluhan: '', estimasi_biaya: '', biaya_aktual: '', nilai_dpp: '', ppn: '', total: '', catatan: '' }
const emptyItem = { service_id: '', nama_item: '', kategori: 'SPAREPART', jumlah: '1', satuan: 'pcs', harga_satuan: '', keterangan: '' }
const emptyProof = { service_id: '', jenis_bukti: 'BON_INVOICE', keterangan: '' }
const emptyPart = { kendaraan_id: '', tanggal_penggantian: new Date().toISOString().slice(0, 10), kilometer: '', kondisi_sebelum: '', alasan_penggantian: '', biaya: '', keterangan: '', _type: 'BAN' }
const emptyKm = { kendaraan_id: '', tanggal: new Date().toISOString().slice(0, 10), kilometer: '', sumber: 'SERVICE', keterangan: '' }
const historyWorkCategory = (work, fallback) => {
  const source = String(work ?? '').trim().toUpperCase()
  if (/PENGADAAN BARANG|SPAREPART|SUKU CADANG/.test(source)) return 'SPAREPART'
  if (/JASA SERVICE|\bJASA\b|PEKERJAAN|LABOR/.test(source)) return 'JASA'
  return fallback || 'LAINNYA'
}
const historyDateInput = value => {
  const raw = String(value ?? '').trim()
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw)
  if (iso) return raw.slice(0, 10)
  const local = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(raw)
  return local ? local[3] + '-' + local[2].padStart(2, '0') + '-' + local[1].padStart(2, '0') : ''
}
function Alert({ type = 'success', children }) { return <div className={`x-alert ${type}`}>{children}</div> }
function Header({ eyebrow, title, text, action, breadcrumb }) { return <><PageBreadcrumb items={['Transport', 'Service & Perbaikan', breadcrumb]} /><div className="x-head"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p>{text}</p></div>{action}</div></> }
function Empty({ text = 'Belum ada data.' }) { return <div className="x-empty">{text}</div> }
async function upload(bucket, file, prefix, { imagesOnly = false } = {}) {
  if (!file) return null
  const contentType = validateStorageUploadFile(file, { imagesOnly })
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${prefix}/${Date.now()}-${crypto.randomUUID()}-${safe}`
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false, contentType })
  if (error) throw error
  return path
}
async function signed(bucket, path) { if (!path) return null; const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600); if (error) throw error; return data?.signedUrl || null }
export default function ServiceFeaturePage({ profile }) {
  const [tab, setTab] = useState('pekerjaan')
  const [vehicles, setVehicles] = useState([]), [drivers, setDrivers] = useState([]), [requests, setRequests] = useState([]), [services, setServices] = useState([]), [items, setItems] = useState([]), [proofs, setProofs] = useState([]), [approvals, setApprovals] = useState([]), [bans, setBans] = useState([]), [akis, setAkis] = useState([]), [kms, setKms] = useState([])
  const [form, setForm] = useState(emptyService), [itemForm, setItemForm] = useState(emptyItem), [proofForm, setProofForm] = useState(emptyProof), [partForm, setPartForm] = useState(emptyPart), [kmForm, setKmForm] = useState(emptyKm)
  const [editingItemId, setEditingItemId] = useState(null), [editingProofId, setEditingProofId] = useState(null), [editingPartId, setEditingPartId] = useState(null), [editingKmId, setEditingKmId] = useState(null)
  const [file, setFile] = useState(null), [selected, setSelected] = useState(null), [selectedItem, setSelectedItem] = useState(null), [selectedPart, setSelectedPart] = useState(null), [selectedKm, setSelectedKm] = useState(null), [approvalModal, setApprovalModal] = useState(null), [approvalNote, setApprovalNote] = useState('')
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState(''), [success, setSuccess] = useState('')
  const [serviceExcelFullscreen, setServiceExcelFullscreen] = useState(false)
  const [serviceExcelScrollWidth, setServiceExcelScrollWidth] = useState(0)
  const serviceExcelWrapRef = useRef(null)
  const serviceExcelTopScrollRef = useRef(null)
  const [detailEdit, setDetailEdit] = useState({ biaya_aktual: '' })
  const [editingServiceId, setEditingServiceId] = useState(null)
  const [serviceSearch, setServiceSearch] = useState('')
  const [serviceVehicleFilter, setServiceVehicleFilter] = useState('SEMUA')
  const [historyEditingRow, setHistoryEditingRow] = useState(null)
  const [historyEditForm, setHistoryEditForm] = useState(null)
  const canProcess = ['ADMIN', 'TRANSPORT'].includes(profile?.role)
  const canApprove = ['ADMIN', 'ATASAN_TRANSPORT', 'DIREKTUR'].includes(profile?.role)
  const vehicleMap = useMemo(() => Object.fromEntries(vehicles.map(v => [v.id, v])), [vehicles])
  const driverMap = useMemo(() => Object.fromEntries(drivers.map(d => [d.id, d])), [drivers])
  const tabLoadRef = useRef({ bukti: false, ban: false, aki: false, km: false })
  const relatedLoadRef = useRef(new Set())

  const loadTabData = useCallback(async (targetTab, force = false) => {
    const target = ['bukti', 'ban', 'aki', 'km'].includes(targetTab) ? targetTab : null
    if (!target) return
    if (!force && tabLoadRef.current[target]) return
    try {
      if (target === 'bukti') {
        const { data, error: e } = await supabase.from('service_bukti').select('*').order('created_at', { ascending: false })
        if (e) throw e
        setProofs(data || [])
      } else if (target === 'ban') {
        const { data, error: e } = await supabase.from('riwayat_ban').select('*').order('tanggal_penggantian', { ascending: false })
        if (e) throw e
        setBans(data || [])
      } else if (target === 'aki') {
        const { data, error: e } = await supabase.from('riwayat_aki').select('*').order('tanggal_penggantian', { ascending: false })
        if (e) throw e
        setAkis(data || [])
      } else if (target === 'km') {
        const { data, error: e } = await supabase.from('riwayat_kilometer').select('*').order('tanggal', { ascending: false })
        if (e) throw e
        setKms(data || [])
      }
      tabLoadRef.current[target] = true
    } catch (e) {
      setError(humanizeError(e))
    }
  }, [])

  const ensureServiceDetailData = async serviceId => {
    const key = String(serviceId)
    if (relatedLoadRef.current.has(key)) return
    try {
      const [proofResult, approvalResult] = await Promise.all([
        supabase.from('service_bukti').select('*').eq('service_id', serviceId).order('created_at', { ascending: false }),
        supabase.from('service_approval').select('*').eq('service_id', serviceId).order('urutan', { ascending: true }),
      ])
      if (proofResult.error) throw proofResult.error
      if (approvalResult.error) throw approvalResult.error
      setProofs(current => [...current.filter(row => row.service_id !== serviceId), ...(proofResult.data || [])])
      setApprovals(current => [...current.filter(row => row.service_id !== serviceId), ...(approvalResult.data || [])])
      relatedLoadRef.current.add(key)
    } catch (e) {
      setError(humanizeError(e))
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    tabLoadRef.current = { bukti: false, ban: false, aki: false, km: false }
    relatedLoadRef.current = new Set()
    const rs = await Promise.all([
      supabase.from('kendaraan').select('id,nomor_polisi,merk,tipe,jenis_kendaraan,tahun,driver_id,kilometer_terakhir,status').order('nomor_polisi'),
      supabase.from('permintaan_service').select('*').order('created_at', { ascending: false }),
      supabase.from('service').select('*').order('created_at', { ascending: false }),
      supabase.from('service_item').select('*').order('created_at', { ascending: false }),
      supabase.from('driver').select('id,nama_lengkap').order('nama_lengkap'),
      canApprove ? supabase.from('service_approval').select('*').order('urutan', { ascending: true }) : Promise.resolve({ data: [], error: null }),
    ])
    const names = ['Kendaraan', 'Pengajuan', 'Service', 'Item', 'Driver', 'Approval']
    rs.forEach((r, i) => { if (r.error) setError(e => e || `${names[i]}: ${humanizeError(r.error)}`) })
    setVehicles(rs[0].data || [])
    setRequests(rs[1].data || [])
    setServices(rs[2].data || [])
    setItems(rs[3].data || [])
    setDrivers(rs[4].data || [])
    setApprovals(rs[5].data || [])
    setLoading(false)
  }, [canApprove])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const handleImported = event => {
      if (!['service', 'pengajuan', 'kendaraan'].includes(event.detail?.context)) return
      load()
      if (['bukti', 'ban', 'aki', 'km'].includes(tab)) loadTabData(tab, true)
    }
    const handleServiceStateUpdated = event => {
      const detail = event.detail || {}
      if (detail.kind === 'service' && detail.service) {
        setServices(current => {
          const exists = current.some(row => row.id === detail.service.id)
          return exists ? current.map(row => row.id === detail.service.id ? { ...row, ...detail.service } : row) : [detail.service, ...current]
        })
        if (detail.request?.id) setRequests(current => current.map(row => row.id === detail.request.id ? { ...row, ...detail.request } : row))
      }
      if (detail.kind === 'proof' && detail.proof) setProofs(current => current.some(row => row.id === detail.proof.id) ? current : [detail.proof, ...current])
      if (detail.kind === 'approval' && detail.approval) setApprovals(current => current.some(row => row.id === detail.approval.id) ? current : [detail.approval, ...current])
    }
    window.addEventListener('transport:data-imported', handleImported)
    window.addEventListener('transport:service-state-updated', handleServiceStateUpdated)
    return () => {
      window.removeEventListener('transport:data-imported', handleImported)
      window.removeEventListener('transport:service-state-updated', handleServiceStateUpdated)
    }
  }, [load, loadTabData, tab])

  useEffect(() => {
    if (['bukti', 'ban', 'aki', 'km'].includes(tab)) loadTabData(tab)
  }, [tab, loadTabData])

  const clearMessages = () => { setError(''); setSuccess('') }
  const emitServiceStateUpdate = detail => window.dispatchEvent(new CustomEvent('transport:service-state-updated', { detail }))
  const pending = requests.filter(r => ['MENUNGGU_TRANSPORT', 'DITERIMA_TRANSPORT', 'DALAM_PROSES'].includes(r.status))
  const filteredServices = useMemo(() => { const q = serviceSearch.trim().toLowerCase(); return services.filter(s => { const v = vehicleMap[s.kendaraan_id]; const hay = [s.nomor_service, s.bengkel, s.keluhan, v?.nomor_polisi, v?.merk, v?.tipe].filter(Boolean).join(' ').toLowerCase(); return (!q || hay.includes(q)) && (serviceVehicleFilter === 'SEMUA' || String(s.kendaraan_id) === String(serviceVehicleFilter)) }) }, [services, serviceSearch, serviceVehicleFilter, vehicleMap])
  const refreshServiceExcelScroll = () => {
    const wrap = serviceExcelWrapRef.current
    const table = wrap?.querySelector('.x-table')
    if (!wrap || !table) return
    setServiceExcelScrollWidth(Math.max(table.scrollWidth, wrap.clientWidth))
  }
  const syncServiceExcelFromTop = event => {
    if (serviceExcelWrapRef.current) serviceExcelWrapRef.current.scrollLeft = event.currentTarget.scrollLeft
  }
  const syncServiceExcelFromTable = event => {
    if (serviceExcelTopScrollRef.current) serviceExcelTopScrollRef.current.scrollLeft = event.currentTarget.scrollLeft
  }
  useEffect(() => {
    refreshServiceExcelScroll()
    const wrap = serviceExcelWrapRef.current
    const table = wrap?.querySelector('.x-table')
    if (!wrap || !table) return undefined
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(refreshServiceExcelScroll) : null
    observer?.observe(wrap)
    observer?.observe(table)
    window.addEventListener('resize', refreshServiceExcelScroll)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', refreshServiceExcelScroll)
    }
  }, [tab, items, services, vehicles, drivers, serviceExcelFullscreen])
  useEffect(() => {
    document.body.classList.toggle('transport-service-fullscreen-open', serviceExcelFullscreen)
    return () => document.body.classList.remove('transport-service-fullscreen-open')
  }, [serviceExcelFullscreen])
  const serviceMap = useMemo(() => Object.fromEntries(services.map(s => [s.id, s])), [services])
  const serviceExcelRows = useMemo(() => {
    const rows = []
    if (items.length) items.forEach((item, index) => {
      const s = serviceMap[item.service_id]
      const v = vehicleMap[s?.kendaraan_id]
      const { meta, note } = decodeExcelMeta(item.keterangan)
      const source = meta?.source === 'DATA_SERVICE' ? meta : null
      const date = source?.tanggal || s?.tanggal_service
      const parsedDate = date ? new Date(`${date}T00:00:00`) : null
      rows.push({
        service_id: s?.id || item.service_id || null,
        item_id: item.id,
        no: Number.isFinite(Number(source?.source_no)) ? Number(source.source_no) : index + 1,
        merk: source?.merk || v?.merk || '-', type: source?.type || v?.tipe || '-', jenis: source?.jenis || v?.jenis_kendaraan || '-',
        tahun: source?.tahun || v?.tahun || '-', nomor_polisi: source?.nomor_polisi || v?.nomor_polisi || '-', driver: source?.driver || driverMap[v?.driver_id]?.nama_lengkap || '-',
        bulan: source?.bulan || (parsedDate && !Number.isNaN(parsedDate.getTime()) ? new Intl.DateTimeFormat('id-ID', { month: 'long' }).format(parsedDate) : '-'),
        tanggal: date || '-', jenis_pekerjaan: source?.jenis_pekerjaan || TYPES[s?.jenis_service] || s?.jenis_service || '-', uraian: source?.uraian || item.nama_item || s?.keluhan || '-',
        qty: source?.qty ?? item.jumlah ?? '-', satuan: source?.satuan || item.satuan || '-', harga_satuan: source?.harga_satuan ?? item.harga_satuan ?? '-', nilai_dpp: source?.nilai_dpp ?? item.subtotal ?? '-',
        ppn: source?.ppn ?? source?.ppn_source ?? '-', total: source?.total ?? item.subtotal ?? '-', kilometer: source?.kilometer ?? s?.kilometer ?? '-', bengkel: source?.bengkel || s?.bengkel || '-', keterangan: note || source?.keterangan || s?.catatan || '-',
      })
    })
    if (!rows.length) services.forEach((s, index) => { const v = vehicleMap[s.kendaraan_id]; const date = s.tanggal_service ? new Date(`${s.tanggal_service}T00:00:00`) : null; rows.push({ service_id: s?.id || null, item_id: null, no: index + 1, merk: v?.merk || '-', type: v?.tipe || '-', jenis: v?.jenis_kendaraan || '-', tahun: v?.tahun || '-', nomor_polisi: v?.nomor_polisi || '-', driver: driverMap[v?.driver_id]?.nama_lengkap || '-', bulan: date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat('id-ID', { month: 'long' }).format(date) : '-', tanggal: s.tanggal_service || '-', jenis_pekerjaan: TYPES[s.jenis_service] || s.jenis_service || '-', uraian: s.keluhan || '-', qty: '-', satuan: '-', harga_satuan: '-', nilai_dpp: s.nilai_dpp ?? '-', ppn: s.ppn ?? '-', total: s.total ?? s.biaya_aktual ?? '-', kilometer: s.kilometer ?? '-', bengkel: s.bengkel || '-', keterangan: s.catatan || '-' }) })
    return rows
  }, [items, services, serviceMap, vehicleMap, driverMap])
  const saveService = async e => {
    e.preventDefault(); clearMessages(); setSaving(true)
    try {
      if (!form.kendaraan_id) throw new Error('Kendaraan wajib dipilih.')
      if (form.estimasi_biaya === '' || Number(form.estimasi_biaya) < 0) throw new Error('Estimasi biaya wajib diisi.')
      const estimate = Number(form.estimasi_biaya)
      const actual = form.biaya_aktual === '' ? null : Number(form.biaya_aktual)
      if (actual !== null && (!Number.isFinite(actual) || actual < 0)) throw new Error('Biaya aktual tidak valid.')
      const dpp = Number(form.nilai_dpp || estimate), ppn = Number(form.ppn || 0), total = Number(form.total || (dpp + ppn))
      if (![dpp, ppn, total].every(Number.isFinite) || dpp < 0 || ppn < 0 || total < 0) throw new Error('DPP/PPN/Total tidak valid.')
      const needsApproval = Math.max(estimate, actual ?? 0) > 5000000 || (actual !== null && actual > estimate)
      const previous = editingServiceId ? services.find(row => row.id === editingServiceId) : null
      const payload = {
        permintaan_service_id: form.permintaan_service_id ? Number(form.permintaan_service_id) : null,
        kendaraan_id: Number(form.kendaraan_id), tanggal_service: form.tanggal_service, kilometer: Number(form.kilometer || 0),
        bengkel: form.bengkel.trim() || null, jenis_service: form.jenis_service, keluhan: form.keluhan.trim() || null,
        estimasi_biaya: estimate, biaya_aktual: actual, status: needsApproval ? 'MENUNGGU_APPROVAL' : (editingServiceId ? (previous?.status || 'DALAM_PENGERJAAN') : 'DALAM_PENGERJAAN'),
        diproses_oleh: profile.id, nilai_dpp: dpp, ppn, total, catatan: form.catatan.trim() || null,
      }
      const result = editingServiceId
        ? await supabase.from('service').update(payload).eq('id', editingServiceId).select('*').single()
        : await supabase.from('service').insert({ ...payload, nomor_service: `SRV-${Date.now()}` }).select('*').single()
      if (result.error) throw result.error
      setForm({ ...emptyService, tanggal_service: new Date().toISOString().slice(0, 10) }); setEditingServiceId(null)
      setServices(current => editingServiceId ? current.map(row => row.id === result.data.id ? result.data : row) : [result.data, ...current])
      if (form.permintaan_service_id) {
        setRequests(current => current.map(row => row.id === Number(form.permintaan_service_id)
          ? { ...row, status: needsApproval ? 'MENUNGGU_APPROVAL' : 'DALAM_PROSES', diproses_oleh: profile.id, diproses_at: new Date().toISOString() }
          : row
        ))
      }
      emitServiceStateUpdate({ kind: 'service', service: result.data })
      setSuccess(editingServiceId ? `Service ${result.data.nomor_service || result.data.id} diperbarui.` : `Service ${result.data.nomor_service} berhasil dibuat.${form.permintaan_service_id ? '' : ' Service dibuat langsung tanpa pengajuan.'}`)
    } catch (e2) { setError(humanizeError(e2)) } finally { setSaving(false) }
  }

  const approvalList = s => approvals.filter(a => a.service_id === s.id).sort((a, b) => Number(a.urutan || 0) - Number(b.urutan || 0))
  const approvedCount = s => approvalList(s).filter(a => a.status === 'DISETUJUI').length
  const hasInitialApproval = s => approvedCount(s) >= 1
  const hasDirectorApproval = s => approvalList(s).some(a => a.status === 'DISETUJUI' && a.jenis_approval === 'DIREKTUR')
  const additionalApprovalRequired = s => Number(s.biaya_aktual ?? 0) > Number(s.estimasi_biaya ?? 0) && hasInitialApproval(s)
  const requiredApprovalRole = s => {
    if (!s || s.status !== 'MENUNGGU_APPROVAL') return null
    const approved = approvedCount(s)
    const estimate = Number(s.estimasi_biaya ?? 0)
    const actual = Number(s.biaya_aktual ?? estimate)
    if (approved >= 1 && actual <= estimate) return null
    const amount = approved === 0 ? estimate : actual
    return amount > 5000000 ? 'DIREKTUR' : 'ATASAN_TRANSPORT'
  }
  const canOpenApproval = s => {
    if (!canApprove) return false
    const required = requiredApprovalRole(s)
    return Boolean(required && (profile?.role === 'ADMIN' || profile?.role === required))
  }
  const confirmApproval = async approved => { if (!approvalModal) return; const s = approvalModal.service; setSaving(true); clearMessages(); try { const required = approvalModal.required; const currentApproved = approvedCount(s); const next = Math.max(0, ...approvalList(s).map(a => Number(a.urutan) || 0)) + 1; const estimate = Number(s.estimasi_biaya || 0); const actual = Number(s.biaya_aktual ?? estimate); const approvalComplete = approved && (currentApproved >= 1 || actual <= estimate); const { data: approval, error: e1 } = await supabase.from('service_approval').insert({ service_id: s.id, urutan: next, jenis_approval: required === 'DIREKTUR' ? 'DIREKTUR' : 'KEPALA_BAGIAN', pemberi_approval: profile.id, status: approved ? 'DISETUJUI' : 'DITOLAK', waktu_approval: new Date().toISOString(), catatan: approvalNote.trim() || null }).select('*').single(); if (e1) throw e1; const { error: e2 } = await supabase.from('service').update({ status: approved ? (approvalComplete ? 'DISETUJUI' : 'MENUNGGU_APPROVAL') : 'DITOLAK' }).eq('id', s.id); if (e2) throw e2; setApprovals(current => [approval, ...current]); setServices(current => current.map(row => row.id === s.id ? { ...row, status: approved ? (approvalComplete ? 'DISETUJUI' : 'MENUNGGU_APPROVAL') : 'DITOLAK' } : row)); emitServiceStateUpdate({ kind: 'approval', approval }); emitServiceStateUpdate({ kind: 'service', service: { ...s, status: approved ? (approvalComplete ? 'DISETUJUI' : 'MENUNGGU_APPROVAL') : 'DITOLAK' } }); setSuccess(approved ? (approvalComplete ? `Approval ke-${next} service disetujui dan approval telah lengkap.` : `Approval ke-${next} service disetujui. Masih menunggu approval berikutnya.`) : 'Service ditolak.'); setApprovalModal(null); setApprovalNote('') } catch (e3) { setError(humanizeError(e3)) } finally { setSaving(false) } }
  const updateActual = async () => { if (!selected) return; const value = Number(detailEdit.biaya_aktual); if (!Number.isFinite(value) || value < 0) { setError('Biaya aktual tidak valid.'); return } const estimate = Number(selected.estimasi_biaya || 0); const count = approvedCount(selected); const directorApproved = hasDirectorApproval(selected); const requiredCount = estimate > 5000000 ? (value > estimate ? 2 : 1) : ((value > estimate || value > 5000000) ? 1 : 0); const needsApproval = count < requiredCount || (value > 5000000 && !directorApproved); setSaving(true); clearMessages(); const { error: e } = await supabase.from('service').update({ biaya_aktual: value, status: needsApproval ? 'MENUNGGU_APPROVAL' : selected.status }).eq('id', selected.id); setSaving(false); if (e) setError(humanizeError(e)); else { const nextStatus = needsApproval ? 'MENUNGGU_APPROVAL' : selected.status; setSelected({ ...selected, biaya_aktual: value, status: nextStatus }); setServices(current => current.map(row => row.id === selected.id ? { ...row, biaya_aktual: value, status: nextStatus } : row)); emitServiceStateUpdate({ kind: 'service', service: { ...selected, biaya_aktual: value, status: nextStatus } }); setSuccess('Biaya aktual diperbarui. Sistem akan meminta approval sesuai perubahan nilai biaya.') } }
  const finish = async s => { clearMessages(); const actual = s.biaya_aktual === null || s.biaya_aktual === '' ? Number(s.estimasi_biaya || 0) : Number(s.biaya_aktual); const estimate = Number(s.estimasi_biaya || 0); const count = approvedCount(s); const requiredCount = estimate > 5000000 ? (actual > estimate ? 2 : 1) : ((actual > estimate || actual > 5000000) ? 1 : 0); if (!Number.isFinite(actual) || actual < 0 || !Number.isFinite(estimate) || estimate < 0) { setError('Nilai biaya service tidak valid.'); return } if (actual > 5000000 && !hasDirectorApproval(s)) { setError('Biaya aktual di atas Rp5.000.000 memerlukan approval Direktur.'); return } if (count < requiredCount) { setError('Approval yang diwajibkan belum lengkap untuk nilai service saat ini.'); return } setSaving(true); try { const now = new Date().toISOString(); const { error: e1 } = await supabase.from('service').update({ status: 'SELESAI', biaya_aktual: actual, selesai_at: now }).eq('id', s.id); if (e1) throw e1; const { error: e2 } = await supabase.from('permintaan_service').update({ status: 'SELESAI', diproses_oleh: profile.id, diproses_at: now }).eq('id', s.permintaan_service_id); if (e2) throw e2; const { data: k } = await supabase.from('riwayat_kilometer').select('kilometer').eq('kendaraan_id', s.kendaraan_id).order('kilometer', { ascending: false }).limit(1); if (Number(s.kilometer || 0) >= Number(k?.[0]?.kilometer || 0)) { await supabase.from('kendaraan').update({ kilometer_terakhir: Number(s.kilometer || 0) }).eq('id', s.kendaraan_id); setVehicles(current => current.map(row => row.id === s.kendaraan_id ? { ...row, kilometer_terakhir: Number(s.kilometer || 0) } : row)) }; setServices(current => current.map(row => row.id === s.id ? { ...row, status: 'SELESAI', biaya_aktual: actual, selesai_at: now } : row)); setRequests(current => current.map(row => row.id === s.permintaan_service_id ? { ...row, status: 'SELESAI', diproses_oleh: profile.id, diproses_at: now } : row)); emitServiceStateUpdate({ kind: 'service', service: { ...s, status: 'SELESAI', biaya_aktual: actual, selesai_at: now }, request: { id: s.permintaan_service_id, status: 'SELESAI', diproses_oleh: profile.id, diproses_at: now } }); setSelected(null); setSuccess('Service selesai, status pengajuan ditutup, dan KM kendaraan diperbarui.') } catch (e3) { setError(humanizeError(e3)) } finally { setSaving(false) } }
  const saveItem = async e => {
    e.preventDefault(); clearMessages()
    const jumlah = Number(itemForm.jumlah || 0), harga = Number(itemForm.harga_satuan || 0)
    if (!itemForm.service_id || !itemForm.nama_item.trim()) return setError('Service dan nama item wajib diisi.')
    if (jumlah <= 0) return setError('Jumlah item harus lebih dari 0.')
    if (!Number.isFinite(harga) || harga < 0) return setError('Harga satuan tidak valid.')
    const payload = { service_id: Number(itemForm.service_id), nama_item: itemForm.nama_item.trim(), kategori: itemForm.kategori.trim() || null, jumlah, satuan: itemForm.satuan, harga_satuan: harga, subtotal: jumlah * harga, keterangan: itemForm.keterangan.trim() || null }
    setSaving(true)
    try {
      const result = editingItemId
        ? await supabase.from('service_item').update(payload).eq('id', editingItemId).select('*').single()
        : await supabase.from('service_item').insert(payload).select('*').single()
      if (result.error) throw result.error
      setItems(current => editingItemId ? current.map(row => row.id === result.data.id ? result.data : row) : [result.data, ...current])
      setSuccess(editingItemId ? 'Item service diperbarui.' : 'Item service tersimpan.')
      setEditingItemId(null); setItemForm(emptyItem)
    } catch (err) { setError(humanizeError(err)) } finally { setSaving(false) }
  }
  const deleteItem = async item => {
    if (!canProcess) return
    if (!window.confirm('Hapus item ' + item.nama_item + '?')) return
    setSaving(true)
    try {
      const result = await supabase.from('service_item').delete().eq('id', item.id).select('id').maybeSingle()
      if (result.error) throw result.error
      if (!result.data) throw new Error('Item service tidak berhasil dihapus.')
      setItems(current => current.filter(row => row.id !== item.id))
      setSuccess('Item service dihapus.')
    } catch (err) { setError(humanizeError(err)) } finally { setSaving(false) }
  }
  const editItem = item => {
    const sourceMeta = decodeExcelMeta(item.keterangan).meta
    if (sourceMeta?.source === 'DATA_SERVICE') {
      const historyRow = serviceExcelRows.find(row => String(row.item_id) === String(item.id))
      if (historyRow) {
        openHistoryEdit(historyRow)
        return
      }
    }
    setEditingItemId(item.id)
    setItemForm({ service_id: item.service_id, nama_item: item.nama_item || '', kategori: item.kategori || 'SPAREPART', jumlah: item.jumlah ?? 1, satuan: item.satuan || 'pcs', harga_satuan: item.harga_satuan ?? '', keterangan: item.keterangan || '' })
    setTab('item')
  }
  const saveProof = async e => {
    e.preventDefault(); clearMessages(); setSaving(true)
    let path = null
    try {
      if (!proofForm.service_id) throw new Error('Service wajib dipilih.')
      let filePath = editingProofId ? (proofs.find(p => p.id === editingProofId)?.file_path || null) : null
      if (file) {
        path = await upload('service-bukti', file, 'service/' + proofForm.service_id)
        filePath = path
      }
      if (!filePath) throw new Error('File bukti wajib dipilih.')
      const payload = { service_id: Number(proofForm.service_id), jenis_bukti: proofForm.jenis_bukti, nama_file: file?.name || proofs.find(p => p.id === editingProofId)?.nama_file || 'Bukti Service', file_path: filePath, keterangan: proofForm.keterangan.trim() || null }
      const result = editingProofId
        ? await supabase.from('service_bukti').update(payload).eq('id', editingProofId).select('*').single()
        : await supabase.from('service_bukti').insert({ ...payload, uploaded_by: profile.id }).select('*').single()
      if (result.error) throw result.error
      if (editingProofId && file && proofs.find(p => p.id === editingProofId)?.file_path) await supabase.storage.from('service-bukti').remove([proofs.find(p => p.id === editingProofId).file_path])
      setProofs(current => editingProofId ? current.map(row => row.id === result.data.id ? result.data : row) : [result.data, ...current])
      emitServiceStateUpdate({ kind: 'proof', proof: result.data })
      setSuccess(editingProofId ? 'Bukti service diperbarui.' : 'Bukti service berhasil diunggah.')
      setFile(null); setEditingProofId(null); setProofForm(emptyProof)
    } catch (err) { if (path) await supabase.storage.from('service-bukti').remove([path]); setError(humanizeError(err)) } finally { setSaving(false) }
  }
  const editProof = proof => { setEditingProofId(proof.id); setProofForm({ service_id: proof.service_id, jenis_bukti: proof.jenis_bukti || 'BON_INVOICE', keterangan: proof.keterangan || '' }); setFile(null); setTab('bukti') }
  const deleteProof = async proof => {
    if (!canProcess) return
    if (!window.confirm('Hapus bukti service ' + proof.nama_file + '?')) return
    setSaving(true)
    try {
      const result = await supabase.from('service_bukti').delete().eq('id', proof.id).select('id').maybeSingle()
      if (result.error) throw result.error
      if (!result.data) throw new Error('Bukti service tidak berhasil dihapus.')
      if (proof.file_path) await supabase.storage.from('service-bukti').remove([proof.file_path])
      setProofs(current => current.filter(row => row.id !== proof.id))
      setSuccess('Bukti service dihapus.')
    } catch (err) { setError(humanizeError(err)) } finally { setSaving(false) }
  }
  const savePart = async e => {
    e.preventDefault(); clearMessages()
    if (!partForm.kendaraan_id || !partForm.alasan_penggantian.trim()) return setError('Kendaraan dan alasan penggantian wajib diisi.')
    if (!editingPartId && !file) return setError('Foto kondisi sebelum wajib diunggah.')
    if (!Number.isFinite(Number(partForm.kilometer)) || Number(partForm.kilometer) < 0) return setError('KM penggantian harus berupa angka 0 atau lebih.')
    if (!Number.isFinite(Number(partForm.biaya || 0)) || Number(partForm.biaya || 0) < 0) return setError('Biaya penggantian tidak valid.')
    const tableName = partForm._type === 'BAN' ? 'riwayat_ban' : 'riwayat_aki'
    const previous = editingPartId ? (partForm._type === 'BAN' ? bans.find(x => x.id === editingPartId) : akis.find(x => x.id === editingPartId)) : null
    const payload = { kendaraan_id: Number(partForm.kendaraan_id), tanggal_penggantian: partForm.tanggal_penggantian, kilometer: Number(partForm.kilometer || 0), kondisi_sebelum: partForm.kondisi_sebelum.trim() || null, alasan_penggantian: partForm.alasan_penggantian.trim(), biaya: Number(partForm.biaya || 0), keterangan: partForm.keterangan.trim() || null, dicatat_oleh: profile.id }
    if (partForm._type === 'BAN') Object.assign(payload, { jumlah_ban: Number(partForm.jumlah_ban || 1), posisi_ban: partForm.posisi_ban || null, merek_ban: partForm.merek_ban || null, ukuran_ban: partForm.ukuran_ban || null })
    else Object.assign(payload, { merek_aki: partForm.merek_aki || null, tipe_aki: partForm.tipe_aki || null, nomor_aki: partForm.nomor_aki || null })
    let uploadedPath = null
    setSaving(true)
    try {
      if (file) { uploadedPath = await upload('service-bukti', file, (partForm._type === 'BAN' ? 'ban/' : 'aki/') + partForm.kendaraan_id, { imagesOnly: true }); payload.foto_sebelum_path = uploadedPath }
      else if (previous?.foto_sebelum_path) payload.foto_sebelum_path = previous.foto_sebelum_path
      const result = editingPartId
        ? await supabase.from(tableName).update(payload).eq('id', editingPartId).select('*').single()
        : await supabase.from(tableName).insert(payload).select('*').single()
      if (result.error) throw result.error
      if (editingPartId && file && previous?.foto_sebelum_path) await supabase.storage.from('service-bukti').remove([previous.foto_sebelum_path])
      if (partForm._type === 'BAN') setBans(current => editingPartId ? current.map(row => row.id === result.data.id ? result.data : row) : [result.data, ...current])
      else setAkis(current => editingPartId ? current.map(row => row.id === result.data.id ? result.data : row) : [result.data, ...current])
      setSuccess(editingPartId ? 'Riwayat penggantian diperbarui.' : 'Riwayat penggantian tersimpan.')
      setFile(null); setEditingPartId(null); setPartForm({ ...emptyPart, _type: partForm._type })
    } catch (err) { if (uploadedPath) await supabase.storage.from('service-bukti').remove([uploadedPath]); setError(humanizeError(err)) } finally { setSaving(false) }
  }
  const editPart = row => {
    const type = tab === 'ban' ? 'BAN' : 'AKI'
    setEditingPartId(row.id); setPartForm({ ...emptyPart, ...row, kendaraan_id: row.kendaraan_id, tanggal_penggantian: row.tanggal_penggantian || emptyPart.tanggal_penggantian, kilometer: row.kilometer ?? '', biaya: row.biaya ?? '', alasan_penggantian: row.alasan_penggantian || '', kondisi_sebelum: row.kondisi_sebelum || '', keterangan: row.keterangan || '', _type: type }); setFile(null)
  }
  const deletePart = async row => {
    if (!canProcess) return
    if (!window.confirm('Hapus riwayat ' + (tab === 'ban' ? 'ban' : 'aki') + '?')) return
    setSaving(true)
    try {
      const tableName = tab === 'ban' ? 'riwayat_ban' : 'riwayat_aki'
      const result = await supabase.from(tableName).delete().eq('id', row.id).select('id').maybeSingle()
      if (result.error) throw result.error
      if (!result.data) throw new Error('Riwayat penggantian tidak berhasil dihapus.')
      if (row.foto_sebelum_path) await supabase.storage.from('service-bukti').remove([row.foto_sebelum_path])
      if (tab === 'ban') setBans(current => current.filter(x => x.id !== row.id)); else setAkis(current => current.filter(x => x.id !== row.id))
      setSuccess('Riwayat penggantian dihapus.')
    } catch (err) { setError(humanizeError(err)) } finally { setSaving(false) }
  }
  const saveKm = async e => {
    e.preventDefault(); clearMessages()
    if (!kmForm.kendaraan_id || kmForm.kilometer === '') return setError('Kendaraan dan KM wajib diisi.')
    const km = Number(kmForm.kilometer)
    const current = Number(vehicleMap[kmForm.kendaraan_id]?.kilometer_terakhir || 0)
    if (!Number.isFinite(km) || km < 0) return setError('KM harus berupa angka 0 atau lebih.')
    if (km < current && !editingKmId) return setError('KM baru tidak boleh lebih kecil dari KM terakhir (' + current + ').')
    setSaving(true)
    try {
      const payload = { kendaraan_id: Number(kmForm.kendaraan_id), tanggal: kmForm.tanggal, kilometer: km, sumber: kmForm.sumber, keterangan: kmForm.keterangan.trim() || null, dicatat_oleh: profile.id }
      const result = editingKmId ? await supabase.from('riwayat_kilometer').update(payload).eq('id', editingKmId).select('*').single() : await supabase.from('riwayat_kilometer').insert(payload).select('*').single()
      if (result.error) throw result.error
      if (km >= current) {
        const vehicleResult = await supabase.from('kendaraan').update({ kilometer_terakhir: km }).eq('id', kmForm.kendaraan_id)
        if (vehicleResult.error) throw vehicleResult.error
        setVehicles(currentRows => currentRows.map(row => row.id === Number(kmForm.kendaraan_id) ? { ...row, kilometer_terakhir: km } : row))
      }
      setKms(currentRows => editingKmId ? currentRows.map(row => row.id === result.data.id ? result.data : row) : [result.data, ...currentRows])
      setSuccess(editingKmId ? 'Riwayat KM diperbarui.' : 'Riwayat KM tersimpan.')
      setEditingKmId(null); setKmForm({ ...emptyKm, tanggal: new Date().toISOString().slice(0, 10) })
    } catch (err) { setError(humanizeError(err)) } finally { setSaving(false) }
  }
  const editKm = row => { setEditingKmId(row.id); setKmForm({ kendaraan_id: row.kendaraan_id, tanggal: row.tanggal, kilometer: row.kilometer, sumber: row.sumber || 'MANUAL', keterangan: row.keterangan || '' }); setTab('km') }
  const deleteKm = async row => {
    if (!canProcess) return
    if (!window.confirm('Hapus riwayat KM ' + Number(row.kilometer || 0).toLocaleString('id-ID') + ' km?')) return
    setSaving(true)
    try {
      const result = await supabase.from('riwayat_kilometer').delete().eq('id', row.id).select('id').maybeSingle()
      if (result.error) throw result.error
      if (!result.data) throw new Error('Riwayat KM tidak berhasil dihapus.')
      setKms(currentRows => currentRows.filter(x => x.id !== row.id))
      setSuccess('Riwayat KM dihapus. KM terakhir kendaraan perlu dicek kembali jika data paling baru ikut terhapus.')
    } catch (err) { setError(humanizeError(err)) } finally { setSaving(false) }
  }
  const openDetail = async s => { setSelected(s); setDetailEdit({ biaya_aktual: s.biaya_aktual ?? s.estimasi_biaya ?? '' }); await ensureServiceDetailData(s.id) }
  const openServiceEdit = s => {
    if (String(s.nomor_service || '').startsWith('IMP-SRV-')) {
      const historyRow = serviceExcelRows.find(row => String(row.service_id) === String(s.id) && row.item_id)
      if (historyRow) {
        openHistoryEdit(historyRow)
        setSelected(null)
        return
      }
    }
    setEditingServiceId(s.id)
    setForm({ ...emptyService, permintaan_service_id: s.permintaan_service_id ?? '', kendaraan_id: s.kendaraan_id ?? '', tanggal_service: s.tanggal_service || new Date().toISOString().slice(0, 10), kilometer: s.kilometer ?? '', bengkel: s.bengkel || '', jenis_service: s.jenis_service || 'SERVICE', keluhan: s.keluhan || '', estimasi_biaya: s.estimasi_biaya ?? '', biaya_aktual: s.biaya_aktual ?? '', nilai_dpp: s.nilai_dpp ?? '', ppn: s.ppn ?? '', total: s.total ?? '', catatan: s.catatan || '' })
    setTab('pekerjaan')
    setSelected(null)
  }
  const deleteService = async s => { if (!canProcess) return; if (!window.confirm(`Hapus service ${s.nomor_service || s.id}? Data ini akan dihapus jika belum memiliki item, bukti, atau approval.`)) return; setSaving(true); try { const [ic,pc,ac] = await Promise.all([supabase.from('service_item').select('id',{count:'exact',head:true}).eq('service_id',s.id),supabase.from('service_bukti').select('id',{count:'exact',head:true}).eq('service_id',s.id),supabase.from('service_approval').select('id',{count:'exact',head:true}).eq('service_id',s.id)]); if(ic.error) throw ic.error; if(pc.error) throw pc.error; if(ac.error) throw ac.error; if((ic.count||0)+(pc.count||0)+(ac.count||0)>0) throw new Error('Service sudah memiliki item, bukti, atau approval. Hapus bagian terkait terlebih dahulu agar histori tidak hilang.'); const result=await supabase.from('service').delete().eq('id',s.id).select('id').maybeSingle(); if(result.error) throw result.error; if(!result.data) throw new Error('Data service tidak berhasil dihapus.'); if(s.permintaan_service_id) await supabase.from('permintaan_service').update({status:'MENUNGGU_TRANSPORT',diproses_oleh:null,diproses_at:null}).eq('id',s.permintaan_service_id); setServices(current=>current.filter(row=>row.id!==s.id)); setSuccess('Data service dihapus.'); } catch(e){setError(humanizeError(e))} finally{setSaving(false)} }
  const openHistoryEdit = row => {
    if (!canProcess) return
    const item = row.item_id ? items.find(entry => String(entry.id) === String(row.item_id)) : null
    if (!item) {
      const service = row.service_id ? services.find(entry => String(entry.id) === String(row.service_id)) : null
      if (service) openServiceEdit(service)
      else setError('Data riwayat tidak terhubung ke rincian atau transaksi service yang dapat diedit.')
      return
    }
    const decoded = decodeExcelMeta(item.keterangan)
    const meta = decoded.meta || {}
    if (meta.source !== 'DATA_SERVICE') {
      editItem(item)
      return
    }
    setHistoryEditingRow({ row, item, meta })
    setHistoryEditForm({
      no: historyNumberInput(row.no),
      merk: row.merk === '-' ? '' : String(row.merk ?? ''),
      type: row.type === '-' ? '' : String(row.type ?? ''),
      jenis: row.jenis === '-' ? '' : String(row.jenis ?? ''),
      tahun: row.tahun === '-' ? '' : String(row.tahun ?? ''),
      nomor_polisi: row.nomor_polisi === '-' ? '' : String(row.nomor_polisi ?? ''),
      driver: row.driver === '-' ? '' : String(row.driver ?? ''),
      bulan: row.bulan === '-' ? '' : String(row.bulan ?? ''),
      tanggal: historyDateInput(row.tanggal),
      jenis_pekerjaan: row.jenis_pekerjaan === '-' ? '' : String(row.jenis_pekerjaan ?? ''),
      uraian: row.uraian === '-' ? String(item.nama_item || '') : String(row.uraian ?? ''),
      qty: historyNumberInput(row.qty === '-' ? item.jumlah : row.qty),
      satuan: row.satuan === '-' ? String(item.satuan || '') : String(row.satuan ?? ''),
      harga_satuan: historyNumberInput(row.harga_satuan === '-' ? item.harga_satuan : row.harga_satuan),
      nilai_dpp: historyNumberInput(row.nilai_dpp === '-' ? item.subtotal : row.nilai_dpp),
      ppn: String(meta.ppn_source ?? meta.ppn ?? ''),
      total: historyNumberInput(row.total === '-' ? item.subtotal : row.total),
      kilometer: historyNumberInput(row.kilometer),
      bengkel: row.bengkel === '-' ? '' : String(row.bengkel ?? ''),
      keterangan: decoded.note || meta.keterangan || (row.keterangan === '-' ? '' : String(row.keterangan ?? '')),
    })
    setError('')
    setSuccess('')
  }

  const updateHistoryAmounts = (field, value) => {
    setHistoryEditForm(current => {
      const next = { ...current, [field]: value }
      if (field === 'qty' || field === 'harga_satuan') {
        if (next.qty !== '' && next.harga_satuan !== '') {
          const dpp = Number(next.qty) * Number(next.harga_satuan)
          const ppn = normalizeHistoryPpn(dpp, next.ppn)
          if (Number.isFinite(dpp) && dpp >= 0) {
            next.nilai_dpp = String(Number(dpp.toFixed(2)))
            if (Number.isFinite(ppn)) next.total = String(Number((dpp + ppn).toFixed(2)))
          }
        }
      } else if (field === 'nilai_dpp' || field === 'ppn') {
        if (next.nilai_dpp !== '') {
          const dpp = Number(next.nilai_dpp)
          const ppn = normalizeHistoryPpn(dpp, next.ppn)
          if (Number.isFinite(dpp) && Number.isFinite(ppn) && dpp >= 0 && ppn >= 0) {
            next.total = String(Number((dpp + ppn).toFixed(2)))
            if (next.qty !== '' && Number(next.qty) > 0) {
              next.harga_satuan = String(Number((dpp / Number(next.qty)).toFixed(2)))
            }
          }
        }
      }
      return next
    })
  }

  const saveHistoryEdit = async event => {
    event.preventDefault()
    if (!canProcess || !historyEditingRow?.item || !historyEditForm) return
    clearMessages()
    const formValue = historyEditForm
    const qty = Number(formValue.qty)
    const price = Number(formValue.harga_satuan || 0)
    const dpp = formValue.nilai_dpp === '' ? qty * price : Number(formValue.nilai_dpp)
    const ppn = normalizeHistoryPpn(dpp, formValue.ppn)
    const total = formValue.total === '' ? dpp + ppn : Number(formValue.total)
    const kilometer = formValue.kilometer === '' ? null : Number(formValue.kilometer)
    const sourceNo = formValue.no === '' ? Number(historyEditingRow.row.no || 1) : Number(formValue.no)
    if (!formValue.tanggal) return setError('Tanggal pada riwayat service wajib diisi.')
    if (!formValue.uraian.trim() && !formValue.jenis_pekerjaan.trim()) return setError('Uraian atau jenis pekerjaan wajib diisi.')
    if (!Number.isFinite(qty) || qty <= 0) return setError('Qty harus lebih besar dari 0.')
    if (![price, dpp, ppn, total].every(Number.isFinite) || [price, dpp, ppn, total].some(value => value < 0)) return setError('Harga, DPP, PPn, dan total harus bernilai 0 atau lebih.')
    // Total pada baris sumber Excel dipertahankan apa adanya. Total header transaksi dihitung terpisah dari DPP + PPn agar Total sumber yang berulang/tidak konsisten tidak menggandakan nilai transaksi.
    if (kilometer !== null && (!Number.isFinite(kilometer) || kilometer < 0)) return setError('KM harus berupa angka 0 atau lebih.')
    if (!Number.isFinite(sourceNo) || sourceNo < 1) return setError('Nomor baris harus berupa angka positif.')
    if (!formValue.satuan.trim()) return setError('Satuan wajib diisi.')

    const item = historyEditingRow.item
    const keterangan = formValue.keterangan.trim()
    const meta = {
      ...historyEditingRow.meta,
      source: 'DATA_SERVICE',
      source_no: sourceNo,
      merk: formValue.merk.trim(),
      type: formValue.type.trim(),
      jenis: formValue.jenis.trim(),
      tahun: formValue.tahun.trim(),
      nomor_polisi: formValue.nomor_polisi.trim(),
      driver: formValue.driver.trim(),
      bulan: formValue.bulan.trim(),
      tanggal: formValue.tanggal,
      jenis_pekerjaan: formValue.jenis_pekerjaan.trim(),
      uraian: formValue.uraian.trim(),
      qty,
      satuan: formValue.satuan.trim(),
      harga_satuan: price,
      nilai_dpp: dpp,
      ppn,
      ppn_source: formValue.ppn.trim() === '' ? '-' : formValue.ppn.trim(),
      total,
      kilometer: kilometer ?? '',
      bengkel: formValue.bengkel.trim(),
      keterangan,
    }
    const payload = {
      nama_item: formValue.uraian.trim() || formValue.jenis_pekerjaan.trim() || item.nama_item,
      kategori: historyWorkCategory(formValue.jenis_pekerjaan, item.kategori),
      jumlah: qty,
      satuan: formValue.satuan.trim(),
      // Match the normalized row's price to the edited DPP so subtotal arithmetic stays consistent.
      harga_satuan: qty > 0 ? dpp / qty : price,
      subtotal: dpp,
      keterangan: encodeExcelMeta(meta, keterangan),
    }
    setSaving(true)
    try {
      const result = await supabase.rpc('update_service_history_item', {
        p_item_id: item.id,
        p_payload: payload,
        p_meta: meta,
      })
      if (result.error) throw result.error
      const saved = result.data
      if (!saved?.item?.id || !saved?.service?.id || !Array.isArray(saved.items)) {
        throw new Error('Penyimpanan riwayat tidak mengembalikan data lengkap. Muat ulang untuk memastikan status terkini.')
      }
      const refreshedItems = new Map(saved.items.map(entry => [String(entry.id), entry]))
      setItems(current => current.map(entry => refreshedItems.get(String(entry.id)) || entry))
      setServices(current => current.map(entry => String(entry.id) === String(saved.service.id) ? saved.service : entry))
      if (saved.request?.id) {
        setRequests(current => current.map(entry => String(entry.id) === String(saved.request.id) ? saved.request : entry))
      }
      emitServiceStateUpdate({ kind: 'service', service: saved.service, ...(saved.request?.id ? { request: saved.request } : {}) })
      setHistoryEditingRow(null)
      setHistoryEditForm(null)
      setSuccess('Riwayat service, rincian transaksi, dan total terkait berhasil diperbarui.')
    } catch (saveError) {
      setError(humanizeError(saveError))
    } finally {
      setSaving(false)
    }
  }

  const tabs = canProcess
    ? [['pekerjaan', 'Data Service'], ['excel', 'Riwayat Service'], ['item', 'Item Service'], ['bukti', 'Bukti'], ['ban', 'Riwayat Ban'], ['aki', 'Riwayat Aki'], ['km', 'Riwayat KM']]
    : [['pekerjaan', 'Data Service'], ['excel', 'Riwayat Excel']]
  return <div className="x-page"><Header breadcrumb={tabs.find(([v]) => v === tab)?.[1]} eyebrow="SERVICE & MAINTENANCE" title="Service & Perbaikan" text="Kelola data service langsung dari sistem: pekerjaan, biaya, item, bukti, ban, aki, kilometer, dan approval." action={<div className="x-head-actions">{canProcess && <button className="x-btn primary" onClick={() => { setTab('pekerjaan'); setEditingServiceId(null); setForm({ ...emptyService, tanggal_service: new Date().toISOString().slice(0, 10) }) }}>+ Tambah Service</button>}<button className="x-btn secondary" onClick={load}>↻ Refresh</button></div>} />{error && <Alert type="error">{error}</Alert>}{success && <Alert>{success}</Alert>}<div className="x-tabs">{tabs.map(([v, l]) => <button key={v} className={tab === v ? 'active' : ''} onClick={() => { clearMessages(); setTab(v) }}>{l}</button>)}</div>{tab === 'excel' && <section className={`x-card service-excel-card ${serviceExcelFullscreen ? 'service-excel-card-fullscreen' : ''}`}>
    <div className="x-card-title service-excel-card-title">
      <div>
        <h3>Riwayat Service — Format Data Service Excel</h3>
        <p>Kolom mengikuti sheet Data Service: No, Merk, Type, Jenis, Tahun, No. Polisi, Driver/PIC, Bulan, Tanggal, Jenis Pekerjaan, Uraian, Qty, Sat, Harga Satuan, Nilai DPP, PPn, Total, KM, Nama Bengkel, Keterangan.</p>
      </div>
      <button type="button" className="x-btn secondary service-excel-fullscreen-button" onClick={() => setServiceExcelFullscreen(current => !current)} aria-label={serviceExcelFullscreen ? 'Tutup tampilan penuh' : 'Buka tampilan tabel penuh'}>
        {serviceExcelFullscreen ? 'Tutup Tampilan Penuh' : '↗ Tampilan Penuh'}
      </button>
    </div>
    <div className="service-excel-wide-body">
      <div className="service-excel-scroll-label"><span>Geser kolom secara horizontal</span><small>Baris tetap di tempat, scrollbar tersedia di bagian atas</small></div>
      <div className="service-excel-top-scroll" ref={serviceExcelTopScrollRef} onScroll={syncServiceExcelFromTop} aria-label="Geser tabel secara horizontal">
        <div style={{ width: `${serviceExcelScrollWidth}px`, height: '1px' }} />
      </div>
      <div className="x-table-wrap" ref={serviceExcelWrapRef} onScroll={syncServiceExcelFromTable}>
        <table className="x-table service-excel-table">
          <thead><tr><th>No</th><th>Merk</th><th>Type</th><th>Jenis</th><th>Tahun</th><th>No. Polisi</th><th>Driver/PIC</th><th>Bulan</th><th>Tanggal</th><th>Jenis Pekerjaan</th><th>Uraian</th><th>Qty</th><th>Sat</th><th>Harga Satuan (Rp)</th><th>Nilai DPP</th><th>PPn</th><th className="service-excel-col-total">Total</th><th>KM</th><th>Nama Bengkel</th><th>Keterangan</th><th>Aksi</th></tr></thead>
          <tbody>{serviceExcelRows.length ? serviceExcelRows.map(row => <tr key={`${row.no}-${row.nomor_polisi}-${row.tanggal}-${row.uraian}`}><td>{row.no}</td><td>{row.merk}</td><td>{row.type}</td><td>{row.jenis}</td><td>{row.tahun}</td><td>{row.nomor_polisi}</td><td>{row.driver}</td><td>{row.bulan}</td><td>{row.tanggal}</td><td>{row.jenis_pekerjaan}</td><td><button type="button" className="table-long-text table-long-text-button" title={row.service_id ? 'Buka detail service' : row.uraian} onClick={() => { const service = row.service_id ? services.find(item => item.id === row.service_id) : null; if (service) openDetail(service) }}>{row.uraian}</button></td><td>{row.qty}</td><td>{row.satuan}</td><td>{money(row.harga_satuan)}</td><td>{money(row.nilai_dpp)}</td><td>{row.ppn === '-' ? '-' : money(row.ppn)}</td><td className="service-excel-col-total">{money(row.total)}</td><td>{row.kilometer}</td><td>{row.bengkel}</td><td>{row.keterangan}</td><td className="x-action-compact">{canProcess ? <button type="button" className="x-link" onClick={() => openHistoryEdit(row)} disabled={saving}>Edit</button> : <span className="x-note">Lihat saja</span>}</td></tr>) : <tr><td colSpan="21"><Empty text="Belum ada riwayat service." /></td></tr>}</tbody>
        </table>
      </div>
    </div>
  </section>}{tab === 'pekerjaan' && <><section className="x-card">{canProcess && <><div className="x-card-title"><h3>{editingServiceId ? 'Edit Data Service' : 'Tambah Data Service'}</h3><p>Pengajuan opsional. Admin dapat mencatat service langsung tanpa kembali ke Excel.</p></div><form className="x-grid" onSubmit={saveService}><label>Pengajuan (opsional)<select value={form.permintaan_service_id} onChange={e => { const r = requests.find(x => String(x.id) === e.target.value); setForm(f => ({ ...f, permintaan_service_id: e.target.value, kendaraan_id: r?.kendaraan_id || f.kendaraan_id, kilometer: r?.kilometer_pengajuan ?? vehicleMap[r?.kendaraan_id]?.kilometer_terakhir ?? f.kilometer, jenis_service: r?.jenis_permintaan || f.jenis_service || 'SERVICE', keluhan: r?.keluhan || f.keluhan })) }}><option value="">Tanpa Pengajuan</option>{pending.map(r => <option key={r.id} value={r.id}>{r.nomor_pengajuan || `#${r.id}`} — {TYPES[r.jenis_permintaan] || r.jenis_permintaan}</option>)}</select></label><label>Kendaraan<select value={form.kendaraan_id} onChange={e => setForm(f => ({ ...f, kendaraan_id: e.target.value }))}><option value="">Pilih</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.nomor_polisi} — {v.merk} {v.tipe || ''}</option>)}</select></label><label>Tanggal<input type="date" value={form.tanggal_service} onChange={e => setForm(f => ({ ...f, tanggal_service: e.target.value }))} /></label><label>KM<input type="number" min="0" value={form.kilometer} onChange={e => setForm(f => ({ ...f, kilometer: e.target.value }))} /></label><label>Bengkel<input value={form.bengkel} onChange={e => setForm(f => ({ ...f, bengkel: e.target.value }))} /></label><label>Jenis<select value={form.jenis_service} onChange={e => setForm(f => ({ ...f, jenis_service: e.target.value }))}>{Object.entries(TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label><label>Estimasi Biaya<input type="number" min="0" value={form.estimasi_biaya} onChange={e => setForm(f => ({ ...f, estimasi_biaya: e.target.value }))} /></label><label>Biaya Aktual<input type="number" min="0" value={form.biaya_aktual} onChange={e => setForm(f => ({ ...f, biaya_aktual: e.target.value }))} /></label><label className="full">Keluhan<input value={form.keluhan} onChange={e => setForm(f => ({ ...f, keluhan: e.target.value }))} /></label><label className="full">Catatan<textarea value={form.catatan} onChange={e => setForm(f => ({ ...f, catatan: e.target.value }))} /></label><div className="full x-actions"><button type="button" className="x-btn secondary" onClick={() => { setEditingServiceId(null); setForm({ ...emptyService, tanggal_service: new Date().toISOString().slice(0, 10) }) }} disabled={saving}>Bersihkan</button><button className="x-btn primary" disabled={saving}>{saving ? 'Menyimpan…' : editingServiceId ? 'Perbarui Service' : 'Simpan Service'}</button></div></form></>}</section><section className="x-card"><div className="x-card-title"><div><h3>Daftar Service</h3><p>Cari berdasarkan BM/nomor polisi, merk, type, bengkel, atau keluhan. Aksi detail, edit, dan hapus dibuat ringkas agar tabel tetap bersih.</p></div></div><div className="x-toolbar-inline"><input value={serviceSearch} onChange={e => setServiceSearch(e.target.value)} placeholder="Cari BM, merk, type, bengkel..." /><select value={serviceVehicleFilter} onChange={e => setServiceVehicleFilter(e.target.value)}><option value="SEMUA">Semua kendaraan</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.nomor_polisi} — {v.merk}</option>)}</select></div>{loading ? <Empty text="Memuat…" /> : filteredServices.length === 0 ? <Empty text="Belum ada service yang cocok." /> : <div className="x-table-wrap"><table className="x-table"><thead><tr><th>No</th><th>Merk</th><th>Type</th><th>No. Polisi</th><th>Jenis</th><th>Tanggal</th><th>KM</th><th>Bengkel</th><th>Uraian</th><th>Total</th><th>Aksi</th></tr></thead><tbody>{filteredServices.map((s, index) => { const vehicle=vehicleMap[s.kendaraan_id]; const lineItems=items.filter(i=>i.service_id===s.id); const uraian=lineItems.length?lineItems.map(i=>i.nama_item).filter(Boolean).join(' • '):(s.keluhan||'-'); const total=Number(s.total ?? s.biaya_aktual ?? s.estimasi_biaya ?? 0); return <tr key={s.id}><td>{index+1}</td><td><b>{vehicle?.merk||'-'}</b></td><td>{vehicle?.tipe||'-'}</td><td><b>{vehicle?.nomor_polisi||'-'}</b></td><td>{TYPES[s.jenis_service]||s.jenis_service||'-'}</td><td>{dateText(s.tanggal_service)}</td><td>{Number(s.kilometer||0).toLocaleString('id-ID')} km</td><td>{s.bengkel||'-'}</td><td><div className="table-long-text" title={uraian}>{uraian}</div></td><td><b>{money(total)}</b></td><td className="x-action-compact"><button className="x-link" onClick={()=>openDetail(s)}>Detail</button>{canOpenApproval(s)&&<button className="x-link primary" onClick={()=>{ const required=requiredApprovalRole(s); setApprovalNote(''); setApprovalModal({ service:s, required }) }}>Approval</button>}{canProcess&&<button className="x-link" onClick={()=>openServiceEdit(s)}>Edit</button>}{canProcess&&<button className="x-link danger" onClick={()=>deleteService(s)} disabled={saving}>Hapus</button>}</td></tr>})}</tbody></table></div>}</section></>}{tab === 'item' && <><section className="x-card">{canProcess && <><div className="x-card-title"><h3>{editingItemId ? 'Edit Item Service' : 'Tambah Item Service'}</h3><p>Catat jasa, suku cadang, oli, ban, atau aki dengan jumlah dan harga satuan.</p></div><form className="x-grid" onSubmit={saveItem}><label>Service<select value={itemForm.service_id} onChange={e => setItemForm(f => ({ ...f, service_id: e.target.value }))}><option value="">Pilih</option>{services.map(s => <option key={s.id} value={s.id}>{s.nomor_service || `#${s.id}`}</option>)}</select></label><label>Nama Item<input value={itemForm.nama_item} onChange={e => setItemForm(f => ({ ...f, nama_item: e.target.value }))} /></label><label>Kategori<select value={itemForm.kategori} onChange={e => setItemForm(f => ({ ...f, kategori: e.target.value }))}><option value="JASA">Jasa</option><option value="SPAREPART">Sparepart</option><option value="OLI">Oli</option><option value="BAN">Ban</option><option value="AKI">Aki</option><option value="LAINNYA">Lainnya</option></select></label><label>Jumlah<input type="number" min="0" step="0.01" value={itemForm.jumlah} onChange={e => setItemForm(f => ({ ...f, jumlah: e.target.value }))} /></label><label>Satuan<input value={itemForm.satuan} onChange={e => setItemForm(f => ({ ...f, satuan: e.target.value }))} /></label><label>Harga Satuan<input type="number" min="0" value={itemForm.harga_satuan} onChange={e => setItemForm(f => ({ ...f, harga_satuan: e.target.value }))} /></label><label className="full">Keterangan<input value={itemForm.keterangan} onChange={e => setItemForm(f => ({ ...f, keterangan: e.target.value }))} /></label><div className="full x-actions"><button type="button" className="x-btn secondary" onClick={() => { setEditingItemId(null); setItemForm(emptyItem) }}>Bersihkan</button><button className="x-btn primary" disabled={saving}>{editingItemId ? 'Perbarui Item' : 'Simpan Item'}</button></div></form></>}</section><section className="x-card"><div className="x-table-wrap"><table className="x-table"><thead><tr><th>Service</th><th>Item</th><th>Kategori</th><th>Jumlah</th><th>Harga</th><th>Subtotal</th><th>Aksi</th></tr></thead><tbody>{items.length ? items.map(i => <tr key={i.id}><td>#{i.service_id}</td><td>{i.nama_item}</td><td>{i.kategori || '-'}</td><td>{i.jumlah} {i.satuan}</td><td>{money(i.harga_satuan)}</td><td>{money(i.subtotal)}</td><td className="x-action-compact"><button className="x-link" onClick={() => setSelectedItem(i)}>Detail</button>{canProcess && <button className="x-link" onClick={() => editItem(i)}>Edit</button>}{canProcess && <button className="x-link danger" onClick={() => deleteItem(i)} disabled={saving}>Hapus</button>}</td></tr>) : <tr><td colSpan="7"><Empty /></td></tr>}</tbody></table></div></section></>}{tab === 'bukti' && <><section className="x-card">{canProcess && <><div className="x-card-title"><h3>{editingProofId ? 'Edit Bukti Service' : 'Upload Bukti Service'}</h3><p>Gunakan invoice/bon atau foto sebagai dokumentasi pekerjaan.</p></div><form className="x-grid" onSubmit={saveProof}><label>Service<select value={proofForm.service_id} onChange={e => setProofForm(f => ({ ...f, service_id: e.target.value }))}><option value="">Pilih</option>{services.map(s => <option key={s.id} value={s.id}>{s.nomor_service || `#${s.id}`}</option>)}</select></label><label>Jenis Bukti<select value={proofForm.jenis_bukti} onChange={e => setProofForm(f => ({ ...f, jenis_bukti: e.target.value }))}><option value="BON_INVOICE">Invoice / Bon</option><option value="FOTO_SEBELUM">Foto Sebelum</option><option value="FOTO_SESUDAH">Foto Sesudah</option><option value="FOTO_KM">Foto KM</option><option value="DOKUMEN_LAINNYA">Dokumen Lainnya</option></select></label><label>File<input type="file" accept={DOCUMENT_UPLOAD_ACCEPT} onChange={e => setFile(e.target.files?.[0] || null)} /></label><label className="full">Keterangan<input value={proofForm.keterangan} onChange={e => setProofForm(f => ({ ...f, keterangan: e.target.value }))} /></label><div className="full x-actions"><button type="button" className="x-btn secondary" onClick={() => { setEditingProofId(null); setProofForm(emptyProof); setFile(null) }}>Bersihkan</button><button className="x-btn primary" disabled={saving}>{editingProofId ? 'Perbarui Bukti' : 'Upload Bukti'}</button></div></form></>}</section><section className="x-card">{proofs.length === 0 ? <Empty /> : <div className="x-table-wrap"><table className="x-table"><thead><tr><th>Service</th><th>Jenis</th><th>File</th><th>Aksi</th></tr></thead><tbody>{proofs.map(p => <tr key={p.id}><td>#{p.service_id}</td><td>{p.jenis_bukti}</td><td>{p.nama_file}</td><td className="x-action-compact"><button className="x-link" onClick={async () => { try { const u = await signed('service-bukti', p.file_path); if (u) window.open(u, '_blank', 'noopener,noreferrer') } catch (e) { setError(humanizeError(e)) } }}>Lihat</button>{canProcess && <button className="x-link" onClick={() => editProof(p)}>Edit</button>}{canProcess && <button className="x-link danger" onClick={() => deleteProof(p)} disabled={saving}>Hapus</button>}</td></tr>)}</tbody></table></div>}</section></>}{(tab === 'ban' || tab === 'aki') && <><section className="x-card">{canProcess && <><div className="x-card-title"><h3>{editingPartId ? 'Edit Riwayat ' : 'Catat Penggantian '}{tab === 'ban' ? 'Ban' : 'Aki / Baterai'}</h3><p>Foto kondisi sebelum menjadi dokumentasi. Saat edit, foto lama tetap digunakan bila tidak diganti.</p></div><form className="x-grid" onSubmit={savePart}><label>Kendaraan<select value={partForm.kendaraan_id} onChange={e => setPartForm(f => ({ ...f, kendaraan_id: e.target.value, _type: tab.toUpperCase() }))}><option value="">Pilih</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.nomor_polisi} — {v.merk}</option>)}</select></label><label>Tanggal<input type="date" value={partForm.tanggal_penggantian} onChange={e => setPartForm(f => ({ ...f, tanggal_penggantian: e.target.value, _type: tab.toUpperCase() }))} /></label><label>KM<input type="number" min="0" value={partForm.kilometer} onChange={e => setPartForm(f => ({ ...f, kilometer: e.target.value }))} /></label><label>Alasan<input value={partForm.alasan_penggantian} onChange={e => setPartForm(f => ({ ...f, alasan_penggantian: e.target.value }))} /></label><label>Kondisi Sebelum<input value={partForm.kondisi_sebelum} onChange={e => setPartForm(f => ({ ...f, kondisi_sebelum: e.target.value }))} /></label><label>Biaya<input type="number" min="0" value={partForm.biaya} onChange={e => setPartForm(f => ({ ...f, biaya: e.target.value }))} /></label>{tab === 'ban' ? <><label>Jumlah Ban<input type="number" min="1" value={partForm.jumlah_ban || 1} onChange={e => setPartForm(f => ({ ...f, jumlah_ban: e.target.value, _type: 'BAN' }))} /></label><label>Posisi Ban<input value={partForm.posisi_ban || ''} onChange={e => setPartForm(f => ({ ...f, posisi_ban: e.target.value, _type: 'BAN' }))} /></label><label>Merek Ban<input value={partForm.merek_ban || ''} onChange={e => setPartForm(f => ({ ...f, merek_ban: e.target.value, _type: 'BAN' }))} /></label><label>Ukuran<input value={partForm.ukuran_ban || ''} onChange={e => setPartForm(f => ({ ...f, ukuran_ban: e.target.value, _type: 'BAN' }))} /></label></> : <><label>Merek Aki<input value={partForm.merek_aki || ''} onChange={e => setPartForm(f => ({ ...f, merek_aki: e.target.value, _type: 'AKI' }))} /></label><label>Tipe Aki<input value={partForm.tipe_aki || ''} onChange={e => setPartForm(f => ({ ...f, tipe_aki: e.target.value, _type: 'AKI' }))} /></label><label>Nomor Aki<input value={partForm.nomor_aki || ''} onChange={e => setPartForm(f => ({ ...f, nomor_aki: e.target.value, _type: 'AKI' }))} /></label></>}<label className="full">Foto Kondisi Sebelum<input type="file" accept={IMAGE_UPLOAD_ACCEPT} onChange={e => setFile(e.target.files?.[0] || null)} /></label><label className="full">Keterangan<input value={partForm.keterangan} onChange={e => setPartForm(f => ({ ...f, keterangan: e.target.value }))} /></label><div className="full x-actions"><button type="button" className="x-btn secondary" onClick={() => { setEditingPartId(null); setFile(null); setPartForm({ ...emptyPart, _type: tab.toUpperCase() }) }}>Bersihkan</button><button className="x-btn primary" disabled={saving}>{editingPartId ? 'Perbarui Riwayat' : 'Simpan Riwayat'}</button></div></form></>}</section><section className="x-card"><div className="x-table-wrap"><table className="x-table"><thead><tr><th>Kendaraan</th><th>Tanggal</th><th>KM</th><th>Alasan</th><th>Biaya</th><th>Aksi</th></tr></thead><tbody>{(tab === 'ban' ? bans : akis).map(r => <tr key={r.id}><td>{vehicleMap[r.kendaraan_id]?.nomor_polisi || '-'}</td><td>{dateText(r.tanggal_penggantian)}</td><td>{Number(r.kilometer || 0).toLocaleString('id-ID')} km</td><td>{r.alasan_penggantian || '-'}</td><td>{money(r.biaya)}</td><td className="x-action-compact"><button className="x-link" onClick={() => setSelectedPart(r)}>Detail</button>{canProcess && <button className="x-link" onClick={() => editPart(r)}>Edit</button>}{canProcess && <button className="x-link danger" onClick={() => deletePart(r)} disabled={saving}>Hapus</button>}</td></tr>)}</tbody></table></div></section></>}{tab === 'km' && <><section className="x-card">{canProcess && <><div className="x-card-title"><h3>{editingKmId ? 'Edit Riwayat Kilometer' : 'Catat Kilometer'}</h3><p>KM dipakai untuk menghitung jarak pemakaian kendaraan.</p></div><form className="x-grid" onSubmit={saveKm}><label>Kendaraan<select value={kmForm.kendaraan_id} onChange={e => setKmForm(f => ({ ...f, kendaraan_id: e.target.value }))}><option value="">Pilih</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.nomor_polisi} — terakhir {Number(v.kilometer_terakhir || 0).toLocaleString('id-ID')} km</option>)}</select></label><label>Tanggal<input type="date" value={kmForm.tanggal} onChange={e => setKmForm(f => ({ ...f, tanggal: e.target.value }))} /></label><label>KM<input type="number" min="0" value={kmForm.kilometer} onChange={e => setKmForm(f => ({ ...f, kilometer: e.target.value }))} /></label><label>Sumber<select value={kmForm.sumber} onChange={e => setKmForm(f => ({ ...f, sumber: e.target.value }))}><option>SERVICE</option><option>PERMINTAAN</option><option>PEMERIKSAAN</option><option>MANUAL</option><option>LAINNYA</option></select></label><label className="full">Keterangan<input value={kmForm.keterangan} onChange={e => setKmForm(f => ({ ...f, keterangan: e.target.value }))} /></label><div className="full x-actions"><button type="button" className="x-btn secondary" onClick={() => { setEditingKmId(null); setKmForm(emptyKm) }}>Bersihkan</button><button className="x-btn primary" disabled={saving}>{editingKmId ? 'Perbarui KM' : 'Simpan KM'}</button></div></form></>}</section><section className="x-card"><div className="x-table-wrap"><table className="x-table"><thead><tr><th>Kendaraan</th><th>Tanggal</th><th>KM</th><th>Sumber</th><th>Keterangan</th><th>Aksi</th></tr></thead><tbody>{kms.map(k => <tr key={k.id}><td>{vehicleMap[k.kendaraan_id]?.nomor_polisi || '-'}</td><td>{dateText(k.tanggal)}</td><td>{Number(k.kilometer || 0).toLocaleString('id-ID')} km</td><td>{k.sumber || '-'}</td><td>{k.keterangan || '-'}</td><td className="x-action-compact"><button className="x-link" onClick={() => setSelectedKm(k)}>Detail</button>{canProcess && <button className="x-link" onClick={() => editKm(k)}>Edit</button>}{canProcess && <button className="x-link danger" onClick={() => deleteKm(k)} disabled={saving}>Hapus</button>}</td></tr>)}</tbody></table></div></section></>}
    {selected && <div className="x-overlay"><section className="x-modal x-modal-wide"><div className="x-modal-head"><div><span className="eyebrow">DETAIL SERVICE</span><h3>{selected.nomor_service || '#' + selected.id}</h3><small>{vehicleMap[selected.kendaraan_id]?.nomor_polisi || '-'} • {vehicleMap[selected.kendaraan_id]?.merk || '-'} {vehicleMap[selected.kendaraan_id]?.tipe || ''}</small></div><button onClick={() => setSelected(null)}>×</button></div>
      <div className="x-detail x-detail-grid">
        <p><b>Tanggal:</b> {dateText(selected.tanggal_service)}</p><p><b>KM:</b> {Number(selected.kilometer || 0).toLocaleString('id-ID')} km</p><p><b>Bengkel:</b> {selected.bengkel || '-'}</p><p><b>Jenis:</b> {TYPES[selected.jenis_service] || selected.jenis_service || '-'}</p>
        <p><b>Status:</b> {STAT[selected.status] || selected.status}</p><p><b>Approval:</b> {approvedCount(selected)} kali{additionalApprovalRequired(selected) ? ' — tambahan diperlukan' : ''}</p>
        <p><b>Estimasi:</b> {money(selected.estimasi_biaya)}</p><p><b>Biaya Aktual:</b> {money(selected.biaya_aktual)}</p><p><b>Total:</b> {money(selected.total ?? selected.biaya_aktual ?? selected.estimasi_biaya)}</p><p><b>Bukti:</b> {proofs.filter(p => p.service_id === selected.id).length} file</p>
        <div className="full"><b>Keluhan / Uraian:</b><p>{selected.keluhan || '-'}</p></div>
        <div className="full"><b>Rincian Item Service</b><div className="x-table-wrap detail-inner-table"><table className="x-table"><thead><tr><th>Item</th><th>Kategori</th><th>Qty</th><th>Harga</th><th>Subtotal</th></tr></thead><tbody>{items.filter(item => item.service_id === selected.id).length ? items.filter(item => item.service_id === selected.id).map(item => <tr key={item.id}><td>{item.nama_item}</td><td>{item.kategori || '-'}</td><td>{item.jumlah} {item.satuan}</td><td>{money(item.harga_satuan)}</td><td>{money(item.subtotal)}</td></tr>) : <tr><td colSpan="5">Belum ada item service.</td></tr>}</tbody></table></div></div>
      </div>
      <div className="x-actions"><button className="x-btn secondary" onClick={() => setSelected(null)}>Tutup</button>{canOpenApproval(selected) && <button className="x-btn primary" onClick={() => { const required = requiredApprovalRole(selected); setApprovalNote(''); setApprovalModal({ service: selected, required }); setSelected(null) }}>Approval</button>}{canProcess && <button className="x-btn secondary" onClick={() => openServiceEdit(selected)}>Edit Service</button>}{canProcess && ['DISETUJUI', 'DALAM_PENGERJAAN'].includes(selected.status) && <><label className="x-inline-field">Biaya Aktual<input type="number" min="0" value={detailEdit.biaya_aktual} onChange={e => setDetailEdit({ biaya_aktual: e.target.value })} /></label><button className="x-btn secondary" onClick={updateActual} disabled={saving}>Simpan Biaya</button>{proofs.some(proof => proof.service_id === selected.id) ? <button className="x-btn primary" onClick={() => finish({ ...selected, biaya_aktual: Number(detailEdit.biaya_aktual || 0) })} disabled={saving}>Selesaikan Service</button> : <span className="x-note">Upload minimal satu bukti service sebelum menyelesaikan.</span>}</>}</div>
    </section></div>}
    {selectedItem && <div className="x-overlay"><section className="x-modal"><div className="x-modal-head"><div><span className="eyebrow">DETAIL ITEM</span><h3>{selectedItem.nama_item}</h3></div><button onClick={() => setSelectedItem(null)}>×</button></div><div className="x-detail"><p><b>Service:</b> #{selectedItem.service_id}</p><p><b>Kategori:</b> {selectedItem.kategori || '-'}</p><p><b>Jumlah:</b> {selectedItem.jumlah} {selectedItem.satuan || ''}</p><p><b>Harga Satuan:</b> {money(selectedItem.harga_satuan)}</p><p><b>Subtotal:</b> {money(selectedItem.subtotal)}</p><p><b>Keterangan:</b> {selectedItem.keterangan || '-'}</p></div><div className="x-actions"><button className="x-btn secondary" onClick={() => setSelectedItem(null)}>Tutup</button></div></section></div>}
    {selectedPart && <div className="x-overlay"><section className="x-modal"><div className="x-modal-head"><div><span className="eyebrow">DETAIL PENGGANTIAN</span><h3>{tab === 'ban' ? 'Ban' : 'Aki / Baterai'}</h3></div><button onClick={() => setSelectedPart(null)}>×</button></div><div className="x-detail"><p><b>Kendaraan:</b> {vehicleMap[selectedPart.kendaraan_id]?.nomor_polisi || '-'}</p><p><b>Tanggal:</b> {dateText(selectedPart.tanggal_penggantian)}</p><p><b>KM:</b> {Number(selectedPart.kilometer || 0).toLocaleString('id-ID')} km</p><p><b>Alasan:</b> {selectedPart.alasan_penggantian || '-'}</p><p><b>Biaya:</b> {money(selectedPart.biaya)}</p><p><b>Keterangan:</b> {selectedPart.keterangan || '-'}</p></div><div className="x-actions"><button className="x-btn secondary" onClick={() => setSelectedPart(null)}>Tutup</button><button className="x-btn primary" onClick={() => { setSelectedPart(null); editPart(selectedPart) }}>Edit</button></div></section></div>}
    {selectedKm && <div className="x-overlay"><section className="x-modal"><div className="x-modal-head"><div><span className="eyebrow">DETAIL KILOMETER</span><h3>{vehicleMap[selectedKm.kendaraan_id]?.nomor_polisi || '-'}</h3></div><button onClick={() => setSelectedKm(null)}>×</button></div><div className="x-detail"><p><b>Tanggal:</b> {dateText(selectedKm.tanggal)}</p><p><b>KM:</b> {Number(selectedKm.kilometer || 0).toLocaleString('id-ID')} km</p><p><b>Sumber:</b> {selectedKm.sumber || '-'}</p><p><b>Keterangan:</b> {selectedKm.keterangan || '-'}</p></div><div className="x-actions"><button className="x-btn secondary" onClick={() => setSelectedKm(null)}>Tutup</button><button className="x-btn primary" onClick={() => { setSelectedKm(null); editKm(selectedKm) }}>Edit</button></div></section></div>}
    {historyEditingRow && historyEditForm && <div className="x-overlay"><section className="x-modal history-row-editor" role="dialog" aria-modal="true" aria-labelledby="history-row-editor-title">
      <form onSubmit={saveHistoryEdit}>
        <div className="x-modal-head"><div><span className="eyebrow">EDIT RIWAYAT SERVICE</span><h3 id="history-row-editor-title">Perbarui baris riwayat</h3><small>Perubahan disimpan ke rincian service dan metadata historis baris ini.</small></div><button type="button" onClick={() => { setHistoryEditingRow(null); setHistoryEditForm(null) }} aria-label="Tutup editor riwayat">×</button></div>
        <div className="x-grid history-row-form">
          <label>No<input type="number" min="1" step="1" value={historyEditForm.no} onChange={e => setHistoryEditForm(f => ({ ...f, no: e.target.value }))} required /></label>
          <label>Merk<input value={historyEditForm.merk} onChange={e => setHistoryEditForm(f => ({ ...f, merk: e.target.value }))} /></label>
          <label>Type<input value={historyEditForm.type} onChange={e => setHistoryEditForm(f => ({ ...f, type: e.target.value }))} /></label>
          <label>Jenis kendaraan<input value={historyEditForm.jenis} onChange={e => setHistoryEditForm(f => ({ ...f, jenis: e.target.value }))} /></label>
          <label>Tahun<input value={historyEditForm.tahun} onChange={e => setHistoryEditForm(f => ({ ...f, tahun: e.target.value }))} /></label>
          <label>No. Polisi<input value={historyEditForm.nomor_polisi} onChange={e => setHistoryEditForm(f => ({ ...f, nomor_polisi: e.target.value }))} /></label>
          <label>Driver/PIC<input value={historyEditForm.driver} onChange={e => setHistoryEditForm(f => ({ ...f, driver: e.target.value }))} /></label>
          <label>Bulan<input value={historyEditForm.bulan} onChange={e => setHistoryEditForm(f => ({ ...f, bulan: e.target.value }))} /></label>
          <label>Tanggal<input type="date" value={historyEditForm.tanggal} onChange={e => setHistoryEditForm(f => ({ ...f, tanggal: e.target.value }))} required /></label>
          <label>Jenis pekerjaan<input value={historyEditForm.jenis_pekerjaan} onChange={e => setHistoryEditForm(f => ({ ...f, jenis_pekerjaan: e.target.value }))} /></label>
          <label>Uraian<input value={historyEditForm.uraian} onChange={e => setHistoryEditForm(f => ({ ...f, uraian: e.target.value }))} /></label>
          <label>Qty<input type="number" min="0.01" step="any" value={historyEditForm.qty} onChange={e => updateHistoryAmounts('qty', e.target.value)} required /></label>
          <label>Satuan<input value={historyEditForm.satuan} onChange={e => setHistoryEditForm(f => ({ ...f, satuan: e.target.value }))} required /></label>
          <label>Harga satuan (Rp)<input type="number" min="0" step="any" value={historyEditForm.harga_satuan} onChange={e => updateHistoryAmounts('harga_satuan', e.target.value)} required /></label>
          <label>Nilai DPP (Rp)<input type="number" min="0" step="any" value={historyEditForm.nilai_dpp} onChange={e => updateHistoryAmounts('nilai_dpp', e.target.value)} /></label>
          <label>PPn (nilai sumber Excel)<input type="number" min="0" step="any" value={historyEditForm.ppn} onChange={e => updateHistoryAmounts('ppn', e.target.value)} /></label>
          <label>Total (Rp)<input type="number" min="0" step="any" value={historyEditForm.total} onChange={e => setHistoryEditForm(f => ({ ...f, total: e.target.value }))} /></label>
          <label>KM<input type="number" min="0" step="any" value={historyEditForm.kilometer} onChange={e => setHistoryEditForm(f => ({ ...f, kilometer: e.target.value }))} /></label>
          <label>Nama bengkel<input value={historyEditForm.bengkel} onChange={e => setHistoryEditForm(f => ({ ...f, bengkel: e.target.value }))} /></label>
          <label className="full">Keterangan<textarea value={historyEditForm.keterangan} onChange={e => setHistoryEditForm(f => ({ ...f, keterangan: e.target.value }))} rows="3" /></label>
        </div>
        <div className="x-actions"><button type="button" className="x-btn secondary" onClick={() => { setHistoryEditingRow(null); setHistoryEditForm(null) }} disabled={saving}>Batal</button><button type="submit" className="x-btn primary" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan Perubahan'}</button></div>
      </form>
    </section></div>}
    {approvalModal && <div className="x-overlay"><section className="x-modal"><div className="x-modal-head"><div><span className="eyebrow">APPROVAL SERVICE</span><h3>{approvalModal.service.nomor_service || `#${approvalModal.service.id}`}</h3></div><button onClick={() => setApprovalModal(null)}>×</button></div><div className="x-detail"><p><b>Nilai yang dinilai:</b> {money(Number(approvalModal.service.biaya_aktual ?? approvalModal.service.estimasi_biaya ?? 0))}</p><p><b>Approval ke:</b> {approvalList(approvalModal.service).length + 1}</p><p><b>Pemberi approval:</b> {approvalModal.required === 'DIREKTUR' ? 'Direktur' : 'Atasan Transport'}</p><label>Catatan Approval<textarea value={approvalNote} onChange={e => setApprovalNote(e.target.value)} placeholder="Opsional" /></label><div className="x-actions"><button className="x-btn secondary" onClick={() => setApprovalModal(null)}>Batal</button><button className="x-btn danger" onClick={() => confirmApproval(false)} disabled={saving}>Tolak</button><button className="x-btn primary" onClick={() => confirmApproval(true)} disabled={saving}>Setujui</button></div></div></section></div>}
  </div>
}