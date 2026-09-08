import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { exportToExcel } from '../utils/exportExcel'
import './TransportOperationsFixed.css'

const money = v => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(v || 0))
const date = v => v ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(new Date(v)) : '-'
const DAYS = 30 * 86400000

const columns = (keys) => keys.map(([key, label]) => ({ key, label }))
const text = value => value == null || value === '' ? '-' : value

export default function ReportsFeaturePage() {
  const [data, setData] = useState({ vehicles: [], services: [], requests: [], contracts: [], payments: [], docs: [], approvals: [], repairs: [], deductions: [] })
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
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

  const exportAll = async () => {
    setExporting(true)
    setError('')
    try {
      const vehicleMap = Object.fromEntries(data.vehicles.map(v => [v.id, v]))
      const requestMap = Object.fromEntries(data.requests.map(r => [r.id, r]))
      const contractMap = Object.fromEntries(data.contracts.map(c => [c.id, c]))
      const ownerMap = {}

      const [ownerResult] = await Promise.all([
        supabase.from('pemilik_sewa').select('*').order('nama_pemilik'),
      ])
      ;(ownerResult.data || []).forEach(o => { ownerMap[o.id] = o })

      const exportRows = rows => rows.map(row => ({ ...row }))

      exportToExcel(`Rekap-Transport-ZT-${new Date().toISOString().slice(0, 10)}.xls`, [
        {
          title: 'RINGKASAN',
          columns: columns([
            ['totalVehicles', 'Total Kendaraan'], ['activeContracts', 'Kontrak Aktif'], ['pendingRequests', 'Pengajuan Menunggu'], ['pendingApproval', 'Service Menunggu Approval'],
            ['serviceCost', 'Total Biaya Service'], ['rentalPaid', 'Total Pembayaran Rental'], ['totalDeduction', 'Total Potongan Rental'], ['soonDocs', 'Dokumen <= 30 Hari'],
            ['overduePayments', 'Pembayaran Bermasalah'], ['approved', 'Approval Disetujui'],
          ]),
          rows: [{ ...metrics, serviceCost: money(metrics.serviceCost), rentalPaid: money(metrics.rentalPaid), totalDeduction: money(metrics.totalDeduction) }],
        },
        {
          title: 'KENDARAAN',
          columns: columns([['kode_kendaraan','Kode Kendaraan'],['nomor_polisi','Nomor Polisi'],['merk','Merk'],['tipe','Tipe'],['jenis_kendaraan','Jenis Kendaraan'],['tahun','Tahun'],['warna','Warna'],['nomor_rangka','Nomor Rangka'],['nomor_mesin','Nomor Mesin'],['kepemilikan','Kepemilikan'],['jenis_sewa','Jenis Sewa'],['pemilik','Pemilik/PIC'],['lokasi','Lokasi'],['kilometer_terakhir','KM Terakhir'],['status','Status'],['kondisi','Kondisi'],['keterangan','Keterangan']]),
          rows: exportRows(data.vehicles),
        },
        {
          title: 'PENGAJUAN SERVICE',
          columns: columns([['nomor_pengajuan','Nomor Pengajuan'],['tanggal_pengajuan','Tanggal Pengajuan'],['kendaraan_id','ID Kendaraan'],['kilometer_pengajuan','KM Pengajuan'],['jenis_permintaan','Jenis Permintaan'],['keluhan','Keluhan'],['prioritas','Prioritas'],['status','Status'],['catatan_transport','Catatan Transport'],['diproses_at','Diproses At']]),
          rows: exportRows(data.requests).map(r => ({ ...r, kendaraan_id: vehicleMap[r.kendaraan_id]?.nomor_polisi || r.kendaraan_id })),
        },
        {
          title: 'SERVICE',
          columns: columns([['nomor_service','Nomor Service'],['tanggal_service','Tanggal Service'],['kendaraan','Nomor Polisi'],['permintaan','Nomor Pengajuan'],['kilometer','KM'],['bengkel','Bengkel'],['jenis_service','Jenis Service'],['keluhan','Keluhan'],['estimasi_biaya','Estimasi Biaya'],['biaya_aktual','Biaya Aktual'],['status','Status'],['catatan','Catatan']]),
          rows: exportRows(data.services).map(s => ({ ...s, kendaraan: vehicleMap[s.kendaraan_id]?.nomor_polisi || '-', permintaan: requestMap[s.permintaan_service_id]?.nomor_pengajuan || '-' })),
        },
        {
          title: 'SERVICE APPROVAL',
          columns: columns([['service_id','Service'],['urutan','Urutan'],['jenis_approval','Jenis Approval'],['pemberi_approval','Pemberi Approval ID'],['status','Status'],['waktu_approval','Waktu Approval'],['catatan','Catatan']]),
          rows: exportRows(data.approvals),
        },
        {
          title: 'KONTRAK SEWA',
          columns: columns([['nomor_kontrak','Nomor Kontrak'],['kendaraan','Nomor Polisi'],['pemilik','Pemilik'],['tanggal_mulai','Tanggal Mulai'],['tanggal_selesai','Tanggal Selesai'],['periode_bulan','Periode Bulan'],['nilai_sewa_bulanan','Nilai Sewa Bulanan'],['tanggal_jatuh_tempo_bulanan','Jatuh Tempo Bulanan'],['status','Status'],['catatan','Catatan']]),
          rows: exportRows(data.contracts).map(c => ({ ...c, kendaraan: vehicleMap[c.kendaraan_id]?.nomor_polisi || '-', pemilik: ownerMap[c.pemilik_sewa_id]?.nama_pemilik || '-' })),
        },
        {
          title: 'PEMBAYARAN SEWA',
          columns: columns([['kontrak','Nomor Kontrak'],['kendaraan','Nomor Polisi'],['periode_ke','Periode Ke'],['bulan_pembayaran','Bulan Pembayaran'],['tanggal_jatuh_tempo','Jatuh Tempo'],['jumlah_tagihan','Tagihan'],['jumlah_dibayar','Dibayar'],['status','Status'],['metode_pembayaran','Metode'],['nomor_referensi','No Referensi'],['catatan','Catatan']]),
          rows: exportRows(data.payments).map(p => ({ ...p, kontrak: contractMap[p.kontrak_sewa_id]?.nomor_kontrak || `#${p.kontrak_sewa_id}`, kendaraan: vehicleMap[contractMap[p.kontrak_sewa_id]?.kendaraan_id]?.nomor_polisi || '-' })),
        },
        {
          title: 'PERBAIKAN KENDARAAN SEWA',
          columns: columns([['kendaraan','Nomor Polisi'],['kontrak','Nomor Kontrak'],['tanggal_kejadian','Tanggal Kejadian'],['kilometer','KM'],['jenis_kerusakan','Jenis Kerusakan'],['deskripsi_kerusakan','Deskripsi'],['penyebab','Penyebab'],['estimasi_biaya','Estimasi'],['biaya_aktual','Aktual'],['metode_penanganan','Metode'],['dibayar_kantor','Dibayar Kantor'],['tanggal_dibayar','Tanggal Dibayar'],['pemilik_diberitahu','Pemilik Diberitahu'],['status','Status'],['dapat_dipotong','Dapat Dipotong'],['jumlah_dipotong','Jumlah Dipotong'],['catatan','Catatan']]),
          rows: exportRows(data.repairs).map(r => ({ ...r, kendaraan: vehicleMap[r.kendaraan_id]?.nomor_polisi || '-', kontrak: contractMap[r.kontrak_sewa_id]?.nomor_kontrak || '-' })),
        },
        {
          title: 'POTONGAN PEMBAYARAN SEWA',
          columns: columns([['pembayaran_sewa_id','ID Pembayaran'],['perbaikan_sewa_id','ID Perbaikan'],['jumlah_potongan','Jumlah Potongan'],['catatan','Catatan'],['created_at','Dibuat']]),
          rows: exportRows(data.deductions),
        },
        {
          title: 'DOKUMEN KENDARAAN',
          columns: columns([['kendaraan','Nomor Polisi'],['jenis_dokumen','Jenis Dokumen'],['nomor_dokumen','Nomor Dokumen'],['tanggal_terbit','Tanggal Terbit'],['tanggal_berlaku_mulai','Berlaku Mulai'],['tanggal_jatuh_tempo','Jatuh Tempo'],['keterangan','Keterangan']]),
          rows: exportRows(data.docs).map(d => ({ ...d, kendaraan: vehicleMap[d.kendaraan_id]?.nomor_polisi || '-' })),
        },
      ])
    } catch (exportError) {
      console.error('Export Excel error:', exportError)
      setError(`Gagal mengekspor Excel: ${exportError.message || 'kesalahan tidak diketahui'}`)
    } finally {
      setExporting(false)
    }
  }

  if (loading) return <div className="x-page"><div className="x-card"><div className="x-empty">Memuat laporan...</div></div></div>

  return <div className="x-page">
    <div className="x-head"><div><span className="eyebrow">LAPORAN & REKAP</span><h2>Laporan Transport</h2><p>Ringkasan armada, service, approval, sewa, pembayaran, potongan, dan dokumen.</p></div><div className="x-actions"><button className="x-btn secondary" onClick={load}>↻ Refresh</button><button className="x-btn primary" onClick={exportAll} disabled={exporting}>{exporting ? 'Menyiapkan Excel…' : 'Export Semua Data ke Excel'}</button></div></div>
    {error && <div className="x-alert error">{error}</div>}

    <section className="x-card" style={{ background: '#f4f8f5' }}>
      <div className="x-card-title"><div><h3>Rekap Lengkap untuk Atasan / Bos</h3><p>Satu file berisi seluruh data transport yang dapat diakses oleh role ini: kendaraan, pengajuan, service, approval, kontrak sewa, pembayaran, perbaikan, potongan, dan dokumen.</p></div></div>
      <div className="x-actions"><button className="x-btn primary" onClick={exportAll} disabled={exporting}>{exporting ? 'Membuat file…' : '↓ Download Rekap Excel'}</button></div>
    </section>

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
