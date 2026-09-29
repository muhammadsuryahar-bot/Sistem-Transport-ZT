import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import './ServiceCompletionPanel.css'

const money = (v) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(v || 0))

export default function ServiceCompletionPanel({ profile }) {
  const canProcess = ['ADMIN', 'TRANSPORT'].includes(profile?.role)
  const canApprove = ['ADMIN', 'ATASAN_TRANSPORT', 'DIREKTUR'].includes(profile?.role)
  const canViewPanel = canProcess || canApprove
  const [services, setServices] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [proofCounts, setProofCounts] = useState({})
  const [approvalCounts, setApprovalCounts] = useState({})
  const [loading, setLoading] = useState(false)
  const [savingId, setSavingId] = useState(null)
  const [message, setMessage] = useState('')
  const [approvalModal, setApprovalModal] = useState(null)
  const [approvalNote, setApprovalNote] = useState('')

  const load = useCallback(async () => {
    if (!canViewPanel) return
    setLoading(true)
    setMessage('')
    const [serviceRes, vehicleRes, proofRes, approvalRes] = await Promise.all([
      supabase.from('service').select('id,nomor_service,permintaan_service_id,kendaraan_id,tanggal_service,estimasi_biaya,biaya_aktual,status').in('status', ['MENUNGGU_APPROVAL', 'DALAM_PENGERJAAN', 'DISETUJUI']).order('created_at', { ascending: false }),
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
  }, [canViewPanel])

  useEffect(() => {
    load()
    const handleImported = (event) => { if (['service', 'pengajuan'].includes(event.detail?.context)) load() }
    window.addEventListener('transport:data-imported', handleImported)
    return () => window.removeEventListener('transport:data-imported', handleImported)
  }, [load])

  const vehicleMap = useMemo(() => Object.fromEntries(vehicles.map((v) => [v.id, v])), [vehicles])

  const approvalState = (service) => {
    const approvals = approvalCounts[service.id] || { total: 0, director: false }
    const estimate = Number(service.estimasi_biaya || 0)
    const actual = Number(service.biaya_aktual ?? estimate)
    const needsSecond = approvals.total >= 1 && actual > estimate
    const requiredRole = approvals.total >= 2 || (!needsSecond && approvals.total >= 1)
      ? null
      : (needsSecond ? actual : estimate) > 5000000 ? 'DIREKTUR' : 'ATASAN_TRANSPORT'
    const roleAllowed = profile?.role === 'ADMIN' || profile?.role === requiredRole
    return { ...approvals, estimate, actual, requiredRole, roleAllowed, pending: service.status === 'MENUNGGU_APPROVAL' && Boolean(requiredRole) && roleAllowed }
  }

  const pendingApprovals = useMemo(
    () => services.filter(service => canApprove && approvalState(service).pending),
    [services, approvalCounts, canApprove, profile?.role]
  )
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


  const openApproval = (service, decision) => {
    setApprovalModal({ service, decision })
    setApprovalNote('')
    setMessage('')
  }

  const closeApproval = () => {
    if (savingId) return
    setApprovalModal(null)
    setApprovalNote('')
  }

  const submitApproval = async () => {
    if (!approvalModal || savingId) return
    const service = approvalModal.service
    const decision = approvalModal.decision
    const state = approvalState(service)
    if (!state.pending || !state.roleAllowed) {
      setMessage('Service sudah berubah status atau bukan bagian approval Anda. Muat ulang data terlebih dahulu.')
      closeApproval()
      return
    }
    setSavingId(service.id)
    setMessage('')
    try {
      const approvalType = state.requiredRole === 'DIREKTUR' ? 'DIREKTUR' : 'KEPALA_BAGIAN'
      const approvalResult = await supabase
        .from('service_approval')
        .insert({
          service_id: service.id,
          status: decision,
          jenis_approval: approvalType,
          catatan: approvalNote.trim() || null,
        })
        .select('*')
        .single()
      if (approvalResult.error) throw approvalResult.error

      const nextApprovedCount = state.total + (decision === 'DISETUJUI' ? 1 : 0)
      const nextStatus = decision === 'DITOLAK'
        ? 'DITOLAK'
        : (nextApprovedCount >= 1 && (state.actual <= state.estimate || nextApprovedCount >= 2) ? 'DISETUJUI' : 'MENUNGGU_APPROVAL')
      const serviceResult = await supabase
        .from('service')
        .update({ status: nextStatus })
        .eq('id', service.id)
        .select('id,nomor_service,permintaan_service_id,kendaraan_id,tanggal_service,estimasi_biaya,biaya_aktual,status')
        .single()
      if (serviceResult.error) throw serviceResult.error

      window.dispatchEvent(new CustomEvent('transport:service-state-updated', { detail: { kind: 'service', service: serviceResult.data } }))

      setApprovalCounts(current => ({
        ...current,
        [service.id]: {
          total: nextApprovedCount,
          director: current[service.id]?.director || approvalType === 'DIREKTUR' && decision === 'DISETUJUI',
        },
      }))
      setServices(current => current.map(row => row.id === service.id ? serviceResult.data : row))
      setApprovalModal(null)
      setApprovalNote('')
      setMessage(decision === 'DISETUJUI'
        ? (nextStatus === 'DISETUJUI' ? 'Approval berhasil. Service dapat dilanjutkan.' : 'Approval berhasil. Service masih menunggu approval berikutnya.')
        : 'Service ditolak.')
    } catch (error) {
      setMessage(error?.message || 'Approval service gagal diproses.')
    } finally {
      setSavingId(null)
    }
  }

  const finish = async (service) => {
    if (savingId) return
    setSavingId(service.id)
    setMessage('')
    const estimate = Number(service.estimasi_biaya || 0)
    const actual = service.biaya_aktual === null || service.biaya_aktual === '' ? estimate : Number(service.biaya_aktual)
    const selesaiAt = new Date().toISOString(); const { error } = await supabase.from('service').update({ status: 'SELESAI', biaya_aktual: actual, selesai_at: selesaiAt }).eq('id', service.id)
    if (error) setMessage(error.message)
    else { const updatedService = { ...service, status: 'SELESAI', biaya_aktual: actual, selesai_at: selesaiAt }; setServices(current => current.map(row => row.id === service.id ? updatedService : row)); window.dispatchEvent(new CustomEvent('transport:service-state-updated', { detail: { kind: 'service', service: updatedService } })); setMessage('Service berhasil diselesaikan.') }
    setSavingId(null)
  }

  if (!canViewPanel) return null

  return <section className="service-completion-panel">
    <div className="service-completion-head">
      <div><span className="eyebrow">WORKFLOW SERVICE</span><h3>{canApprove ? (pendingApprovals.length ? pendingApprovals.length + ' service menunggu approval' : 'Tidak ada approval yang menunggu') : (completable.length ? 'Service siap diselesaikan' : 'Tidak ada service yang siap diselesaikan')}</h3><p>{canApprove ? 'Approval mengikuti batas nilai biaya dan validasi database. Anda hanya dapat memproses approval sesuai kewenangan.' : 'Service hanya dapat ditutup setelah bukti dan persyaratan biaya/approval terpenuhi.'}</p></div>
      <button className="scp-refresh" onClick={load} disabled={loading}>{loading ? 'Memuat…' : '↻ Refresh'}</button>
    </div>
    {message && <div className="scp-message">{message}</div>}
    {canApprove && <div className="scp-section">
      <div className="scp-section-head"><div><strong>Approval Service</strong><span>{pendingApprovals.length ? 'Perlu tindakan' : 'Semua approval yang menjadi kewenangan Anda sudah diproses'}</span></div></div>
      {pendingApprovals.length === 0 ? <div className="scp-empty">Tidak ada service yang menunggu approval Anda.</div> : <div className="scp-list">{pendingApprovals.map(service => { const v = vehicleMap[service.kendaraan_id]; const state = approvalState(service); return <div className="scp-row scp-approval-row" key={service.id}><div><strong>{service.nomor_service || '#' + service.id}</strong><span>{v?.nomor_polisi || '-'} · {v?.merk || ''} {v?.tipe || ''}</span><small>Estimasi {money(state.estimate)} · Aktual {money(state.actual)} · Approval selesai {state.total} kali · Nilai berikutnya {money(state.total === 0 ? state.estimate : state.actual)}</small><em>{state.requiredRole === 'DIREKTUR' ? 'Approval Direktur' : 'Approval Atasan Transport'}</em></div><div className="scp-approval-actions"><button type="button" className="scp-reject" onClick={() => openApproval(service, 'DITOLAK')} disabled={savingId === service.id}>Tolak</button><button type="button" className="scp-approve" onClick={() => openApproval(service, 'DISETUJUI')} disabled={savingId === service.id}>Setujui</button></div></div> })}</div>}
    </div>}
    {completable.length > 0 && <div className="scp-list">{completable.map((service) => { const v = vehicleMap[service.kendaraan_id]; const actual = Number(service.biaya_aktual ?? service.estimasi_biaya ?? 0); return <div className="scp-row" key={service.id}><div><strong>{service.nomor_service || `#${service.id}`}</strong><span>{v?.nomor_polisi || '-'} · {v?.merk || ''} {v?.tipe || ''}</span><small>Estimasi {money(service.estimasi_biaya)} · Aktual {money(actual)} · Bukti {proofCounts[service.id] || 0}</small></div><button className="scp-finish" onClick={() => finish(service)} disabled={savingId === service.id}>{savingId === service.id ? 'Menyelesaikan…' : 'Selesaikan'}</button></div> })}</div>}
    {approvalModal && <div className="scp-modal-backdrop" role="dialog" aria-modal="true" aria-label="Approval service"><section className="scp-modal"><div className="scp-modal-head"><div><span className="eyebrow">APPROVAL SERVICE</span><h3>{approvalModal.service.nomor_service || '#' + approvalModal.service.id}</h3><p>{vehicleMap[approvalModal.service.kendaraan_id]?.nomor_polisi || '-'} · {vehicleMap[approvalModal.service.kendaraan_id]?.merk || ''} {vehicleMap[approvalModal.service.kendaraan_id]?.tipe || ''}</p></div><button type="button" className="scp-modal-close" onClick={closeApproval} disabled={savingId !== null}>×</button></div><div className="scp-detail-grid"><div><span>Keputusan</span><strong>{approvalModal.decision === 'DISETUJUI' ? 'Setujui' : 'Tolak'}</strong></div><div><span>Peran</span><strong>{approvalState(approvalModal.service).requiredRole === 'DIREKTUR' ? 'Direktur' : 'Atasan Transport'}</strong></div><div><span>Estimasi</span><strong>{money(approvalState(approvalModal.service).estimate)}</strong></div><div><span>Aktual</span><strong>{money(approvalState(approvalModal.service).actual)}</strong></div></div><label className="scp-note-field">Catatan Approval<textarea value={approvalNote} onChange={e => setApprovalNote(e.target.value)} placeholder="Opsional" disabled={savingId !== null} /></label><div className="scp-modal-actions"><button type="button" className="scp-cancel" onClick={closeApproval} disabled={savingId !== null}>Batal</button><button type="button" className={approvalModal.decision === 'DISETUJUI' ? 'scp-approve' : 'scp-reject'} onClick={submitApproval} disabled={savingId !== null}>{savingId !== null ? 'Memproses…' : approvalModal.decision === 'DISETUJUI' ? 'Konfirmasi Setujui' : 'Konfirmasi Tolak'}</button></div></section></div>}
  </section>
}
