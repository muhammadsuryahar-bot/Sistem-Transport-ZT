import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import KendaraanPage from './modules/KendaraanPage'
import PermintaanServicePage from './modules/PermintaanServicePage'
import './App.css'

const REMEMBERED_EMAIL_KEY = 'transport_remembered_email'
const ROLE_LABELS = { ADMIN:'Administrator', TRANSPORT:'Transport', OPERASIONAL:'Operasional', ATASAN_TRANSPORT:'Atasan Transport', DIREKTUR:'Direktur', AKUNTANSI:'Akuntansi' }
const ROLE_ACCESS = {
  ADMIN:['dashboard','kendaraan','pengajuan','service','sewa','dokumen','laporan','pengguna'],
  TRANSPORT:['dashboard','kendaraan','pengajuan','service','sewa','dokumen','laporan'],
  OPERASIONAL:['dashboard','pengajuan'],
  ATASAN_TRANSPORT:['dashboard','pengajuan','service','laporan'],
  DIREKTUR:['dashboard','service','laporan'],
  AKUNTANSI:['dashboard','sewa','laporan'],
}
const NAV_ITEMS = [
  { id:'dashboard', label:'Dashboard', icon:'⌂' }, { id:'kendaraan', label:'Kendaraan', icon:'▣' },
  { id:'pengajuan', label:'Pengajuan Service', icon:'↗' }, { id:'service', label:'Service & Perbaikan', icon:'⚙' },
  { id:'sewa', label:'Kendaraan Sewa', icon:'▤' }, { id:'dokumen', label:'Dokumen', icon:'□' },
  { id:'laporan', label:'Laporan', icon:'▥' }, { id:'pengguna', label:'Pengguna', icon:'♙' },
]

