import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import LoginPage from './modules/LoginPage.jsx'
import { exportToExcel } from './utils/exportExcel'
import KendaraanPage from './modules/KendaraanPage'
import PermintaanServicePage from './modules/PermintaanServicePage'
import DashboardFeaturePage from './modules/DashboardFeaturePage'
import { ServicePage, RentalPage, DocumentsPage, ReportsPage, UsersPage } from './modules/TransportOperationsPage'
import DataPageTools from './modules/DataPageTools'
import './App.css'
import { decodeExcelMeta } from './utils/excelSourceMeta.js'
import { formatMonthSafe } from './utils/dateSafe'

const LOGO_BASE_URL = 'https://raw.githubusercontent.com/muhammadsuryahar-bot/Sistem-Transport-ZT/main/frontend/src/assets'
const LOGO_MARK_URL = `${LOGO_BASE_URL}/logo.png`

const ROLE_LABELS = { ADMIN: 'Administrator', TRANSPORT: 'Transport', OPERASIONAL: 'Operasional', ATASAN_TRANSPORT: 'Atasan Transport', DIREKTUR: 'Direktur', AKUNTANSI: 'Akuntansi' }
const ROLE_ACCESS = {
  ADMIN: ['dashboard', 'kendaraan', 'pengajuan', 'service', 'sewa', 'dokumen', 'laporan', 'pengguna'],
  TRANSPORT: ['dashboard', 'kendaraan', 'pengajuan', 'service', 'sewa', 'dokumen', 'laporan'],
  OPERASIONAL: ['dashboard', 'pengajuan'],
  ATASAN_TRANSPORT: ['dashboard', 'pengajuan', 'service', 'laporan'],
  DIREKTUR: ['dashboard', 'service', 'laporan'],
  AKUNTANSI: ['dashboard', 'sewa', 'laporan'],
}
const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'kendaraan', label: 'Kendaraan', icon: 'vehicle' },
  { id: 'pengajuan', label: 'Pengajuan Service', icon: 'request' },
  { id: 'service', label: 'Service & Perbaikan', icon: 'service' },
  { id: 'sewa', label: 'Administrasi Sewa', icon: 'rental' },
  { id: 'dokumen', label: 'Dokumen', icon: 'document' },
  { id: 'laporan', label: 'Laporan', icon: 'report' },
  { id: 'pengguna', label: 'Pengguna', icon: 'user' },
]

const columns = keys => keys.map(([key, label]) => ({ key, label }))
const cleanRows = rows => rows.map(row => ({ ...row }))

