import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import './TransportOperationsFixed.css'

const ROLES=['ADMIN','TRANSPORT','OPERASIONAL','ATASAN_TRANSPORT','DIREKTUR','AKUNTANSI']
const LABEL={ADMIN:'Administrator',TRANSPORT:'Transport',OPERASIONAL:'Operasional',ATASAN_TRANSPORT:'Atasan Transport',DIREKTUR:'Direktur',AKUNTANSI:'Akuntansi'}

export default function UsersFeaturePage({profile}){
 const [users,setUsers]=useState([]),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('')
 const canEdit=profile?.role==='ADMIN'
 const load=async()=>{setLoading(true);setError('');const {data,error:e}=await supabase.from('profiles').select('id,nama_lengkap,email,nomor_hp,role,aktif,created_at').order('nama_lengkap');if(e)setError(e.message);setUsers(data||[]);setLoading(false)}
 useEffect(()=>{load()},[])
 const change=async(id,patch)=>{if(!canEdit)return;setSaving(true);setError('');setSuccess('');const {error:e}=await supabase.from('profiles').update(patch).eq('id',id);if(e)setError(e.message);else{setSuccess('Perubahan pengguna tersimpan.');await load()}setSaving(false)}
 return <div className="x-page"><div className="x-head"><div><span className="eyebrow">ADMINISTRASI</span><h2>Pengguna Sistem</h2><p>Kelola nama, nomor HP, role, dan status akun pengguna.</p></div><button className="x-btn secondary" onClick={load}>↻ Refresh</button></div>{error&&<div className="x-alert error">{error}</div>}{success&&<div className="x-alert">{success}</div>}<section className="x-card"><div className="x-table-wrap">{loading?<div className="x-empty">Memuat pengguna...</div>:<table className="x-table"><thead><tr><th>Pengguna</th><th>Kontak</th><th>Role</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{users.length?users.map(u=><tr key={u.id}><td><b>{u.nama_lengkap||'-'}</b><small>{u.email}</small></td><td>{u.nomor_hp||'-'}</td><td>{canEdit?<select className="x-filter" value={u.role} onChange={e=>change(u.id,{role:e.target.value})}>{ROLES.map(r=><option key={r} value={r}>{LABEL[r]||r}</option>)}</select>:LABEL[u.role]||u.role}</td><td><span className="x-pill">{u.aktif?'Aktif':'Nonaktif'}</span></td><td>{canEdit&&<button className="x-link" disabled={saving} onClick={()=>change(u.id,{aktif:!u.aktif})}>{u.aktif?'Nonaktifkan':'Aktifkan'}</button>}</td></tr>):<tr><td colSpan="5"><div className="x-empty">Belum ada pengguna.</div></td></tr>}</tbody></table>}</div></section></div>
}
