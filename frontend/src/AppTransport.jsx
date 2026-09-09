import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import { exportToExcel } from './utils/exportExcel'
import KendaraanPage from './modules/KendaraanPage'
import PermintaanServicePage from './modules/PermintaanServicePage'
import DashboardFeaturePage from './modules/DashboardFeaturePage'
import { ServicePage, RentalPage, DocumentsPage, ReportsPage, UsersPage } from './modules/TransportOperationsPage'
import ImportExcelPage from './modules/ImportExcelPage'
import './App.css'

const REMEMBERED_EMAIL_KEY = 'transport_remembered_email'
const LOGO_BASE_URL = 'https://raw.githubusercontent.com/muhammadsuryahar-bot/Sistem-Transport-ZT/main/frontend/src/assets'
const LOGO_LOGIN_URL = `${LOGO_BASE_URL}/logo-login.png`
const LOGO_MARK_URL = `${LOGO_BASE_URL}/logo.png`

const ROLE_LABELS = { ADMIN: 'Administrator', TRANSPORT: 'Transport', OPERASIONAL: 'Operasional', ATASAN_TRANSPORT: 'Atasan Transport', DIREKTUR: 'Direktur', AKUNTANSI: 'Akuntansi' }
const ROLE_ACCESS = {
  ADMIN: ['dashboard', 'kendaraan', 'pengajuan', 'service', 'sewa', 'dokumen', 'laporan', 'pengguna', 'import'],
  TRANSPORT: ['dashboard', 'kendaraan', 'pengajuan', 'service', 'sewa', 'dokumen', 'laporan', 'import'],
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
  { id: 'sewa', label: 'Kendaraan Sewa', icon: 'rental' },
  { id: 'dokumen', label: 'Dokumen', icon: 'document' },
  { id: 'laporan', label: 'Laporan', icon: 'report' },
  { id: 'pengguna', label: 'Pengguna', icon: 'user' },
  { id: 'import', label: 'Import Excel', icon: 'document' },
]

const columns = keys => keys.map(([key, label]) => ({ key, label }))
const cleanRows = rows => rows.map(row => ({ ...row }))

