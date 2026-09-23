import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import './TransportOperationsFixed.css'
import { formatDateSafe } from '../utils/dateSafe'
import { decodeExcelMeta } from '../utils/excelSourceMeta.js'

const EMPTY={kendaraan_id:'',jenis_dokumen:'STNK',nomor_dokumen:'',tanggal_terbit:'',tanggal_berlaku_mulai:'',tanggal_jatuh_tempo:'',keterangan:''}
const fmt=v=>formatDateSafe(v)
const isInteractiveTarget=target=>Boolean(target?.closest?.('button,input,select,textarea,a'))
const daysLeft=v=>v?Math.ceil((new Date(v+'T00:00:00')-new Date())/86400000):null
const statusOf=v=>{const d=daysLeft(v);return d===null?'TANPA_TANGGAL':d<0?'EXPIRED':d<=30?'SEGERA':'AMAN'}
const statusLabel=s=>s==='EXPIRED'?'Sudah lewat':s==='SEGERA'?'Segera jatuh tempo':s==='TANPA_TANGGAL'?'Belum ada tanggal':'Aman'
const Alert=({type='success',children})=><div className={`x-alert ${type}`}>{children}</div>

export default function DocumentsFeaturePage({profile}){
 const [docs,setDocs]=useState([]),[vehicles,setVehicles]=useState([]),[form,setForm]=useState(EMPTY),[file,setFile]=useState(null)
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('')
 const [viewMode,setViewMode]=useState('excel'),[editing,setEditing]=useState(null),[selectedDoc,setSelectedDoc]=useState(null)
 const [query,setQuery]=useState(''),[statusFilter,setStatusFilter]=useState('SEMUA'),[typeFilter,setTypeFilter]=useState('SEMUA'),[yearFilter,setYearFilter]=useState('SEMUA'),[monthFilter,setMonthFilter]=useState('SEMUA')
 const [selectedDocIds,setSelectedDocIds]=useState([]),[selectionMode,setSelectionMode]=useState(false)
 const canManage=['ADMIN','TRANSPORT'].includes(profile?.role)
 const vehicleMap=useMemo(()=>Object.fromEntries(vehicles.map(v=>[v.id,v])),[vehicles])
 const pressRef=useRef(null),ignoreClickRef=useRef(false)

 const load=async()=>{
  setLoading(true);setError('')
  const [d,v]=await Promise.all([
   supabase.from('dokumen_kendaraan').select('*').order('tanggal_jatuh_tempo',{ascending:true}),
   supabase.from('kendaraan').select('id,nomor_polisi,merk,tipe,tahun,nomor_rangka,pemilik,foto_stnk_path,kepemilikan').eq('kepemilikan','ASET').order('nomor_polisi')
  ])
  if(d.error)setError(`Dokumen: ${d.error.message}`)
  if(v.error)setError(e=>e||`Kendaraan: ${v.error.message}`)
  const assetIds=new Set((v.data||[]).map(x=>x.id))
  setDocs((d.data||[]).filter(row=>assetIds.has(row.kendaraan_id)))
  setVehicles(v.data||[]);setSelectedDocIds([]);setSelectionMode(false);setLoading(false)
 }
 useEffect(()=>{load();const h=e=>{if(['dokumen','kendaraan'].includes(e.detail?.context))load()};window.addEventListener('transport:data-imported',h);return()=>window.removeEventListener('transport:data-imported',h)},[])

 const years=useMemo(()=>Array.from(new Set(docs.map(d=>String(d.tanggal_jatuh_tempo||'').slice(0,4)).filter(y=>/^\d{4}$/.test(y)))).sort((a,b)=>Number(b)-Number(a)),[docs])
 const filtered=useMemo(()=>{
  const q=query.trim().toLowerCase()
  return docs.filter(d=>{
   const v=vehicleMap[d.kendaraan_id], status=statusOf(d.tanggal_jatuh_tempo), date=String(d.tanggal_jatuh_tempo||'')
   const hay=[d.jenis_dokumen,d.nomor_dokumen,d.keterangan,v?.nomor_polisi,v?.merk,v?.tipe,v?.pemilik].filter(Boolean).join(' ').toLowerCase()
   return (!q||hay.includes(q))&&(statusFilter==='SEMUA'||status===statusFilter)&&(typeFilter==='SEMUA'||d.jenis_dokumen===typeFilter)&&(yearFilter==='SEMUA'||date.slice(0,4)===yearFilter)&&(monthFilter==='SEMUA'||date.slice(5,7)===monthFilter)
  })
 },[docs,vehicleMap,query,statusFilter,typeFilter,yearFilter,monthFilter])

 const monitorRows=useMemo(()=>vehicles.map((v,index)=>{
  const byType={};docs.filter(d=>d.kendaraan_id===v.id).forEach(d=>{byType[d.jenis_dokumen]=d})
  const sourceDoc=Object.values(byType).find(d=>decodeExcelMeta(d.keterangan).meta?.source==='STNK_DAN_KIR')
  const meta=sourceDoc?decodeExcelMeta(sourceDoc.keterangan).meta:null
  return {kendaraan_id:v.id,no:Number(meta?.source_no)||index+1,merk:meta?.merk||v.merk||'-',tipe:meta?.type||v.tipe||'-',nomor_polisi:meta?.nomor_polisi||v.nomor_polisi||'-',tahun:meta?.tahun||v.tahun||'-',nomor_rangka:meta?.nomor_rangka||v.nomor_rangka||'-',stnk:byType.STNK?.tanggal_jatuh_tempo||null,foto_stnk_path:v.foto_stnk_path||null,kir:byType.KIR?.tanggal_jatuh_tempo||null,lima_tahun:byType['5_TAHUNAN']?.tanggal_jatuh_tempo||null,pemilik:meta?.pemilik||v.pemilik||'-'}
 }),[vehicles,docs])

 const reminders=useMemo(()=>docs.map(d=>({kind:'dokumen',doc:d,vehicle:vehicleMap[d.kendaraan_id],days:daysLeft(d.tanggal_jatuh_tempo)})).filter(x=>x.days!==null&&x.days<=30).sort((a,b)=>a.days-b.days),[docs,vehicleMap])
 const taxReminders=useMemo(()=>vehicles.map(vehicle=>({kind:'pajak',vehicle,days:daysLeft(vehicle.masa_berlaku_pajak)})).filter(x=>x.days!==null&&x.days<=30).sort((a,b)=>a.days-b.days),[vehicles])
 const summary={total:docs.length,expired:docs.filter(d=>statusOf(d.tanggal_jatuh_tempo)==='EXPIRED').length,soon:docs.filter(d=>statusOf(d.tanggal_jatuh_tempo)==='SEGERA').length,taxExpired:taxReminders.filter(x=>x.days<0).length,taxSoon:taxReminders.filter(x=>x.days>=0).length}

 const resetForm=()=>{setForm(EMPTY);setFile(null);setEditing(null)}
 const edit=d=>{setEditing(d);setForm({kendaraan_id:String(d.kendaraan_id),jenis_dokumen:d.jenis_dokumen||'STNK',nomor_dokumen:d.nomor_dokumen||'',tanggal_terbit:d.tanggal_terbit||'',tanggal_berlaku_mulai:d.tanggal_berlaku_mulai||'',tanggal_jatuh_tempo:d.tanggal_jatuh_tempo||'',keterangan:d.keterangan||''});setFile(null);setViewMode('detail');window.scrollTo({top:0,behavior:'smooth'})}
 const save=async e=>{
  e.preventDefault();if(!canManage)return
  const vehicle=vehicleMap[form.kendaraan_id]
  if(!vehicle||vehicle.kepemilikan!=='ASET')return setError('STNK/KIR dan 5 tahunan hanya boleh dicatat untuk kendaraan ASET.')
  if(['STNK','KIR','5_TAHUNAN'].includes(form.jenis_dokumen)&&vehicle.kepemilikan!=='ASET')return setError('Dokumen ini khusus kendaraan ASET.')
  if(!form.tanggal_jatuh_tempo){setError('Tanggal jatuh tempo wajib diisi.');return}
  setSaving(true);setError('');setSuccess('')
  let newPath=null
  try{
   let filePath=editing?.file_path||null
   if(file){const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');filePath=`${form.kendaraan_id}/${Date.now()}-${crypto.randomUUID()}-${safe}`;newPath=filePath;const u=await supabase.storage.from('dokumen-kendaraan').upload(filePath,file,{upsert:false,contentType:file.type||undefined});if(u.error)throw u.error}
   const payload={...form,kendaraan_id:Number(form.kendaraan_id),file_path:filePath}
   const result=editing?await supabase.from('dokumen_kendaraan').update(payload).eq('id',editing.id).select('*').single():await supabase.from('dokumen_kendaraan').insert(payload).select('*').single()
   if(result.error)throw result.error
   if(editing&&file&&editing.file_path)await supabase.storage.from('dokumen-kendaraan').remove([editing.file_path])
   setDocs(current=>(editing?current.map(row=>row.id===result.data.id?result.data:row):[result.data,...current]).sort((a,b)=>String(a.tanggal_jatuh_tempo||'').localeCompare(String(b.tanggal_jatuh_tempo||''))))
   resetForm();setSuccess(editing?'Dokumen diperbarui.':'Dokumen ditambahkan.')
  }catch(e2){if(newPath)await supabase.storage.from('dokumen-kendaraan').remove([newPath]);setError(e2.message)}finally{setSaving(false)}
 }
 const remove=async d=>{if(!canManage)return;if(!window.confirm(`Hapus ${d.jenis_dokumen} untuk ${vehicleMap[d.kendaraan_id]?.nomor_polisi||'-'}?`))return;setSaving(true);try{const r=await supabase.from('dokumen_kendaraan').delete().eq('id',d.id);if(r.error)throw r.error;if(d.file_path)await supabase.storage.from('dokumen-kendaraan').remove([d.file_path]);setDocs(current=>current.filter(x=>x.id!==d.id));setSuccess('Dokumen dihapus.')}catch(e){setError(e.message)}finally{setSaving(false)}}
 const openFile=async path=>{try{const r=await supabase.storage.from('dokumen-kendaraan').createSignedUrl(path,3600);if(r.error)throw r.error;if(r.data?.signedUrl)window.open(r.data.signedUrl,'_blank','noopener,noreferrer')}catch(e){setError(e.message)}}
 const openStnkPhoto=async path=>{try{if(!path)throw new Error('Foto STNK belum tersedia.');const r=await supabase.storage.from('kendaraan').createSignedUrl(path,3600);if(r.error)throw r.error;if(r.data?.signedUrl)window.open(r.data.signedUrl,'_blank','noopener,noreferrer')}catch(e){setError(e.message)}}
 const openMonitorDetail=row=>{const doc=docs.find(d=>d.kendaraan_id===row.kendaraan_id&&['STNK','KIR','5_TAHUNAN'].includes(d.jenis_dokumen));if(doc)setSelectedDoc(doc);else setError(`Belum ada data STNK/KIR untuk ${row.nomor_polisi}.`)}
 const clearPress=()=>{if(pressRef.current?.timer)window.clearTimeout(pressRef.current.timer);pressRef.current=null}
 const armLongPress=(event,id)=>{if(!canManage||selectionMode||isInteractiveTarget(event.target)||(event.button!==undefined&&event.button!==0))return;clearPress();pressRef.current={x:event.clientX,y:event.clientY,timer:window.setTimeout(()=>{setSelectionMode(true);setSelectedDocIds(current=>current.includes(id)?current:[...current,id]);ignoreClickRef.current=true;pressRef.current=null},480)}}
 const moveLongPress=event=>{const state=pressRef.current;if(state&&Math.hypot(event.clientX-state.x,event.clientY-state.y)>10)clearPress()}
 const toggleDoc=id=>setSelectedDocIds(current=>current.includes(id)?current.filter(x=>x!==id):[...current,id])
 const deleteSelected=async()=>{if(!canManage||!selectedDocIds.length)return;if(!window.confirm(`Hapus ${selectedDocIds.length} dokumen?`))return;setSaving(true);try{const selectedDocs=docs.filter(d=>selectedDocIds.includes(d.id));const r=await supabase.from('dokumen_kendaraan').delete().in('id',selectedDocIds);if(r.error)throw r.error;const paths=selectedDocs.map(d=>d.file_path).filter(Boolean);if(paths.length)await supabase.storage.from('dokumen-kendaraan').remove(paths);setDocs(current=>current.filter(x=>!selectedDocIds.includes(x.id)));setSelectedDocIds([]);setSelectionMode(false);setSuccess(`${selectedDocs.length} dokumen dihapus.`)}catch(e){setError(e.message)}finally{setSaving(false)}}
 const allSelected=filtered.length>0&&filtered.every(d=>selectedDocIds.includes(d.id))
 const toggleAll=()=>setSelectedDocIds(current=>allSelected?current.filter(id=>!filtered.some(d=>d.id===id)):Array.from(new Set([...current,...filtered.map(d=>d.id)])))

 return <div className="x-page">
  <div className="x-head"><div><span className="eyebrow">DOKUMEN ARMADA</span><h2>Dokumen Kendaraan</h2><p>Monitoring STNK, KIR, 5 tahunan, masa berlaku pajak, pengingat jatuh tempo, serta arsip dokumen. Dokumen STNK/KIR/5 tahunan dibatasi hanya untuk kendaraan ASET.</p></div><button className="x-btn secondary" onClick={load} disabled={loading}>↻ Refresh</button></div>
  {error&&<Alert type="error">{error}</Alert>}{success&&<Alert>{success}</Alert>}
  {(reminders.length>0||taxReminders.length>0)&&<div className="x-alert warning"><b>Pengingat jatuh tempo:</b> {summary.expired} dokumen sudah lewat, {summary.soon} dokumen jatuh tempo ≤30 hari. {summary.taxExpired+summary.taxSoon>0&&<>Pajak kendaraan: {summary.taxExpired} sudah lewat, {summary.taxSoon} mendekati jatuh tempo. </>}{[...reminders.slice(0,3),...taxReminders.slice(0,3)].map((x,i)=>x.kind==='pajak'?<span key={'tax-'+x.vehicle.id}> • Pajak {x.vehicle?.nomor_polisi||'-'} ({x.days<0?`lewat ${Math.abs(x.days)} hari`:`${x.days} hari lagi`})</span>:<span key={x.doc.id+'-'+i}> • {x.vehicle?.nomor_polisi||'-'} {x.doc.jenis_dokumen} ({x.days<0?`lewat ${Math.abs(x.days)} hari`:`${x.days} hari lagi`})</span>)}</div>}
  <div className="x-summary-grid"><div><span>Total dokumen</span><b>{summary.total}</b></div><div><span>Sudah lewat</span><b>{summary.expired}</b></div><div><span>≤ 30 hari</span><b>{summary.soon}</b></div><div><span>Menunggu tanggal</span><b>{docs.filter(d=>!d.tanggal_jatuh_tempo).length}</b></div></div>
  <div className="x-tabs"><button className={viewMode==='excel'?'active':''} onClick={()=>setViewMode('excel')}>Format STNK DAN KIR</button>{canManage&&<button className={viewMode==='detail'?'active':''} onClick={()=>setViewMode('detail')}>Data Dokumen</button>}</div>

  {viewMode==='excel'&&<section className="x-card"><div className="x-card-title"><div><h3>Monitoring STNK DAN KIR — ASET</h3><p>Format mengikuti Excel: NO, MERK, TYPE, NO.POLISI, TAHUN, No Rangka, STNK, KIR, 5 TAHUN, PEMILIK.</p></div></div><div className="x-table-wrap"><table className="x-table document-monitor-table"><thead><tr><th>NO</th><th>MERK</th><th>TYPE</th><th>NO.POLISI</th><th>TAHUN</th><th>No Rangka</th><th>STNK</th><th>Foto STNK</th><th>KIR</th><th>5 TAHUN</th><th>PEMILIK</th><th>Aksi</th></tr></thead><tbody>{monitorRows.map(row=><tr key={`${row.no}-${row.nomor_polisi}`}><td>{row.no}</td><td><b>{row.merk}</b></td><td>{row.tipe}</td><td><b>{row.nomor_polisi}</b></td><td>{row.tahun}</td><td>{row.nomor_rangka}</td><td>{fmt(row.stnk)}</td><td>{row.foto_stnk_path?<button className="x-link" type="button" onClick={()=>openStnkPhoto(row.foto_stnk_path)}>Lihat</button>:'-'}</td><td>{fmt(row.kir)}</td><td>{fmt(row.lima_tahun)}</td><td>{row.pemilik}</td><td className="x-action-compact"><button className="x-link" onClick={()=>openMonitorDetail(row)}>Detail</button>{canManage&&<button className="x-link" onClick={()=>{const doc=docs.find(d=>d.kendaraan_id===row.kendaraan_id&&['STNK','KIR','5_TAHUNAN'].includes(d.jenis_dokumen));if(doc)edit(doc);else{resetForm();setViewMode('detail');setForm(current=>({...current,kendaraan_id:String(row.kendaraan_id),jenis_dokumen:'STNK'}))}}}>Edit</button>}</td></tr>)}</tbody></table></div></section>}

  {viewMode==='detail'&&canManage&&<section className="x-card"><div className="x-card-title"><div><h3>{editing?'Edit Dokumen':'Tambah Dokumen'}</h3><p>Untuk STNK, KIR, dan 5 tahunan, pilihan kendaraan otomatis hanya ASET.</p></div>{editing&&<button className="x-btn secondary" onClick={resetForm}>Batal Edit</button>}</div><form className="x-grid" onSubmit={save}><label>Kendaraan<select value={form.kendaraan_id} onChange={e=>setForm({...form,kendaraan_id:e.target.value})}><option value="">Pilih kendaraan aset</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.nomor_polisi} — {v.merk} {v.tipe||''}</option>)}</select></label><label>Jenis Dokumen<select value={form.jenis_dokumen} onChange={e=>setForm({...form,jenis_dokumen:e.target.value})}><option>STNK</option><option>KIR</option><option>5_TAHUNAN</option><option>PAJAK</option><option>LAINNYA</option></select></label><label>Nomor Dokumen<input value={form.nomor_dokumen} onChange={e=>setForm({...form,nomor_dokumen:e.target.value})}/></label><label>Tanggal Terbit<input type="date" value={form.tanggal_terbit} onChange={e=>setForm({...form,tanggal_terbit:e.target.value})}/></label><label>Berlaku Mulai<input type="date" value={form.tanggal_berlaku_mulai} onChange={e=>setForm({...form,tanggal_berlaku_mulai:e.target.value})}/></label><label>Jatuh Tempo<input type="date" value={form.tanggal_jatuh_tempo} onChange={e=>setForm({...form,tanggal_jatuh_tempo:e.target.value})}/></label><label>File<input type="file" accept=".pdf,image/*" onChange={e=>setFile(e.target.files?.[0]||null)}/></label><label className="full">Keterangan<textarea value={form.keterangan} onChange={e=>setForm({...form,keterangan:e.target.value})}/></label><div className="full x-actions"><button className="x-btn primary" disabled={saving}>{saving? 'Menyimpan…':editing?'Perbarui Dokumen':'Simpan Dokumen'}</button></div></form></section>}

  <section className="x-card"><div className="x-card-title"><div><h3>Daftar Dokumen</h3><p>Filter berdasarkan nomor polisi/merk, jenis, tahun, bulan, dan status jatuh tempo.</p></div>{canManage&&<button className="x-btn primary" onClick={()=>{resetForm();setViewMode('detail')}}>+ Tambah Dokumen</button>}</div><div className="x-toolbar-inline"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cari BM, nomor polisi, merk, nomor dokumen..." /><select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}><option value="SEMUA">Semua jenis</option><option>STNK</option><option>KIR</option><option>5_TAHUNAN</option><option>PAJAK</option><option>LAINNYA</option></select><select value={yearFilter} onChange={e=>setYearFilter(e.target.value)}><option value="SEMUA">Semua tahun</option>{years.map(y=><option key={y}>{y}</option>)}</select><select value={monthFilter} onChange={e=>setMonthFilter(e.target.value)}><option value="SEMUA">Semua bulan</option>{Array.from({length:12},(_,i)=><option key={i+1} value={String(i+1).padStart(2,'0')}>{new Intl.DateTimeFormat('id-ID',{month:'long'}).format(new Date(2026,i,1))}</option>)}</select><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="SEMUA">Semua status</option><option value="EXPIRED">Sudah lewat</option><option value="SEGERA">≤ 30 hari</option><option value="AMAN">Aman</option><option value="TANPA_TANGGAL">Tanpa tanggal</option></select><button className="x-btn secondary" onClick={()=>{setQuery('');setTypeFilter('SEMUA');setYearFilter('SEMUA');setMonthFilter('SEMUA');setStatusFilter('SEMUA')}}>Reset</button></div>
  {selectionMode&&<div className="x-selection-bar"><div className="x-selection-meta"><span>Mode pilih dokumen</span><strong>{selectedDocIds.length} dipilih</strong></div><div className="x-selection-actions"><button className="ghost" onClick={toggleAll}>{allSelected?'Batalkan semua':'Pilih semua'}</button><button className="ghost" onClick={()=>{setSelectedDocIds([]);setSelectionMode(false)}}>Batal</button><button className="danger" onClick={deleteSelected} disabled={saving||!selectedDocIds.length}>Hapus {selectedDocIds.length}</button></div></div>}
  <div className="x-table-wrap"><table className="x-table"><thead><tr>{selectionMode&&<th className="x-select-cell"><input type="checkbox" checked={allSelected} onChange={toggleAll}/></th>}<th>Kendaraan</th><th>Jenis</th><th>Nomor</th><th>Berlaku</th><th>Jatuh Tempo</th><th>Hitung</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{loading?<tr><td colSpan="9"><div className="x-empty">Memuat…</div></td></tr>:filtered.length===0?<tr><td colSpan="9"><div className="x-empty">Belum ada dokumen yang cocok.</div></td></tr>:filtered.map(d=>{const v=vehicleMap[d.kendaraan_id],days=daysLeft(d.tanggal_jatuh_tempo),selected=selectedDocIds.includes(d.id);return <tr key={d.id} className={selected?'x-selected':''} onPointerDown={e=>armLongPress(e,d.id)} onPointerMove={moveLongPress} onPointerUp={clearPress} onPointerCancel={clearPress} onClick={e=>{if(isInteractiveTarget(e.target))return;if(ignoreClickRef.current){ignoreClickRef.current=false;return}if(selectionMode)toggleDoc(d.id)}}>{selectionMode&&<td className="x-select-cell"><input type="checkbox" checked={selected} onChange={()=>toggleDoc(d.id)}/></td>}<td><b>{v?.nomor_polisi||'-'}</b><small>{v?.merk||''} {v?.tipe||''}</small></td><td>{d.jenis_dokumen}</td><td>{d.nomor_dokumen||'-'}</td><td>{fmt(d.tanggal_berlaku_mulai)}</td><td>{fmt(d.tanggal_jatuh_tempo)}</td><td><span className="x-pill">{days===null?'—':days<0?`Lewat ${Math.abs(days)} hari`:`${days} hari lagi`}</span></td><td><span className={`x-pill document-status-${statusOf(d.tanggal_jatuh_tempo).toLowerCase()}`}>{statusLabel(statusOf(d.tanggal_jatuh_tempo))}</span></td><td className="x-action-compact"><button className="x-link" onClick={()=>setSelectedDoc(d)}>Detail</button>{canManage&&<><button className="x-link" onClick={()=>edit(d)}>Edit</button><button className="x-link danger" onClick={()=>remove(d)} disabled={saving}>Hapus</button></>}</td></tr>})}</tbody></table></div></section>

  {selectedDoc&&<div className="x-overlay"><section className="x-modal"><div className="x-modal-head"><div><span className="eyebrow">DETAIL DOKUMEN</span><h3>{vehicleMap[selectedDoc.kendaraan_id]?.nomor_polisi||'-'} • {selectedDoc.jenis_dokumen}</h3></div><button onClick={()=>setSelectedDoc(null)}>×</button></div><div className="x-detail"><p><b>Kendaraan:</b> {vehicleMap[selectedDoc.kendaraan_id]?.merk||'-'} {vehicleMap[selectedDoc.kendaraan_id]?.tipe||''}</p><p><b>Nomor Dokumen:</b> {selectedDoc.nomor_dokumen||'-'}</p><p><b>Terbit:</b> {fmt(selectedDoc.tanggal_terbit)}</p><p><b>Berlaku:</b> {fmt(selectedDoc.tanggal_berlaku_mulai)}</p><p><b>Jatuh Tempo:</b> {fmt(selectedDoc.tanggal_jatuh_tempo)}</p><p><b>Status:</b> {statusLabel(statusOf(selectedDoc.tanggal_jatuh_tempo))}</p><p><b>Sisa / Lewat:</b> {daysLeft(selectedDoc.tanggal_jatuh_tempo)===null?'Tidak ada tanggal':daysLeft(selectedDoc.tanggal_jatuh_tempo)<0?`Lewat ${Math.abs(daysLeft(selectedDoc.tanggal_jatuh_tempo))} hari`:`${daysLeft(selectedDoc.tanggal_jatuh_tempo)} hari lagi`}</p><p><b>Keterangan:</b> {selectedDoc.keterangan||'-'}</p></div><div className="x-actions"><button className="x-btn secondary" onClick={()=>setSelectedDoc(null)}>Tutup</button>{selectedDoc.file_path&&<button className="x-btn secondary" onClick={()=>openFile(selectedDoc.file_path)}>Lihat File</button>}{canManage&&<button className="x-btn primary" onClick={()=>{setSelectedDoc(null);edit(selectedDoc)}}>Edit</button>}</div></section></div>}
 </div>
}