function AppMain() {
  const [session,setSession]=useState(null), [profile,setProfile]=useState(null), [loading,setLoading]=useState(true)
  const [activePage,setActivePage]=useState('dashboard'), [sidebarOpen,setSidebarOpen]=useState(false)
  const [stats,setStats]=useState({vehicles:0,activeVehicles:0,inService:0,pendingRequests:0}), [statsLoading,setStatsLoading]=useState(false)
  const [email,setEmail]=useState(()=>localStorage.getItem(REMEMBERED_EMAIL_KEY)||''), [password,setPassword]=useState('')
  const [showPassword,setShowPassword]=useState(false), [rememberMe,setRememberMe]=useState(true), [submitting,setSubmitting]=useState(false), [errorMessage,setErrorMessage]=useState('')
  const allowedPages=useMemo(()=>ROLE_ACCESS[profile?.role]||['dashboard'],[profile?.role])
  const visibleNavItems=useMemo(()=>NAV_ITEMS.filter((item)=>allowedPages.includes(item.id)),[allowedPages])

  const loadProfile=async(userId)=>{
    const {data,error}=await supabase.from('profiles').select('id,nama_lengkap,email,nomor_hp,role,aktif').eq('id',userId).single()
    if(error||!data){setProfile(null);setErrorMessage('Profil pengguna tidak dapat dimuat.');return false}
    if(!data.aktif){await supabase.auth.signOut();setProfile(null);setSession(null);setErrorMessage('Akun ini sedang dinonaktifkan. Hubungi administrator.');return false}
    setProfile(data);setErrorMessage('');return true
  }

  useEffect(()=>{
    let mounted=true
    const initialize=async()=>{const {data,error}=await supabase.auth.getSession();if(!mounted)return;if(error)setErrorMessage('Sesi login tidak dapat diperiksa.');setSession(data.session);if(data.session?.user)await loadProfile(data.session.user.id);setLoading(false)}
    initialize()
    const {data:{subscription}}=supabase.auth.onAuthStateChange(async(_event,nextSession)=>{if(!mounted)return;setSession(nextSession);if(nextSession?.user)await loadProfile(nextSession.user.id);else setProfile(null)})
    return()=>{mounted=false;subscription.unsubscribe()}
  },[])

  useEffect(()=>{if(session&&profile&&!allowedPages.includes(activePage))setActivePage('dashboard')},[activePage,allowedPages,profile,session])

  useEffect(()=>{
    if(!session||!profile||activePage!=='dashboard')return
    let cancelled=false
    const loadStats=async()=>{setStatsLoading(true);const [a,b,c,d]=await Promise.all([
      supabase.from('kendaraan').select('id',{count:'exact',head:true}),
      supabase.from('kendaraan').select('id',{count:'exact',head:true}).eq('status','ACTIVE'),
      supabase.from('kendaraan').select('id',{count:'exact',head:true}).eq('status','SERVICE'),
      supabase.from('permintaan_service').select('id',{count:'exact',head:true}).in('status',['MENUNGGU_TRANSPORT','DITERIMA_TRANSPORT','MENUNGGU_APPROVAL']),
    ]);if(!cancelled){setStats({vehicles:a.count||0,activeVehicles:b.count||0,inService:c.count||0,pendingRequests:d.count||0});setStatsLoading(false)}}
    loadStats();return()=>{cancelled=true}
  },[activePage,profile,session])

  const handleLogin=async(e)=>{e.preventDefault();setErrorMessage('');const cleanEmail=email.trim().toLowerCase();if(!cleanEmail||!password){setErrorMessage('Email dan password wajib diisi.');return}setSubmitting(true);const {data,error}=await supabase.auth.signInWithPassword({email:cleanEmail,password});if(error||!data.user){setErrorMessage('Email atau password tidak sesuai.');setSubmitting(false);return}rememberMe?localStorage.setItem(REMEMBERED_EMAIL_KEY,cleanEmail):localStorage.removeItem(REMEMBERED_EMAIL_KEY);setPassword('');await loadProfile(data.user.id);setSubmitting(false)}
  const handleLogout=async()=>{setSubmitting(true);await supabase.auth.signOut();setSession(null);setProfile(null);setActivePage('dashboard');setSubmitting(false)}

  if(loading)return <main className="auth-shell"><div className="loading-card"><div className="loading-spinner"/><p>Memuat Sistem Transport...</p></div></main>
  if(!session||!profile)return <main className="auth-shell"><section className="login-card"><div className="brand-mark">ZT</div><span className="eyebrow">PT ZAMAN TEKNINDO</span><h1>Masuk ke Sistem Transport</h1><p className="subtitle">Kelola kendaraan, service, sewa, dan operasional transport secara terpusat.</p><form onSubmit={handleLogin}><label htmlFor="email">Email</label><input id="email" type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} placeholder="nama@zamanteknindo.co.id" disabled={submitting}/><label htmlFor="password">Password</label><div className="password-field"><input id="password" type={showPassword?'text':'password'} autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Masukkan password" disabled={submitting}/><button type="button" className="password-toggle" onClick={()=>setShowPassword(v=>!v)} disabled={submitting}>{showPassword?'Sembunyikan':'Lihat'}</button></div><label className="remember-option"><input type="checkbox" checked={rememberMe} onChange={e=>setRememberMe(e.target.checked)} disabled={submitting}/><span>Ingat email di perangkat ini</span></label>{errorMessage&&<div className="error-message">{errorMessage}</div>}<button className="primary-button" type="submit" disabled={submitting}>{submitting?'Memproses login...':'Masuk'}</button></form><p className="security-note">Password tidak disimpan di perangkat. Sesi login dikelola oleh Supabase Auth.</p></section></main>

  return <div className="dashboard-layout">{sidebarOpen&&<button className="sidebar-overlay" aria-label="Tutup menu" onClick={()=>setSidebarOpen(false)}/>}<aside className={`sidebar ${sidebarOpen?'sidebar-open':''}`}><div className="sidebar-brand"><div className="brand-mark small">ZT</div><div><strong>Zaman Teknindo</strong><span>Transport System</span></div></div><div className="nav-section-label">MENU UTAMA</div><nav className="sidebar-nav">{visibleNavItems.map(item=><button key={item.id} className={`nav-item ${activePage===item.id?'active':''}`} onClick={()=>{setActivePage(item.id);setSidebarOpen(false)}}><span className="nav-icon">{item.icon}</span><span>{item.label}</span></button>)}</nav><div className="sidebar-bottom"><div className="user-mini"><div className="avatar">{(profile.nama_lengkap||profile.email||'U').charAt(0).toUpperCase()}</div><div className="user-mini-text"><strong>{profile.nama_lengkap||'Pengguna'}</strong><span>{ROLE_LABELS[profile.role]||profile.role}</span></div></div><button className="logout-button" onClick={handleLogout} disabled={submitting}>Keluar</button></div></aside><main className="main-content"><header className="topbar"><button className="menu-button" onClick={()=>setSidebarOpen(true)} aria-label="Buka menu">☰</button><div><span className="topbar-label">SISTEM TRANSPORT</span><h1>{NAV_ITEMS.find(i=>i.id===activePage)?.label||'Dashboard'}</h1></div><div className="topbar-user"><div className="avatar">{(profile.nama_lengkap||profile.email||'U').charAt(0).toUpperCase()}</div><div><strong>{profile.nama_lengkap||profile.email}</strong><span>{ROLE_LABELS[profile.role]||profile.role}</span></div></div></header><div className="content-container">{activePage==='dashboard'&&<DashboardHome profile={profile} stats={stats} statsLoading={statsLoading} onNavigate={setActivePage}/>} {activePage==='kendaraan'&&<KendaraanPage/>} {activePage==='pengajuan'&&<PermintaanServicePage profile={profile}/>} {!['dashboard','kendaraan','pengajuan'].includes(activePage)&&<ModulePlaceholder title={NAV_ITEMS.find(i=>i.id===activePage)?.label||'Modul'} role={profile.role}/>}</div></main></div>
}