function AppTransport() {
  const [session, setSession] = useState(null), [profile, setProfile] = useState(null), [loading, setLoading] = useState(true), [activePage, setActivePage] = useState('dashboard'), [sidebarOpen, setSidebarOpen] = useState(false)
  const [email, setEmail] = useState(() => localStorage.getItem(REMEMBERED_EMAIL_KEY) || ''), [password, setPassword] = useState(''), [showPassword, setShowPassword] = useState(false), [rememberMe, setRememberMe] = useState(true), [submitting, setSubmitting] = useState(false), [errorMessage, setErrorMessage] = useState('')
  const [exportingPage, setExportingPage] = useState(false)
  const allowedPages = useMemo(() => ROLE_ACCESS[profile?.role] || ['dashboard'], [profile?.role])
  const visibleNavItems = useMemo(() => NAV_ITEMS.filter((item) => allowedPages.includes(item.id)), [allowedPages])

  const loadProfile = async (userId) => { const { data, error } = await supabase.from('profiles').select('id,nama_lengkap,email,nomor_hp,role,aktif').eq('id', userId).single(); if (error || !data) { console.error('Profile error:', error); setProfile(null); setErrorMessage('Profil pengguna tidak dapat dimuat.'); return } if (!data.aktif) { await supabase.auth.signOut(); setSession(null); setProfile(null); setErrorMessage('Akun ini sedang dinonaktifkan. Hubungi administrator.'); return } setProfile(data); setErrorMessage('') }
  useEffect(() => { let mounted = true; const initialize = async () => { const { data, error } = await supabase.auth.getSession(); if (!mounted) return; if (error) setErrorMessage('Sesi login tidak dapat diperiksa. Silakan coba lagi.'); setSession(data.session); if (data.session?.user) await loadProfile(data.session.user.id); setLoading(false) }; initialize(); const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, nextSession) => { if (!mounted) return; setSession(nextSession); if (nextSession?.user) await loadProfile(nextSession.user.id); else setProfile(null) }); return () => { mounted = false; subscription.unsubscribe() } }, [])
  useEffect(() => { if (session && profile && !allowedPages.includes(activePage)) setActivePage('dashboard') }, [activePage, allowedPages, profile, session])

  const handleLogin = async (event) => { event.preventDefault(); setErrorMessage(''); const cleanEmail = email.trim().toLowerCase(); if (!cleanEmail || !password) { setErrorMessage('Email dan password wajib diisi.'); return } setSubmitting(true); const { data, error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password }); if (error || !data.user) { setErrorMessage('Email atau password tidak sesuai.'); setSubmitting(false); return } if (rememberMe) localStorage.setItem(REMEMBERED_EMAIL_KEY, cleanEmail); else localStorage.removeItem(REMEMBERED_EMAIL_KEY); setPassword(''); await loadProfile(data.user.id); setSubmitting(false) }
  const handleLogout = async () => { setSubmitting(true); await supabase.auth.signOut(); setSession(null); setProfile(null); setActivePage('dashboard'); setSubmitting(false) }

  const exportCurrentPage = async () => {
    if (!profile || activePage === 'dashboard' || activePage === 'pengguna') return
    setExportingPage(true)
    setErrorMessage('')
    try {
      const stamp = new Date().toISOString().slice(0, 10)
      const exportDate = value => value ? new Intl.DateTimeFormat('id-ID').format(new Date(value)) : '-'
      const money = value => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value || 0))

      if (activePage === 'kendaraan') {
        const [v, d] = await Promise.all([
          supabase.from('kendaraan').select('*').order('nomor_polisi'),
          supabase.from('driver').select('*').order('nama_lengkap'),
        ])
        if (v.error) throw v.error
        if (d.error) throw d.error
        const driverMap = Object.fromEntries((d.data || []).map(x => [x.id, x]))
        exportToExcel(`Rekap-Kendaraan-ZT-${stamp}.xls`, [
          { title: 'KENDARAAN', columns: columns([['kode_kendaraan','Kode Kendaraan'],['nomor_polisi','Nomor Polisi'],['merk','Merk'],['tipe','Tipe'],['jenis_kendaraan','Jenis Kendaraan'],['tahun','Tahun'],['warna','Warna'],['nomor_rangka','Nomor Rangka'],['nomor_mesin','Nomor Mesin'],['kepemilikan','Kepemilikan'],['jenis_sewa','Jenis Sewa'],['pemilik','Pemilik / PIC'],['driver','Driver'],['lokasi','Lokasi'],['kilometer_terakhir','KM Terakhir'],['status','Status'],['kondisi','Kondisi'],['keterangan','Keterangan']]), rows: cleanRows(v.data || []).map(x => ({ ...x, driver: driverMap[x.driver_id]?.nama_lengkap || '-' })) },
          { title: 'DRIVER / PIC', columns: columns([['nama_lengkap','Nama'],['nomor_hp','Nomor HP'],['nomor_sim','Nomor SIM'],['masa_berlaku_sim','Masa Berlaku SIM'],['lokasi','Lokasi'],['status','Status'],['keterangan','Keterangan']]), rows: cleanRows(d.data || []) },
        ])
      } else if (activePage === 'pengajuan') {
        const [{ data: requests, error: requestError }, { data: vehicles, error: vehicleError }] = await Promise.all([
          supabase.from('permintaan_service').select('*').order('created_at', { ascending: false }),
          supabase.from('kendaraan').select('id,nomor_polisi,merk,tipe').order('nomor_polisi'),
        ])
        if (requestError) throw requestError
        if (vehicleError) throw vehicleError
        const vehicleMap = Object.fromEntries((vehicles || []).map(x => [x.id, x]))
        exportToExcel(`Rekap-Pengajuan-Service-ZT-${stamp}.xls`, [{ title: 'PENGAJUAN SERVICE', columns: columns([['nomor_pengajuan','Nomor Pengajuan'],['tanggal_pengajuan','Tanggal Pengajuan'],['pemohon_id','ID Pemohon'],['kendaraan','Nomor Polisi'],['kendaraan_detail','Merk / Tipe'],['kilometer_pengajuan','KM Pengajuan'],['jenis_permintaan','Jenis Permintaan'],['keluhan','Keluhan'],['prioritas','Prioritas'],['status','Status'],['catatan_transport','Catatan Transport'],['diproses_oleh','Diproses Oleh'],['diproses_at','Diproses At']]), rows: cleanRows(requests || []).map(x => ({ ...x, kendaraan: vehicleMap[x.kendaraan_id]?.nomor_polisi || '-', kendaraan_detail: vehicleMap[x.kendaraan_id] ? `${vehicleMap[x.kendaraan_id].merk || ''}${vehicleMap[x.kendaraan_id].tipe ? ` • ${vehicleMap[x.kendaraan_id].tipe}` : ''}` : '-' })) }])
      } else if (activePage === 'service') {
        const rs = await Promise.all([
          supabase.from('service').select('*').order('created_at', { ascending: false }),
          supabase.from('service_item').select('*').order('created_at', { ascending: false }),
          supabase.from('service_approval').select('*').order('waktu_approval', { ascending: false }),
          supabase.from('service_bukti').select('*').order('created_at', { ascending: false }),
          supabase.from('riwayat_ban').select('*').order('tanggal_penggantian', { ascending: false }),
          supabase.from('riwayat_aki').select('*').order('tanggal_penggantian', { ascending: false }),
          supabase.from('riwayat_kilometer').select('*').order('tanggal', { ascending: false }),
          supabase.from('kendaraan').select('id,nomor_polisi'),
          supabase.from('permintaan_service').select('id,nomor_pengajuan'),
        ])
        const names = ['service','item','approval','bukti','ban','aki','kilometer','kendaraan','pengajuan']
        rs.forEach((r, i) => { if (r.error) throw new Error(`${names[i]}: ${r.error.message}`) })
        const serviceMap = Object.fromEntries((rs[0].data || []).map(x => [x.id, x]))
        const vehicleMap = Object.fromEntries((rs[7].data || []).map(x => [x.id, x]))
        const requestMap = Object.fromEntries((rs[8].data || []).map(x => [x.id, x]))
        exportToExcel(`Rekap-Service-ZT-${stamp}.xls`, [
          { title: 'SERVICE', columns: columns([['nomor_service','Nomor Service'],['nomor_pengajuan','Nomor Pengajuan'],['nomor_polisi','Nomor Polisi'],['tanggal_service','Tanggal Service'],['kilometer','KM'],['bengkel','Bengkel'],['jenis_service','Jenis Service'],['keluhan','Keluhan'],['estimasi_biaya','Estimasi Biaya'],['biaya_aktual','Biaya Aktual'],['status','Status'],['catatan','Catatan']]), rows: cleanRows(rs[0].data || []).map(x => ({ ...x, nomor_pengajuan: requestMap[x.permintaan_service_id]?.nomor_pengajuan || '-', nomor_polisi: vehicleMap[x.kendaraan_id]?.nomor_polisi || '-' })) },
          { title: 'ITEM SERVICE', columns: columns([['service_id','Service ID'],['nama_item','Nama Item'],['kategori','Kategori'],['jumlah','Jumlah'],['satuan','Satuan'],['harga_satuan','Harga Satuan'],['subtotal','Subtotal'],['keterangan','Keterangan']]), rows: cleanRows(rs[1].data || []) },
          { title: 'APPROVAL', columns: columns([['service_id','Service ID'],['urutan','Urutan'],['jenis_approval','Jenis Approval'],['pemberi_approval','Pemberi Approval'],['status','Status'],['waktu_approval','Waktu Approval'],['catatan','Catatan']]), rows: cleanRows(rs[2].data || []) },
          { title: 'BUKTI SERVICE', columns: columns([['service_id','Service ID'],['jenis_bukti','Jenis Bukti'],['nama_file','Nama File'],['file_path','File Path'],['keterangan','Keterangan'],['uploaded_by','Uploaded By'],['created_at','Dibuat']]), rows: cleanRows(rs[3].data || []) },
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
          supabase.from('kendaraan').select('id,nomor_polisi,merk,tipe'),
        ])
        const names = ['pemilik','kontrak','pembayaran','perbaikan','potongan','kendaraan']
        rs.forEach((r, i) => { if (r.error) throw new Error(`${names[i]}: ${r.error.message}`) })
        const vehicleMap = Object.fromEntries((rs[5].data || []).map(x => [x.id, x]))
        const ownerMap = Object.fromEntries((rs[0].data || []).map(x => [x.id, x]))
        const contractMap = Object.fromEntries((rs[1].data || []).map(x => [x.id, x]))
        exportToExcel(`Rekap-Rental-ZT-${stamp}.xls`, [
          { title: 'PEMILIK SEWA', columns: columns([['jenis_pemilik','Jenis Pemilik'],['nama_pemilik','Nama Pemilik'],['nomor_hp','Nomor HP'],['email','Email'],['alamat','Alamat'],['nomor_identitas','Nomor Identitas'],['nama_perusahaan','Nama Perusahaan'],['nomor_rekening','Nomor Rekening'],['nama_bank','Nama Bank'],['aktif','Aktif'],['keterangan','Keterangan']]), rows: cleanRows(rs[0].data || []) },
          { title: 'KONTRAK SEWA', columns: columns([['nomor_kontrak','Nomor Kontrak'],['nomor_polisi','Nomor Polisi'],['pemilik','Pemilik'],['tanggal_mulai','Tanggal Mulai'],['tanggal_selesai','Tanggal Selesai'],['periode_bulan','Periode'],['nilai_sewa_bulanan','Sewa Bulanan'],['tanggal_jatuh_tempo_bulanan','Jatuh Tempo'],['status','Status'],['catatan','Catatan']]), rows: cleanRows(rs[1].data || []).map(x => ({ ...x, nomor_polisi: vehicleMap[x.kendaraan_id]?.nomor_polisi || '-', pemilik: ownerMap[x.pemilik_sewa_id]?.nama_pemilik || '-' })) },
          { title: 'PEMBAYARAN SEWA', columns: columns([['kontrak_sewa_id','Kontrak ID'],['periode_ke','Periode Ke'],['bulan_pembayaran','Bulan Pembayaran'],['tanggal_jatuh_tempo','Jatuh Tempo'],['tanggal_pembayaran','Tanggal Pembayaran'],['jumlah_tagihan','Tagihan'],['jumlah_dibayar','Dibayar'],['status','Status'],['metode_pembayaran','Metode'],['nomor_referensi','Referensi'],['bukti_pembayaran_path','Bukti'],['catatan','Catatan']]), rows: cleanRows(rs[2].data || []) },
          { title: 'PERBAIKAN KENDARAAN SEWA', columns: columns([['nomor_perbaikan','Nomor Perbaikan'],['nomor_polisi','Nomor Polisi'],['tanggal_kejadian','Tanggal Kejadian'],['kilometer','KM'],['jenis_kerusakan','Jenis Kerusakan'],['deskripsi_kerusakan','Deskripsi'],['penyebab','Penyebab'],['estimasi_biaya','Estimasi'],['biaya_aktual','Aktual'],['metode_penanganan','Metode'],['dibayar_kantor','Dibayar Kantor'],['tanggal_dibayar','Tanggal Dibayar'],['pemilik_diberitahu','Pemilik Diberitahu'],['status','Status'],['dapat_dipotong','Dapat Dipotong'],['jumlah_dipotong','Potongan'],['foto_kerusakan_path','Foto Kerusakan'],['bukti_perbaikan_path','Bukti'],['catatan','Catatan']]), rows: cleanRows(rs[3].data || []).map(x => ({ ...x, nomor_polisi: vehicleMap[x.kendaraan_id]?.nomor_polisi || '-' })) },
          { title: 'POTONGAN PEMBAYARAN SEWA', columns: columns([['pembayaran_sewa_id','Pembayaran ID'],['perbaikan_sewa_id','Perbaikan ID'],['jumlah_potongan','Jumlah Potongan'],['catatan','Catatan']]), rows: cleanRows(rs[4].data || []).map(x => ({ ...x, kontrak: contractMap[x.kontrak_sewa_id]?.nomor_kontrak || '-' })) },
        ])
      } else if (activePage === 'dokumen') {
        const [{ data: documents, error: documentError }, { data: vehicles, error: vehicleError }] = await Promise.all([
          supabase.from('dokumen_kendaraan').select('*').order('tanggal_jatuh_tempo', { ascending: true }),
          supabase.from('kendaraan').select('id,nomor_polisi,merk,tipe').order('nomor_polisi'),
        ])
        if (documentError) throw documentError
        if (vehicleError) throw vehicleError
        const vehicleMap = Object.fromEntries((vehicles || []).map(x => [x.id, x]))
        exportToExcel(`Rekap-Dokumen-Kendaraan-ZT-${stamp}.xls`, [{ title: 'DOKUMEN KENDARAAN', columns: columns([['kendaraan','Nomor Polisi'],['jenis_dokumen','Jenis Dokumen'],['nomor_dokumen','Nomor Dokumen'],['tanggal_terbit','Tanggal Terbit'],['tanggal_berlaku_mulai','Berlaku Mulai'],['tanggal_jatuh_tempo','Jatuh Tempo'],['file_path','File'],['keterangan','Keterangan']]), rows: cleanRows(documents || []).map(x => ({ ...x, kendaraan: vehicleMap[x.kendaraan_id]?.nomor_polisi || '-' })) }])
      }
    } catch (error) {
      console.error('Export error:', error)
      setErrorMessage(`Export gagal: ${error?.message || 'Data tidak dapat diekspor.'}`)
    } finally {
      setExportingPage(false)
    }
  }

  const pageContent = { dashboard: <DashboardFeaturePage profile={profile} onNavigate={setActivePage}/>, kendaraan: <KendaraanPage profile={profile}/>, pengajuan: <PermintaanServicePage profile={profile}/>, service: <ServicePage profile={profile}/>, sewa: <RentalPage profile={profile}/>, dokumen: <DocumentsPage profile={profile}/>, laporan: <ReportsPage />, pengguna: <UsersPage />, import: <ImportExcelPage profile={profile}/> }
  const canExportCurrentPage = ['kendaraan', 'pengajuan', 'service', 'sewa', 'dokumen'].includes(activePage)
  return <div className="dashboard-layout">{sidebarOpen && <button className="sidebar-overlay" onClick={() => setSidebarOpen(false)} aria-label="Tutup menu"/>}<aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}><div className="sidebar-brand"><div className="sidebar-brand-mark"><img src={LOGO_MARK_URL} alt=""/></div><div className="sidebar-brand-copy"><strong>PT ZAMAN TEKNINDO</strong><span>Sistem Transport</span></div></div><div className="nav-section-label">MENU UTAMA</div><nav className="sidebar-nav" aria-label="Navigasi utama">{visibleNavItems.map((item) => <button key={item.id} className={`nav-item ${activePage === item.id ? 'active' : ''}`} onClick={() => { setActivePage(item.id); setSidebarOpen(false) }}><span className="nav-icon" data-icon={item.icon} aria-hidden="true"/><span>{item.label}</span></button>)}</nav><div className="sidebar-bottom"><div className="user-mini"><div className="avatar">{(profile?.nama_lengkap || profile?.email || 'U').charAt(0).toUpperCase()}</div><div className="user-mini-text"><strong>{profile?.nama_lengkap || 'Pengguna'}</strong><span>{ROLE_LABELS[profile?.role] || profile?.role}</span></div></div><button className="logout-button" onClick={handleLogout} disabled={submitting}>Keluar</button></div></aside><main className="main-content"><header className="topbar"><button className="menu-button" onClick={() => setSidebarOpen(true)} aria-label="Buka menu">☰</button><div><span className="topbar-label">SISTEM TRANSPORT</span><h1>{NAV_ITEMS.find((item) => item.id === activePage)?.label || 'Dashboard'}</h1></div>{canExportCurrentPage && <button className="topbar-export" onClick={exportCurrentPage} disabled={exportingPage} title={`Export ${NAV_ITEMS.find((item) => item.id === activePage)?.label || 'data'} ke Excel`}><span className="export-icon">⇩</span><span className="export-label">Export Excel</span></button>}<div className="topbar-user"><div className="avatar">{(profile?.nama_lengkap || profile?.email || 'U').charAt(0).toUpperCase()}</div><div><strong>{profile?.nama_lengkap || profile?.email}</strong><span>{ROLE_LABELS[profile?.role] || profile?.role}</span></div></div></header><div className="content-container">{pageContent[activePage] || pageContent.dashboard}</div></main></div>
}

export default AppTransport