function AppTransport() {
  const [session, setSession] = useState(null), [profile, setProfile] = useState(null), [activePage, setActivePage] = useState('dashboard'), [sidebarOpen, setSidebarOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false), [errorMessage, setErrorMessage] = useState('')
  const [authLoading, setAuthLoading] = useState(true)
  const [, setExportingPage] = useState(false)
  const allowedPages = useMemo(() => ROLE_ACCESS[profile?.role] || ['dashboard'], [profile?.role])
  const visibleNavItems = useMemo(() => NAV_ITEMS.filter((item) => allowedPages.includes(item.id)), [allowedPages])
  const navigateToPage = (page) => {
    if (!page || !allowedPages.includes(page)) return
    setActivePage(page)
    localStorage.setItem('transport_active_page', page)
  }

  const loadProfile = async (userId) => { const { data, error } = await supabase.from('profiles').select('id,nama_lengkap,email,nomor_hp,role,aktif').eq('id', userId).single(); if (error || !data) { console.error('Profile error:', error); setProfile(null); setErrorMessage('Profil pengguna tidak dapat dimuat.'); return } if (!data.aktif) { await supabase.auth.signOut(); setSession(null); setProfile(null); setErrorMessage('Akun ini sedang dinonaktifkan. Hubungi administrator.'); return } setProfile(data); setErrorMessage('') }
  useEffect(() => {
    let mounted = true
    const initialize = async () => {
      const { data, error } = await supabase.auth.getSession()
      if (!mounted) return
      if (error) setErrorMessage('Sesi login tidak dapat diperiksa. Silakan coba lagi.')
      setSession(data.session)
      if (data.session?.user) await loadProfile(data.session.user.id)
      if (mounted) setAuthLoading(false)
    }
    initialize()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return
      setSession(nextSession)
      if (nextSession?.user) {
        window.setTimeout(() => {
          if (mounted) loadProfile(nextSession.user.id)
        }, 0)
      } else {
        setProfile(null)
      }
      if (mounted) setAuthLoading(false)
    })
    return () => { mounted = false; subscription.unsubscribe() }
  }, [])
  useEffect(() => { if (session && profile && !allowedPages.includes(activePage)) setActivePage('dashboard') }, [activePage, allowedPages, profile, session])
  useEffect(() => {
    if (!session || !profile) return
    const savedPage = localStorage.getItem('transport_active_page')
    if (savedPage && allowedPages.includes(savedPage) && savedPage !== activePage) setActivePage(savedPage)
  }, [session, profile, allowedPages, activePage])
  const handleLogout = async () => { setSubmitting(true); await supabase.auth.signOut(); setSession(null); setProfile(null); localStorage.removeItem('transport_active_page'); setActivePage('dashboard'); setSubmitting(false) }

  const exportCurrentPage = async () => {
    if (!profile || activePage === 'dashboard' || activePage === 'pengguna') return
    setExportingPage(true)
    setErrorMessage('')
    try {
      const stamp = new Date().toISOString().slice(0, 10)
      if (activePage === 'kendaraan') {
        const [v, d] = await Promise.all([
          supabase.from('kendaraan').select('*').order('nomor_polisi'),
          supabase.from('driver').select('*').order('nama_lengkap'),
        ])
        if (v.error) throw v.error
        if (d.error) throw d.error
        const driverMap = Object.fromEntries((d.data || []).map(x => [x.id, x]))
        exportToExcel(`Rekap-Kendaraan-ZT-${stamp}.xls`, [
          { title: 'KENDARAAN', columns: columns([['no_export','No'],['merk','Merk'],['tipe','Type'],['jenis_kendaraan','Jenis'],['tahun','Tahun'],['nomor_polisi','No. Pol'],['nomor_mesin','No. Mesin'],['nomor_rangka','No. Rangka'],['pemilik','Pemilik'],['kepemilikan','Kepemilikan'],['foto_stnk','Foto STNK'],['masa_berlaku_pajak','Masa Berlaku Pajak'],['status_pajak','Status Pajak'],['unit_kerja','Unit Kerja'],['driver','Driver'],['lokasi','Lokasi Kerja'],['keterangan','Keterangan'],['catatan_hutang','Catatan Hutang']]), rows: cleanRows(v.data || []).map((x, index) => ({ ...x, no_export: index + 1, kepemilikan: x.kepemilikan === 'ASET' || x.kepemilikan === 'ASET_KANTOR' ? 'Aset' : x.kepemilikan === 'SEWA' || x.kepemilikan === 'RENTAL' || x.kepemilikan === 'KENDARAAN_SEWA' ? 'Sewa' : '-', foto_stnk: x.foto_stnk_path ? 'ADA' : 'BELUM ADA', driver: driverMap[x.driver_id]?.nama_lengkap || '-' })) },
          { title: 'DRIVER / PIC', columns: columns([['nama_lengkap','Nama'],['nomor_hp','Nomor HP'],['nomor_sim','Nomor SIM'],['masa_berlaku_sim','Masa Berlaku SIM'],['lokasi','Lokasi'],['status','Status'],['keterangan','Keterangan']]), rows: cleanRows(d.data || []) },
        ])
      } else if (activePage === 'pengajuan') {
        const [{ data: requests, error: requestError }, { data: vehicles, error: vehicleError }] = await Promise.all([
          supabase.from('permintaan_service').select('*').order('created_at', { ascending: false }),
          supabase.from('kendaraan').select('id,nomor_polisi,merk,tipe,lokasi,unit_kerja').order('nomor_polisi'),
        ])
        if (requestError) throw requestError
        if (vehicleError) throw vehicleError
        const vehicleMap = Object.fromEntries((vehicles || []).map(x => [x.id, x]))
        const requestIds = (requests || []).map(x => x.id)
        const { data: requestServices, error: requestServiceError } = requestIds.length ? await supabase.from('service').select('permintaan_service_id,biaya_aktual,estimasi_biaya,total').in('permintaan_service_id', requestIds) : { data: [], error: null }
        if (requestServiceError) throw requestServiceError
        const requestCostMap = Object.fromEntries((requestServices || []).map(s => [s.permintaan_service_id, s.total ?? s.biaya_aktual ?? s.estimasi_biaya ?? null]))
        const sourceRequestRows = (requests || []).map((x, index) => { const v = vehicleMap[x.kendaraan_id]; const { meta } = decodeExcelMeta(x.catatan_transport); return { no: Number(meta?.source_no) || index + 1, homebase: meta?.homebase || v?.lokasi || '-', unit_kendaraan: meta?.unit_kendaraan || v?.unit_kerja || '-', nomor_polisi: v?.nomor_polisi || '-', merk: meta?.merk || v?.merk || '-', type: meta?.type || v?.tipe || '-', tanggal: x.tanggal_pengajuan || '-', biaya: meta?.biaya != null ? Number(meta.biaya) : requestCostMap[x.id], keterangan: x.keluhan || '-' } })
        exportToExcel(`Rekap-Pengajuan-Service-ZT-${stamp}.xls`, [{ title: 'REKAPAN PERMINTAAN', columns: columns([['no','No'],['homebase','Homebase'],['unit_kendaraan','Unit Kendaraan'],['nomor_polisi','No Polisi'],['merk','Merk'],['type','Type'],['tanggal','Tanggal'],['biaya','Biaya (Rp)'],['keterangan','Keterangan']]), rows: sourceRequestRows }, { title: 'PENGAJUAN SERVICE', columns: columns([['nomor_pengajuan','Nomor Pengajuan'],['tanggal_pengajuan','Tanggal Pengajuan'],['pemohon_id','ID Pemohon'],['kendaraan','Nomor Polisi'],['kendaraan_detail','Merk / Tipe'],['kilometer_pengajuan','KM Pengajuan'],['jenis_permintaan','Jenis Permintaan'],['keluhan','Keluhan'],['prioritas','Prioritas'],['status','Status'],['catatan_transport','Catatan Transport'],['diproses_oleh','Diproses Oleh'],['diproses_at','Diproses At']]), rows: cleanRows(requests || []).map(x => ({ ...x, kendaraan: vehicleMap[x.kendaraan_id]?.nomor_polisi || '-', kendaraan_detail: vehicleMap[x.kendaraan_id] ? `${vehicleMap[x.kendaraan_id].merk || ''}${vehicleMap[x.kendaraan_id].tipe ? ` • ${vehicleMap[x.kendaraan_id].tipe}` : ''}` : '-' })) }])
      } else if (activePage === 'service') {
        const rs = await Promise.all([
          supabase.from('service').select('*').order('created_at', { ascending: false }),
          supabase.from('service_item').select('*').order('created_at', { ascending: false }),
          supabase.from('service_approval').select('*').order('waktu_approval', { ascending: false }),
          supabase.from('service_bukti').select('*').order('created_at', { ascending: false }),
          supabase.from('riwayat_ban').select('*').order('tanggal_penggantian', { ascending: false }),
          supabase.from('riwayat_aki').select('*').order('tanggal_penggantian', { ascending: false }),
          supabase.from('riwayat_kilometer').select('*').order('tanggal', { ascending: false }),
          supabase.from('kendaraan').select('id,nomor_polisi,merk,tipe,jenis_kendaraan,tahun,driver_id'),
          supabase.from('permintaan_service').select('id,nomor_pengajuan'),
          supabase.from('driver').select('id,nama_lengkap').order('nama_lengkap'),
        ])
        const names = ['service','item','approval','bukti','ban','aki','kilometer','kendaraan','pengajuan','driver']
        rs.forEach((r, i) => { if (r.error) throw new Error(`${names[i]}: ${r.error.message}`) })
        const vehicleMap = Object.fromEntries((rs[7].data || []).map(x => [x.id, x]))
        const requestMap = Object.fromEntries((rs[8].data || []).map(x => [x.id, x]))
        const driverMapExport = Object.fromEntries((rs[9].data || []).map(x => [x.id, x]))
        const serviceMapExport = Object.fromEntries((rs[0].data || []).map(x => [x.id, x]))
        const sourceServiceRows = []
        ;(rs[1].data || []).forEach((item, index) => { const s = (rs[0].data || []).find(row => row.id === item.service_id); const v = vehicleMap[s?.kendaraan_id]; const { meta, note } = decodeExcelMeta(item.keterangan); const source = meta?.source === 'DATA_SERVICE' ? meta : null; sourceServiceRows.push({ no: Number(source?.source_no) || index + 1, merk: source?.merk || v?.merk || '-', type: source?.type || v?.tipe || '-', jenis: source?.jenis || v?.jenis_kendaraan || '-', tahun: source?.tahun || v?.tahun || '-', nomor_polisi: source?.nomor_polisi || v?.nomor_polisi || '-', driver: source?.driver || driverMapExport[v?.driver_id]?.nama_lengkap || '-', bulan: source?.bulan || (s?.tanggal_service ? formatMonthSafe(s.tanggal_service) : '-'), tanggal: source?.tanggal || s?.tanggal_service || '-', jenis_pekerjaan: source?.jenis_pekerjaan || s?.jenis_service || '-', uraian: source?.uraian || item.nama_item || '-', qty: source?.qty ?? item.jumlah ?? '-', satuan: source?.satuan || item.satuan || '-', harga_satuan: source?.harga_satuan ?? item.harga_satuan ?? '-', nilai_dpp: source?.nilai_dpp ?? item.subtotal ?? '-', ppn: source?.ppn_source ?? source?.ppn ?? '-', total: source?.total ?? item.subtotal ?? '-', kilometer: source?.kilometer ?? s?.kilometer ?? '-', bengkel: source?.bengkel || s?.bengkel || '-', keterangan: note || source?.keterangan || s?.catatan || '-' }) })
        exportToExcel(`Rekap-Service-ZT-${stamp}.xls`, [
          { title: 'DATA SERVICE', columns: columns([['no','No'],['merk','Merk'],['type','Type'],['jenis','Jenis'],['tahun','Tahun'],['nomor_polisi','No. Polisi'],['driver','Driver/PIC'],['bulan','Bulan'],['tanggal','Tanggal'],['jenis_pekerjaan','Jenis Pekerjan'],['uraian','Uraian'],['qty','Qty'],['satuan','Sat'],['harga_satuan','Harga Satuan (Rp)'],['nilai_dpp','Nilai DPP'],['ppn','PPn'],['total','Total'],['kilometer','KM'],['bengkel','Nama Bengkel'],['keterangan','Keterangan']]), rows: sourceServiceRows },
          { title: 'SERVICE', columns: columns([['nomor_service','Nomor Service'],['nomor_pengajuan','Nomor Pengajuan'],['nomor_polisi','Nomor Polisi'],['tanggal_service','Tanggal Service'],['kilometer','KM'],['bengkel','Bengkel'],['jenis_service','Jenis Service'],['keluhan','Keluhan'],['estimasi_biaya','Estimasi Biaya'],['biaya_aktual','Biaya Aktual'],['status','Status'],['catatan','Catatan']]), rows: cleanRows(rs[0].data || []).map(x => ({ ...x, nomor_pengajuan: requestMap[x.permintaan_service_id]?.nomor_pengajuan || '-', nomor_polisi: vehicleMap[x.kendaraan_id]?.nomor_polisi || '-' })) },
          { title: 'ITEM SERVICE', columns: columns([['nomor_service','Nomor Service'],['nomor_polisi','No. Polisi'],['nama_item','Nama Item'],['kategori','Kategori'],['jumlah','Jumlah'],['satuan','Satuan'],['harga_satuan','Harga Satuan'],['subtotal','Subtotal'],['keterangan','Keterangan']]), rows: cleanRows(rs[1].data || []).map(x => ({ ...x, nomor_service: serviceMapExport[x.service_id]?.nomor_service || '-', nomor_polisi: vehicleMap[serviceMapExport[x.service_id]?.kendaraan_id]?.nomor_polisi || '-' })) },
          { title: 'APPROVAL', columns: columns([['nomor_service','Nomor Service'],['nomor_polisi','No. Polisi'],['urutan','Urutan'],['jenis_approval','Jenis Approval'],['pemberi_approval','Pemberi Approval (ID)'],['status','Status'],['waktu_approval','Waktu Approval'],['catatan','Catatan']]), rows: cleanRows(rs[2].data || []).map(x => ({ ...x, nomor_service: serviceMapExport[x.service_id]?.nomor_service || '-', nomor_polisi: vehicleMap[serviceMapExport[x.service_id]?.kendaraan_id]?.nomor_polisi || '-' })) },
          { title: 'BUKTI SERVICE', columns: columns([['nomor_service','Nomor Service'],['nomor_polisi','No. Polisi'],['jenis_bukti','Jenis Bukti'],['nama_file','Nama File'],['file_status','File'],['keterangan','Keterangan'],['uploaded_by','Uploaded By (ID)'],['created_at','Dibuat']]), rows: cleanRows(rs[3].data || []).map(x => ({ ...x, nomor_service: serviceMapExport[x.service_id]?.nomor_service || '-', nomor_polisi: vehicleMap[serviceMapExport[x.service_id]?.kendaraan_id]?.nomor_polisi || '-', file_status: x.file_path ? 'ADA' : 'BELUM ADA' })) },
          { title: 'RIWAYAT BAN', columns: columns([['kendaraan_id','Kendaraan ID'],['tanggal_penggantian','Tanggal'],['kilometer','KM'],['jumlah_ban','Jumlah Ban'],['posisi_ban','Posisi'],['kondisi_sebelum','Kondisi Sebelum'],['merek_ban','Merk Ban'],['ukuran_ban','Ukuran'],['alasan_penggantian','Alasan'],['biaya','Biaya'],['foto_sebelum_path','Foto Sebelum'],['foto_sesudah_path','Foto Sesudah'],['bukti_path','Bukti']]), rows: cleanRows(rs[4].data || []).map(x => ({ ...x, kendaraan_id: vehicleMap[x.kendaraan_id]?.nomor_polisi || x.kendaraan_id })) },
          { title: 'RIWAYAT AKI', columns: columns([['kendaraan_id','Kendaraan ID'],['tanggal_penggantian','Tanggal'],['kilometer','KM'],['merek_aki','Merk Aki'],['tipe_aki','Tipe Aki'],['nomor_aki','Nomor Aki'],['kondisi_sebelum','Kondisi Sebelum'],['alasan_penggantian','Alasan'],['biaya','Biaya'],['foto_sebelum_path','Foto Sebelum'],['foto_sesudah_path','Foto Sesudah'],['bukti_path','Bukti']]), rows: cleanRows(rs[5].data || []).map(x => ({ ...x, kendaraan_id: vehicleMap[x.kendaraan_id]?.nomor_polisi || x.kendaraan_id })) },
          { title: 'RIWAYAT KILOMETER', columns: columns([['kendaraan_id','Kendaraan ID'],['tanggal','Tanggal'],['kilometer','KM'],['sumber','Sumber'],['keterangan','Keterangan'],['dicatat_oleh','Dicatat Oleh']]), rows: cleanRows(rs[6].data || []).map(x => ({ ...x, kendaraan_id: vehicleMap[x.kendaraan_id]?.nomor_polisi || x.kendaraan_id })) },
        ])
      } else if (activePage === 'sewa') {
        const rs = await Promise.all([
          supabase.from('pemilik_sewa').select('*').order('nama_pemilik'),
          supabase.from('kontrak_sewa').select('*').order('created_at', { ascending: false }),
          supabase.from('pembayaran_sewa').select('*').order('bulan_pembayaran', { ascending: false }),
          supabase.from('perbaikan_sewa').select('*').order('tanggal_kejadian', { ascending: false }),
          supabase.from('potongan_pembayaran_sewa').select('*').order('created_at', { ascending: false }),
          supabase.from('kendaraan').select('id,nomor_polisi,merk,tipe,pemilik,lokasi,unit_kerja,kepemilikan').eq('kepemilikan', 'SEWA').order('nomor_polisi'),
        ])
        const names = ['pemilik','kontrak','pembayaran','perbaikan','potongan','kendaraan']
        rs.forEach((r, i) => { if (r.error) throw new Error(`${names[i]}: ${r.error.message}`) })
        const vehicleMap = Object.fromEntries((rs[5].data || []).map(x => [x.id, x]))
        const ownerMap = Object.fromEntries((rs[0].data || []).map(x => [x.id, x]))
        const contractMap = Object.fromEntries((rs[1].data || []).map(x => [x.id, x]))
        const paymentMap = Object.fromEntries((rs[2].data || []).map(x => [x.id, x]))
        const repairMap = Object.fromEntries((rs[3].data || []).map(x => [x.id, x]))
        const rentalVehicleRows = (rs[5].data || []).map((v, index) => { const c = (rs[1].data || []).find(row => Number(row.kendaraan_id) === Number(v.id) && row.status === 'AKTIF') || (rs[1].data || []).find(row => Number(row.kendaraan_id) === Number(v.id)); const o = ownerMap[c?.pemilik_sewa_id]; return { no: index + 1, nomor_polisi: v.nomor_polisi || '-', merk: v.merk || '-', tipe: v.tipe || '-', pemilik: o?.nama_pemilik || v.pemilik || '-', perusahaan: o?.nama_perusahaan || '-', lokasi: v.lokasi || '-', unit_kerja: v.unit_kerja || '-', nomor_kontrak: c?.nomor_kontrak || '-', tanggal_mulai: c?.tanggal_mulai || '-', tanggal_selesai: c?.tanggal_selesai || '-', nilai_sewa_bulanan: c?.nilai_sewa_bulanan ?? '-', status_kontrak: c?.status || 'BELUM ADA KONTRAK' } })
        exportToExcel(`Rekap-Administrasi-Sewa-ZT-${stamp}.xls`, [
          { title: 'DAFTAR SEWA', columns: columns([['no','No'],['nomor_polisi','No. Polisi'],['merk','Merk'],['tipe','Type'],['pemilik','Pemilik'],['perusahaan','Perusahaan/Rental'],['lokasi','Lokasi'],['unit_kerja','Unit Kerja'],['nomor_kontrak','No. Kontrak'],['tanggal_mulai','Tanggal Mulai'],['tanggal_selesai','Tanggal Selesai'],['nilai_sewa_bulanan','Sewa Bulanan'],['status_kontrak','Status Kontrak']]), rows: rentalVehicleRows },
          { title: 'PEMILIK SEWA', columns: columns([['jenis_pemilik','Jenis Pemilik'],['nama_pemilik','Nama Pemilik'],['nomor_hp','Nomor HP'],['email','Email'],['alamat','Alamat'],['nomor_identitas','Nomor Identitas'],['nama_perusahaan','Nama Perusahaan'],['nomor_rekening','Nomor Rekening'],['nama_bank','Nama Bank'],['aktif','Aktif'],['keterangan','Keterangan']]), rows: cleanRows(rs[0].data || []) },
          { title: 'KONTRAK SEWA', columns: columns([['nomor_kontrak','Nomor Kontrak'],['nomor_polisi','Nomor Polisi'],['pemilik','Pemilik'],['tanggal_mulai','Tanggal Mulai'],['tanggal_selesai','Tanggal Selesai'],['periode_bulan','Periode'],['nilai_sewa_bulanan','Sewa Bulanan'],['tanggal_jatuh_tempo_bulanan','Jatuh Tempo'],['status','Status'],['catatan','Catatan']]), rows: cleanRows(rs[1].data || []).map(x => ({ ...x, nomor_polisi: vehicleMap[x.kendaraan_id]?.nomor_polisi || '-', pemilik: ownerMap[x.pemilik_sewa_id]?.nama_pemilik || '-' })) },
          { title: 'PEMBAYARAN SEWA', columns: columns([['nomor_kontrak','No. Kontrak'],['nomor_polisi','No. Polisi'],['pemilik','Pemilik'],['periode_ke','Periode Ke'],['bulan_pembayaran','Bulan Pembayaran'],['tanggal_jatuh_tempo','Jatuh Tempo'],['tanggal_pembayaran','Tanggal Pembayaran'],['jumlah_tagihan','Tagihan'],['jumlah_dibayar','Dibayar'],['status','Status'],['metode_pembayaran','Metode'],['nomor_referensi','Referensi'],['bukti_status','Bukti'],['catatan','Catatan']]), rows: cleanRows(rs[2].data || []).map(x => ({ ...x, nomor_kontrak: contractMap[x.kontrak_sewa_id]?.nomor_kontrak || '-', nomor_polisi: vehicleMap[contractMap[x.kontrak_sewa_id]?.kendaraan_id]?.nomor_polisi || '-', pemilik: ownerMap[contractMap[x.kontrak_sewa_id]?.pemilik_sewa_id]?.nama_pemilik || '-', bukti_status: x.bukti_pembayaran_path ? 'ADA' : 'BELUM ADA' })) },
          { title: 'RENTAL HISTORIS', columns: columns([['no_excel','No'],['tahun','Tahun'],['supplier','Supplier'],['uraian','Uraian'],['periode_tagihan','Periode Tagihan'],['nilai_invoice','Nilai Invoice']]), rows: (rs[2].data || []).map((p, index) => { const c = contractMap[p.kontrak_sewa_id]; const o = ownerMap[c?.pemilik_sewa_id]; const { meta } = decodeExcelMeta(p.catatan); const d = p.bulan_pembayaran ? new Date(`${p.bulan_pembayaran}T00:00:00`) : null; return meta?.source === 'SUMMERY_RENTAL' ? { no_excel: Number(meta.source_no) || index + 1, tahun: meta.tahun || '-', supplier: meta.supplier || '-', uraian: meta.uraian || '-', periode_tagihan: meta.periode_tagihan || '-', nilai_invoice: meta.nilai_invoice ?? p.jumlah_tagihan } : { no_excel: index + 1, tahun: d && !Number.isNaN(d.getTime()) ? d.getFullYear() : '-', supplier: o?.nama_pemilik || o?.nama_perusahaan || '-', uraian: p.catatan || '-', periode_tagihan: d && !Number.isNaN(d.getTime()) ? formatMonthSafe(d) : '-', nilai_invoice: p.jumlah_tagihan } }) },
          { title: 'PERBAIKAN KENDARAAN SEWA', columns: columns([['nomor_perbaikan','Nomor Perbaikan'],['nomor_kontrak','No. Kontrak'],['nomor_polisi','Nomor Polisi'],['tanggal_kejadian','Tanggal Kejadian'],['kilometer','KM'],['jenis_kerusakan','Jenis Kerusakan'],['deskripsi_kerusakan','Deskripsi'],['penyebab','Penyebab'],['estimasi_biaya','Estimasi'],['biaya_aktual','Aktual'],['metode_penanganan','Metode'],['dibayar_kantor','Dibayar Kantor'],['tanggal_dibayar','Tanggal Dibayar'],['pemilik_diberitahu','Pemilik Diberitahu'],['status','Status'],['dapat_dipotong','Dapat Dipotong'],['jumlah_dipotong','Potongan'],['foto_status','Foto Kerusakan'],['bukti_status','Bukti Perbaikan'],['catatan','Catatan']]), rows: cleanRows(rs[3].data || []).map(x => ({ ...x, nomor_kontrak: contractMap[x.kontrak_sewa_id]?.nomor_kontrak || '-', nomor_polisi: vehicleMap[x.kendaraan_id]?.nomor_polisi || '-', foto_status: x.foto_kerusakan_path ? 'ADA' : 'BELUM ADA', bukti_status: x.bukti_perbaikan_path ? 'ADA' : 'BELUM ADA' })) },
          { title: 'POTONGAN PEMBAYARAN SEWA', columns: columns([['nomor_kontrak','No. Kontrak'],['nomor_polisi','No. Polisi'],['nomor_perbaikan','Nomor Perbaikan'],['jumlah_potongan','Jumlah Potongan'],['catatan','Catatan']]), rows: cleanRows(rs[4].data || []).map(x => ({ ...x, nomor_kontrak: contractMap[paymentMap[x.pembayaran_sewa_id]?.kontrak_sewa_id]?.nomor_kontrak || '-', nomor_polisi: vehicleMap[contractMap[paymentMap[x.pembayaran_sewa_id]?.kontrak_sewa_id]?.kendaraan_id]?.nomor_polisi || '-', nomor_perbaikan: repairMap[x.perbaikan_sewa_id]?.nomor_perbaikan || '-' })) },
        ])
      } else if (activePage === 'dokumen') {
        const [{ data: documents, error: documentError }, { data: vehicles, error: vehicleError }] = await Promise.all([
          supabase.from('dokumen_kendaraan').select('*').order('tanggal_jatuh_tempo', { ascending: true }),
          supabase.from('kendaraan').select('id,nomor_polisi,merk,tipe,tahun,nomor_rangka,pemilik,foto_stnk_path').order('nomor_polisi'),
        ])
        if (documentError) throw documentError
        if (vehicleError) throw vehicleError
        const vehicleMap = Object.fromEntries((vehicles || []).map(x => [x.id, x]))
        const documentByVehicle = {}
        ;(documents || []).forEach(doc => { documentByVehicle[doc.kendaraan_id] = documentByVehicle[doc.kendaraan_id] || {}; documentByVehicle[doc.kendaraan_id][doc.jenis_dokumen] = doc })
        const monitoringRows = (vehicles || []).map((v, index) => { const docsForVehicle = documentByVehicle[v.id] || {}; const sourceDoc = Object.values(docsForVehicle).find(doc => decodeExcelMeta(doc.keterangan).meta?.source === 'STNK_DAN_KIR'); const { meta } = sourceDoc ? decodeExcelMeta(sourceDoc.keterangan) : { meta: null }; return { no: Number(meta?.source_no) || index + 1, merk: meta?.merk || v.merk || '-', tipe: meta?.type || v.tipe || '-', nomor_polisi: meta?.nomor_polisi || v.nomor_polisi || '-', tahun: meta?.tahun || v.tahun || '-', nomor_rangka: meta?.nomor_rangka || v.nomor_rangka || '-', stnk: docsForVehicle.STNK?.tanggal_jatuh_tempo || '-', foto_stnk: v.foto_stnk_path ? 'ADA' : 'BELUM ADA', kir: docsForVehicle.KIR?.tanggal_jatuh_tempo || '-', lima_tahun: docsForVehicle['5_TAHUNAN']?.tanggal_jatuh_tempo || '-', pemilik: meta ? (meta.pemilik || '-') : (v.pemilik || '-') } })
        exportToExcel(`Rekap-Dokumen-Kendaraan-ZT-${stamp}.xls`, [{ title: 'STNK DAN KIR', columns: columns([['no','NO'],['merk','MERK'],['tipe','TYPE'],['nomor_polisi','NO.POLISI'],['tahun','TAHUN'],['nomor_rangka','No Ranka'],['stnk','STNK'],['foto_stnk','FOTO STNK'],['kir','KIR'],['lima_tahun','5 TAHUN'],['pemilik','PEMILIK']]), rows: monitoringRows }, { title: 'DOKUMEN KENDARAAN', columns: columns([['kendaraan','Nomor Polisi'],['jenis_dokumen','Jenis Dokumen'],['nomor_dokumen','Nomor Dokumen'],['tanggal_terbit','Tanggal Terbit'],['tanggal_berlaku_mulai','Berlaku Mulai'],['tanggal_jatuh_tempo','Jatuh Tempo'],['file_status','File'],['keterangan','Keterangan']]), rows: cleanRows(documents || []).map(x => ({ ...x, kendaraan: vehicleMap[x.kendaraan_id]?.nomor_polisi || '-', file_status: x.file_path ? 'ADA' : 'BELUM ADA' })) }])
      }
    } catch (error) {
      console.error('Export error:', error)
      setErrorMessage(`Export gagal: ${error?.message || 'Data tidak dapat diekspor.'}`)
    } finally {
      setExportingPage(false)
    }
  }

  if (authLoading) return <div className="app-loading-screen"><div className="app-loading-card"><strong>PT ZAMAN TEKNINDO</strong><span>Memeriksa sesi login…</span></div></div>
  if (!session) return <LoginPage message={errorMessage} />
  if (!profile && errorMessage) return <LoginPage message={errorMessage} />
  if (!profile) return <div className="app-loading-screen"><div className="app-loading-card"><strong>PT ZAMAN TEKNINDO</strong><span>Memuat profil pengguna…</span></div></div>

  const pageContent = { dashboard: <DashboardFeaturePage profile={profile} onNavigate={navigateToPage}/>, kendaraan: <KendaraanPage profile={profile} onNavigate={navigateToPage}/>, pengajuan: <PermintaanServicePage profile={profile}/>, service: <ServicePage profile={profile}/>, sewa: <RentalPage profile={profile}/>, dokumen: <DocumentsPage profile={profile}/>, laporan: <ReportsPage profile={profile} />, pengguna: <UsersPage profile={profile} /> }
  return <div className="dashboard-layout">{sidebarOpen && <button className="sidebar-overlay" onClick={() => setSidebarOpen(false)} aria-label="Tutup menu"/>}<aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}><div className="sidebar-brand"><div className="sidebar-brand-mark"><img src={LOGO_MARK_URL} alt=""/></div><div className="sidebar-brand-copy"><strong>PT ZAMAN TEKNINDO</strong><span>Sistem Transport</span></div></div><div className="nav-section-label">MENU UTAMA</div><nav className="sidebar-nav" aria-label="Navigasi utama">{visibleNavItems.map((item) => <button key={item.id} className={`nav-item ${activePage === item.id ? 'active' : ''}`} onClick={() => { navigateToPage(item.id); setSidebarOpen(false) }}><span className="nav-icon" data-icon={item.icon} aria-hidden="true"/><span>{item.label}</span></button>)}</nav><div className="sidebar-bottom"><div className="user-mini"><div className="avatar">{(profile?.nama_lengkap || profile?.email || 'U').charAt(0).toUpperCase()}</div><div className="user-mini-text"><strong>{profile?.nama_lengkap || 'Pengguna'}</strong><span>{ROLE_LABELS[profile?.role] || profile?.role}</span></div></div><button className="logout-button" onClick={handleLogout} disabled={submitting}>Keluar</button></div></aside><main className="main-content"><header className="topbar"><button className="menu-button" onClick={() => setSidebarOpen(true)} aria-label="Buka menu">☰</button><div><span className="topbar-label">SISTEM TRANSPORT</span><h1>{NAV_ITEMS.find((item) => item.id === activePage)?.label || 'Dashboard'}</h1></div><div className="topbar-user"><div className="avatar">{(profile?.nama_lengkap || profile?.email || 'U').charAt(0).toUpperCase()}</div><div><strong>{profile?.nama_lengkap || profile?.email}</strong><span>{ROLE_LABELS[profile?.role] || profile?.role}</span></div></div></header><div className="content-container"><DataPageTools context={activePage} profile={profile} onExport={exportCurrentPage}/>{pageContent[activePage] || pageContent.dashboard}</div></main></div>
}

export default AppTransport