import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import './ServiceCompletionPanel.css'

const money = (v) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(v || 0))

export default function ServiceCompletionPanel({ profile }) {
  const canProcess = ['ADMIN', 'TRANSPORT'].includes(profile?.role)
  const [services, setServices] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [proofCounts, setProofCounts] = useState({})
  const [approvalCounts, setApprovalCounts] = useState({})
  const [loading, setLoading] = useState(false)
  const [savingId, setSavingId] = useState(null)
  const [message, setMessage] = useState('')

  const load = async () => {
    if (!canProcess) return
    setLoading(true)
    setMessage('')
    const [serviceRes, vehicleRes, proofRes, approvalRes] = await Promise.all([
      supabase.from('service').select('id,nomor_service,kendaraan_id,tanggal_service,estimasi_biaya,biaya_aktual,status').in('status', ['DALAM_PENGERJAAN', 'DISETUJUI']).order('created_at', { ascending: false }),
      supabase.from('kendaraan').select('id,nomor_polisi,merk,tipe'),
      supabase.from('service_bukti').select('service_id'),
      supabase.from('service_approval').select('service_id,status,jenis_approval'),
    ])
    const firstError = serviceRes.error || vehicleRes.error || proofRes.error || approvalRes.error
    if (firstError) setMessage(firstError.message)
    setServices(serviceRes.data || [])
    setVehicles(vehicleRes.data || [])
    const nextProofCounts = {}
    ;(proofRes.data || []).forEach((row) => { nextProofCounts[row.service_id] = (nextProofCounts[row.service_id] || 0) + 1 })
    setProofCounts(nextProofCounts)
    const nextApprovalCounts = {}
    ;(approvalRes.data || []).forEach((row) => {
      if (row.status !== 'DISETUJUI') return
      nextApprovalCounts[row.service_id] ||= { total: 0, director: false }
      nextApprovalCounts[row.service_id].total += 1
      if (row.jenis_approval === 'DIREKTUR') nextApprovalCounts[row.service_id].director = true
    })
    setApprovalCounts(nextApprovalCounts)
    setLoading(false)
  }

  useEffect(() => { load() }, [canProcess])

  const vehicleMap = useMemo(() => Object.fromEntries(vehicles.map((v) => [v.id, v])), [vehicles])
  const completable = useMemo(() => services.filter((s) => {
    const estimate = Number(s.estimasi_biaya || 0)
    const actual = Number(s.biaya_aktual ?? estimate)
    const approvals = approvalCounts[s.id] || { total: 0, director: false }
    const hasProof = (proofCounts[s.id] || 0) > 0
    const approvalOk = actual <= 5000000 ? true : approvals.director
    const extraApprovalOk = actual <= estimate ? true : approvals.total >= 2
    const stateOk = s.status === 'DISETUJUI' || (s.status === 'DALAM_PENGERJAAN' && actual <= 5000000 && actual <= estimate)
    return canProcess && hasProof && approvalOk && extraApprovalOk && stateOk
  }), [services, approvalCounts, proofCounts, canProcess])

  const finish = async (service) => {
    if (savingId) return
    setSavingId(service.id)
    setMessage('')
    const estimate = Number(service.estimasi_biaya || 0)
    const actual = service.biaya_aktual === null || service.biaya_aktual === '' ? estimate : Number(service.biaya_aktual)
    const { error } = await supabase.from('service').update({ status: 'SELESAI', biaya_aktual: actual, selesai_at: new Date().toISOString() }).eq('id', service.id)
    if (error) setMessage(error.message)
    else await load()
    setSavingId(null)
  }

  if (!canProcess) return null

  return <section className="service-completion-panel">
    <div className="service-completion-head">
      <div><span className="eyebrow">PENYELESAIAN SERVICE</span><h3>{completable.length ? 'Service siap diselesaikan' : 'Tidak ada service yang siap diselesaikan'}</h3><p>Service hanya dapat ditutup setelah bukti dan persyaratan biaya/approval terpenuhi.</p></div>
      <button className="scp-refresh" onClick={load} disabled={loading}>{loading ? 'Memuat…' : '↻ Refresh'}</button>
    </div>
    {message && <div className="scp-message">{message}</div>}
    {completable.length > 0 && <div className="scp-list">{completable.map((service) => { const v = vehicleMap[service.kendaraan_id]; const actual = Number(service.biaya_aktual ?? service.estimasi_biaya ?? 0); return <div className="scp-row" key={service.id}><div><strong>{service.nomor_service || `#${service.id}`}</strong><span>{v?.nomor_polisi || '-'} · {v?.merk || ''} {v?.tipe || ''}</span><small>Estimasi {money(service.estimasi_biaya)} · Aktual {money(actual)} · Bukti {proofCounts[service.id] || 0}</small></div><button className="scp-finish" onClick={() => finish(service)} disabled={savingId === service.id}>{savingId === service.id ? 'Menyelesaikan…' : 'Selesaikan'}</button></div> })}</div>}
  </section>
}