function DashboardHome({profile,stats,statsLoading,onNavigate}){return <><section className="page-intro"><div><span className="eyebrow">Dashboard</span><h2>Selamat datang, {profile.nama_lengkap||'Pengguna'}</h2><p>Pantau kondisi kendaraan dan aktivitas transport dari satu tempat.</p></div></section><section className="stats-grid"><article className="stat-card"><div className="stat-icon">▣</div><div><span>Total Kendaraan</span><strong>{statsLoading?'...':stats.vehicles}</strong><small>Data kendaraan terdaftar</small></div></article><article className="stat-card"><div className="stat-icon">✓</div><div><span>Kendaraan Aktif</span><strong>{statsLoading?'...':stats.activeVehicles}</strong><small>Siap digunakan</small></div></article><article className="stat-card"><div className="stat-icon">⚙</div><div><span>Sedang Service</span><strong>{statsLoading?'...':stats.inService}</strong><small>Perlu dipantau</small></div></article><article className="stat-card"><div className="stat-icon">↗</div><div><span>Pengajuan Menunggu</span><strong>{statsLoading?'...':stats.pendingRequests}</strong><small>Perlu diproses</small></div></article></section><section className="dashboard-grid"><article className="panel quick-panel"><div className="panel-heading"><div><span className="eyebrow">AKSES CEPAT</span><h3>Menu yang sering digunakan</h3></div></div><div className="quick-grid"><button className="quick-action" onClick={()=>onNavigate('pengajuan')}><span>↗</span><strong>Ajukan Service</strong><small>Buat permintaan untuk kendaraan</small></button><button className="quick-action" onClick={()=>onNavigate('kendaraan')}><span>▣</span><strong>Data Kendaraan</strong><small>Lihat armada dan kilometer</small></button><button className="quick-action" onClick={()=>onNavigate('service')}><span>⚙</span><strong>Proses Service</strong><small>Pantau pekerjaan dan biaya</small></button><button className="quick-action" onClick={()=>onNavigate('dokumen')}><span>□</span><strong>Dokumen</strong><small>Kelola STNK, KIR, dan lainnya</small></button></div></article><article className="panel flow-panel"><div className="panel-heading"><div><span className="eyebrow">ALUR UTAMA</span><h3>Proses transport</h3></div></div><div className="flow-list">{['Operasional','Permintaan Service','Transport','Approval','Service','Bukti','Selesai'].map((item,i)=><div className="flow-item" key={item}><span>{i+1}</span><strong>{item}</strong></div>)}</div></article></section></>}
function ModulePlaceholder({title,role}){return <section className="module-placeholder"><span className="eyebrow">MODUL {title.toUpperCase()}</span><h2>{title}</h2><p>Modul ini disiapkan untuk role <strong>{ROLE_LABELS[role]||role}</strong>. Fitur transaksi akan dibangun sesuai alur bisnis dan hak akses.</p></section>}
export default AppMain
