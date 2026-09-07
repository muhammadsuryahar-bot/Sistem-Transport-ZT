import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import './TransportOperationsFixed.css'

const money = v => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(v || 0))
const date = v => v ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(new Date(v)) : '-'
const DAYS = 30 * 86400000

export default function ReportsFeaturePage() {
  const [data, setData] = useState({ vehicles: [], services: [], requests: [], contracts: [], payments: [], docs: [], approvals: [], repairs: [], deductions: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('SEMUA')

  const load = async () => {
    setLoading(true); setError('')
    const rs = await Promise.all([
      supabase.from('kendaraan').select('*'),
      supabase.from('service').select('*').order('created_at', { ascending: false }),
      supabase.from('permintaan_service').select('*').order('created_at', { ascending: false }),
      supabase.from('kontrak_sewa').select('*').order('created_at', { ascending: false }),
      supabase.from('pembayaran_sewa').select('*').order('bulan_pembayaran', { ascending: false }),
      supabase.from('dokumen_kendaraan').select('*'),
      supabase.from('service_approval').select('*').order('waktu_approval', { ascending: false }),
      supabase.from('perbaikan_sewa').select('*').order('tanggal_kejadian', { ascending: false }),
      supabase.from('potongan_pembayaran_sewa').select('*').order('created_at', { ascending: false }),
    ])
    const names = ['kendaraan', 'service', 'pengajuan', 'kontrak', 'pembayaran', 'dokumen', 'approval', 'perbaikan', 'potongan']
    rs.forEach((r, i) => { if (r.error) setError(e => e || `Gagal memuat ${names[i]}: ${r.error.message}`) })
    setData({ vehicles: rs[0].data || [], services: rs[1].data || [], requests: rs[2].data || [], contracts: rs[3].data || [], payments: rs[4].data || [], docs: rs[5].data || [], approvals: rs[6].data || [], repairs: rs[7].data || [], deductions: rs[8].data || [] })
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const now = Date.now()
  const metrics = useMemo(() => {
    const { vehicles, services, requests, contracts, payments, docs, approvals, repairs, deductions } = data
    const activeContracts = contracts.filter(x => x.status === 'AKTIF').length
    const pendingRequests = requests.filter(x => ['MENUNGGU_TRANSPORT', 'DITERIMA_TRANSPORT', 'DALAM_PROSES'].includes(x.status)).length
    const pendingApproval = services.filter(s => s.status === 'MENUNGGU_APPROVAL').length
    const expiredDocs = docs.filter(x => x.tanggal_jatuh_tempo && new Date(x.tanggal_jatuh_tempo).getTime() < now).length
    const soonDocs = docs.filter(x => x.tanggal_jatuh_tempo && new Date(x.tanggal_jatuh_tempo).getTime() >= now && new Date(x.tanggal_jatuh_tempo).getTime() <= now + DAYS).length
    const serviceCost = services.reduce((n, x) => n + Number(x.biaya_aktual ?? x.estimasi_biaya ?? 0), 0)
    const rentalGross = payments.reduce((n, x) => n + Number(x.jumlah_tagihan || 0), 0)
    const rentalPaid = payments.reduce((n, x) => n + Number(x.jumlah_dibayar || 0), 0)
    const totalDeduction = deductions.reduce((n, x) => n + Number(x.jumlah_potongan || 0), 0)
    const overduePayments = payments.filter(x => x.status === 'TERLAMBAT' || (x.status === 'BELUM_LUNAS' && x.tanggal_jatuh_tempo && new Date(x.tanggal_jatuh_tempo).getTime() < now)).length
    const repairedAndPaidByOffice = repairs.filter(x => x.dibayar_kantor).length
    const approved = approvals.filter(x => x.status === 'DISETUJUI').length
    return { activeContracts, pendingRequests, pendingApproval, expiredDocs, soonDocs, serviceCost, rentalGross, rentalPaid, totalDeduction, overduePayments, repairedAndPaidByOffice, approved, totalVehicles: vehicles.length }
  }, [data, now])

  const serviceRows = filter === 'SELESAI' ? data.services.filter(x => x.status === 'SELESAI') : filter === 'MENUNGGU_APPROVAL' ? data.services.filter(x => x.status === 'MENUNGGU_APPROVAL') : data.services.filter(x => x.status !== 'DIBATALKAN').slice(0, 20)
  const problemPayments = data.payments.filter(x => x.status === 'TERLAMBAT' || (x.status === 'BELUM_LUNAS' && x.tanggal_jatuh_tempo && new Date(x.tanggal_jatuh_tempo).getTime() < now)).slice(0, 20)

  if (loading) return <div className="x-page"><div className="x-card"><div className="x-empty">Memuat laporan...</div></div></div>

  return <div className="x-page">
    <div className="x-head"><div><span className="eyebrow">LAPORAN & REKAP</span><h2>Laporan Transport</h2><p>Ringkasan armada, service, approval, sewa, pembayaran, potongan, dan dokumen.</p></div><button className="x-btn secondary" onClick={load}>↻ Refresh</button></div>
    {error && <div className="x-alert error">{error}</div>}

    <div className="x-stat-grid">
      {[['Kendaraan', metrics.totalVehicles], ['Kontrak Aktif', metrics.activeContracts], ['Pengajuan Menunggu', metrics.pendingRequests], ['Service Menunggu Approval', metrics.pendingApproval], ['Biaya Service', money(metrics.serviceCost)], ['Pembayaran Rental', money(metrics.rentalPaid)], ['Potongan Rental', money(metrics.totalDeduction)], ['Dokumen ≤30 Hari', metrics.soonDocs]].map(([label, value]) => <div className="x-stat" key={label}><span>{label}</span><b>{value}</b></div>)}
    </div>

    <section className="x-card"><div className="x-card-title"><h3>Perhatian Utama</h3></div><div className="x-stat-grid">
      <div className="x-stat"><span>Approval Menunggu</span><b>{metrics.pendingApproval}</b></div>
      <div className="x-stat"><span>Pembayaran Bermasalah</span><b>{metrics.overduePayments}</b></div>
      <div className="x-stat"><span>Dokumen Expired</span><b>{metrics.expiredDocs}</b></div>
      <div className="x-stat"><span>Perbaikan Dibayar Kantor</span><b>{metrics.repairedAndPaidByOffice}</b></div>
    </div></section>

    <section className="x-card"><div className="x-card-title"><div><h3>Rekap Service</h3><p>Gunakan filter untuk melihat pekerjaan selesai atau yang menunggu approval.</p></div><div className="x-actions"><button className={`x-btn ${filter === 'SEMUA' ? 'primary' : 'secondary'}`} onClick={() => setFilter('SEMUA')}>Semua</button><button className={`x-btn ${filter === 'MENUNGGU_APPROVAL' ? 'primary' : 'secondary'}`} onClick={() => setFilter('MENUNGGU_APPROVAL')}>Approval</button><button className={`x-btn ${filter === 'SELESAI' ? 'primary' : 'secondary'}`} onClick={() => setFilter('SELESAI')}>Selesai</button></div></div><div className="x-table-wrap"><table className="x-table"><thead><tr><th>Tanggal</th><th>Kendaraan</th><th>Jenis</th><th>Biaya</th><th>Status</th></tr></thead><tbody>{serviceRows.map(x => <tr key={x.id}><td>{date(x.tanggal_service)}</td><td>{data.vehicles.find(k => k.id === x.kendaraan_id)?.nomor_polisi || '-'}</td><td>{x.jenis_service || '-'}</td><td>{money(x.biaya_aktual ?? x.estimasi_biaya)}</td><td>{x.status}</td></tr>)}{!serviceRows.length && <tr><td colSpan="5">Tidak ada data.</td></tr>}</tbody></table></div></section>

    <section className="x-card"><div className="x-card-title"><h3>Pembayaran Sewa Terlambat / Belum Lunas</h3></div><div className="x-table-wrap"><table className="x-table"><thead><tr><th>Kontrak</th><th>Jatuh Tempo</th><th>Tagihan Bersih</th><th>Dibayar</th><th>Status</th></tr></thead><tbody>{problemPayments.map(x => <tr key={x.id}><td>#{x.kontrak_sewa_id}</td><td>{date(x.tanggal_jatuh_tempo)}</td><td>{money(x.jumlah_tagihan)}</td><td>{money(x.jumlah_dibayar)}</td><td>{x.status}</td></tr>)}{!problemPayments.length && <tr><td colSpan="5">Tidak ada pembayaran bermasalah.</td></tr>}</tbody></table></div></section>

    <section className="x-card"><div className="x-card-title"><h3>Dokumen Hampir Jatuh Tempo</h3></div><div className="x-table-wrap"><table className="x-table"><thead><tr><th>Kendaraan</th><th>Dokumen</th><th>Jatuh Tempo</th><th>Status</th></tr></thead><tbody>{data.docs.filter(x => x.tanggal_jatuh_tempo && new Date(x.tanggal_jatuh_tempo).getTime() <= now + DAYS).slice(0, 20).map(x => { const diff = Math.ceil((new Date(x.tanggal_jatuh_tempo).getTime() - now) / 86400000); return <tr key={x.id}><td>{data.vehicles.find(k => k.id === x.kendaraan_id)?.nomor_polisi || '-'}</td><td>{x.jenis_dokumen} {x.nomor_dokumen ? `— ${x.nomor_dokumen}` : ''}</td><td>{date(x.tanggal_jatuh_tempo)}</td><td>{diff < 0 ? 'EXPIRED' : `${diff} hari lagi`}</td></tr> })}{!data.docs.some(x => x.tanggal_jatuh_tempo && new Date(x.tanggal_jatuh_tempo).getTime() <= now + DAYS) && <tr><td colSpan="4">Tidak ada dokumen yang perlu diperhatikan dalam 30 hari.</td></tr>}</tbody></table></div></section>

    <section className="x-card"><div className="x-card-title"><h3>Ringkasan Penggunaan Sistem</h3></div><div className="x-detail"><p><b>Total pengajuan:</b> {data.requests.length}</p><p><b>Total service selesai:</b> {data.services.filter(x => x.status === 'SELESAI').length}</p><p><b>Total approval disetujui:</b> {metrics.approved}</p><p><b>Total tagihan rental:</b> {money(metrics.rentalGross)}</p><p><b>Total dibayar rental:</b> {money(metrics.rentalPaid)}</p><p><b>Total potongan repair rental:</b> {money(metrics.totalDeduction)}</p></div></section>
  </div>
}
