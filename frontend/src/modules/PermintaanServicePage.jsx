import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import './PermintaanServicePage.css'

const EMPTY_FORM = {
  kendaraan_id: '',
  jenis_permintaan: 'SERVICE',
  kilometer: '',
  keluhan: '',
  prioritas: 'NORMAL',
}

const TYPE_LABELS = {
  SERVICE: 'Service',
  GANTI_BAN: 'Ganti Ban',
  GANTI_AKI: 'Ganti Aki / Baterai',
  PEMERIKSAAN: 'Pemeriksaan',
}

const STATUS_LABELS = {
  MENUNGGU_TRANSPORT: 'Menunggu Transport',
  DITERIMA_TRANSPORT: 'Diterima Transport',
  DALAM_PROSES: 'Dalam Proses',
  MENUNGGU_APPROVAL: 'Menunggu Approval',
  DISETUJUI: 'Disetujui',
  DITOLAK: 'Ditolak',
  SELESAI: 'Selesai',
  DIBATALKAN: 'Dibatalkan',
}

const ACTIVE_REQUEST_STATUSES = [
  'MENUNGGU_TRANSPORT',
  'DITERIMA_TRANSPORT',
  'DALAM_PROSES',
  'MENUNGGU_APPROVAL',
  'DISETUJUI',
]

function formatDate(value) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(new Date(value))
}

function formatNumber(value) {
  if (value === null || value === undefined || value === '') return '-'
  return new Intl.NumberFormat('id-ID').format(Number(value))
}

function PermintaanServicePage({ profile }) {
  const [vehicles, setVehicles] = useState([])
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('SEMUA')
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const canCreate = ['ADMIN', 'OPERASIONAL'].includes(profile?.role)

  const loadData = async () => {
    setLoading(true)
    setErrorMessage('')

    const [vehicleResult, requestResult] = await Promise.all([
      supabase
        .from('kendaraan')
        .select('id,kode_kendaraan,nomor_polisi,merk,tipe,jenis_kendaraan,kepemilikan,jenis_sewa,pemilik,driver_id,lokasi,kilometer_terakhir,status,kondisi')
        .order('nomor_polisi', { ascending: true }),
      supabase
        .from('permintaan_service')
        .select('id,nomor_pengajuan,pemohon_id,kendaraan_id,tanggal_pengajuan,kilometer_pengajuan,jenis_permintaan,keluhan,prioritas,status,catatan_transport,diproses_oleh,diproses_at,created_at')
        .order('created_at', { ascending: false }),
    ])

    if (vehicleResult.error) {
      setVehicles([])
      setErrorMessage(`Data kendaraan belum dapat dimuat: ${vehicleResult.error.message}`)
    } else {
      setVehicles(vehicleResult.data || [])
    }

    if (requestResult.error) {
      setRequests([])
      setErrorMessage((current) => current || `Data pengajuan belum dapat dimuat: ${requestResult.error.message}`)
    } else {
      setRequests(requestResult.data || [])
    }

    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const vehiclesById = useMemo(
    () => Object.fromEntries(vehicles.map((vehicle) => [vehicle.id, vehicle])),
    [vehicles],
  )

  const filteredRequests = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    return requests.filter((request) => {
      const vehicle = vehiclesById[request.kendaraan_id]
      const haystack = [
        request.nomor_pengajuan,
        request.keluhan,
        vehicle?.nomor_polisi,
        vehicle?.kode_kendaraan,
        vehicle?.merk,
        vehicle?.tipe,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return (
        (!keyword || haystack.includes(keyword)) &&
        (statusFilter === 'SEMUA' || request.status === statusFilter)
      )
    })
  }, [requests, vehiclesById, search, statusFilter])

  const openForm = () => {
    setForm(EMPTY_FORM)
    setErrorMessage('')
    setSuccessMessage('')
    setSelectedRequest(null)
    setShowForm(true)
  }

  const handleVehicleChange = (event) => {
    const kendaraanId = event.target.value
    const vehicle = vehiclesById[kendaraanId]

    setForm((current) => ({
      ...current,
      kendaraan_id: kendaraanId,
      kilometer: vehicle?.kilometer_terakhir ?? '',
    }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setErrorMessage('')
    setSuccessMessage('')

    if (!profile?.id) {
      setErrorMessage('Profil pengguna belum tersedia. Silakan login ulang.')
      return
    }

    if (!form.kendaraan_id) {
      setErrorMessage('Kendaraan wajib dipilih.')
      return
    }

    if (!form.keluhan.trim()) {
      setErrorMessage('Keluhan atau kebutuhan service wajib diisi.')
      return
    }

    const selectedVehicle = vehiclesById[form.kendaraan_id]
    if (!selectedVehicle) {
      setErrorMessage('Data kendaraan tidak ditemukan. Silakan pilih kembali.')
      return
    }

    if (selectedVehicle.status === 'TIDAK_AKTIF') {
      setErrorMessage('Kendaraan tidak aktif dan tidak dapat diajukan untuk service.')
      return
    }

    const kilometer = Number(form.kilometer)
    if (!Number.isFinite(kilometer) || kilometer < 0) {
      setErrorMessage('Kilometer harus berupa angka yang valid.')
      return
    }

    setSaving(true)

    const { data, error } = await supabase
      .from('permintaan_service')
      .insert({
        pemohon_id: profile.id,
        kendaraan_id: Number(form.kendaraan_id),
        tanggal_pengajuan: new Date().toISOString().slice(0, 10),
        kilometer_pengajuan: kilometer,
        jenis_permintaan: form.jenis_permintaan,
        keluhan: form.keluhan.trim(),
        prioritas: form.prioritas,
        status: 'MENUNGGU_TRANSPORT',
      })
      .select('id,nomor_pengajuan')
      .single()

    if (error) {
      setErrorMessage(`Gagal membuat pengajuan: ${error.message}`)
      setSaving(false)
      return
    }

    await loadData()
    setShowForm(false)
    setSaving(false)
    setSuccessMessage(
      `Pengajuan ${data?.nomor_pengajuan || ''} berhasil dibuat dan dikirim ke Transport.`.trim(),
    )
  }

  const activeCount = requests.filter((request) => ACTIVE_REQUEST_STATUSES.includes(request.status)).length
  const waitingCount = requests.filter((request) => request.status === 'MENUNGGU_TRANSPORT').length
  const doneCount = requests.filter((request) => ['SELESAI', 'DIBATALKAN'].includes(request.status)).length

  return (
    <div className="request-page">
      <div className="request-header">
        <div>
          <span className="eyebrow">OPERASIONAL • TRANSPORT</span>
          <h2>Permintaan Service</h2>
          <p>
            Ajukan kebutuhan kendaraan tanpa mengetik ulang data armada. Identitas dan KM terakhir
            terisi otomatis.
          </p>
        </div>
        {canCreate && (
          <button className="request-primary-button" type="button" onClick={openForm}>
            + Buat Pengajuan
          </button>
        )}
      </div>

      {successMessage && <div className="request-alert success">{successMessage}</div>}
      {errorMessage && !showForm && <div className="request-alert error">{errorMessage}</div>}

      <section className="request-summary-grid">
        <div>
          <span>Menunggu Transport</span>
          <strong>{waitingCount}</strong>
          <small>Perlu diproses</small>
        </div>
        <div>
          <span>Masih Berjalan</span>
          <strong>{activeCount}</strong>
          <small>Belum selesai</small>
        </div>
        <div>
          <span>Selesai / Batal</span>
          <strong>{doneCount}</strong>
          <small>Riwayat pengajuan</small>
        </div>
      </section>

      <section className="request-panel">
        <div className="request-toolbar">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari nomor, plat, merk, keluhan..."
          />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="SEMUA">Semua status</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button className="request-light-button" type="button" onClick={loadData} disabled={loading}>
            ↻ Refresh
          </button>
        </div>

        <div className="request-table-wrap">
          {loading ? (
            <div className="request-empty">Memuat pengajuan...</div>
          ) : filteredRequests.length === 0 ? (
            <div className="request-empty">
              <strong>Belum ada pengajuan yang cocok.</strong>
              <span>
                {canCreate
                  ? 'Buat pengajuan pertama dari tombol di atas.'
                  : 'Data akan muncul ketika pengajuan tersedia.'}
              </span>
            </div>
          ) : (
            <table className="request-table">
              <thead>
                <tr>
                  <th>Pengajuan</th>
                  <th>Kendaraan</th>
                  <th>Kebutuhan</th>
                  <th>KM</th>
                  <th>Prioritas</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((request) => {
                  const vehicle = vehiclesById[request.kendaraan_id]

                  return (
                    <tr key={request.id}>
                      <td>
                        <div className="request-main-cell">
                          <strong>{request.nomor_pengajuan || `#${request.id}`}</strong>
                          <span>{formatDate(request.tanggal_pengajuan)}</span>
                        </div>
                      </td>
                      <td>
                        <div className="request-main-cell">
                          <strong>{vehicle?.nomor_polisi || '-'}</strong>
                          <span>
                            {vehicle
                              ? `${vehicle.merk}${vehicle.tipe ? ` • ${vehicle.tipe}` : ''}`
                              : 'Data kendaraan tidak ditemukan'}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="request-main-cell">
                          <strong>{TYPE_LABELS[request.jenis_permintaan] || request.jenis_permintaan}</strong>
                          <span>{request.keluhan}</span>
                        </div>
                      </td>
                      <td>
                        <strong>{formatNumber(request.kilometer_pengajuan)} km</strong>
                      </td>
                      <td>
                        <span className={`request-priority priority-${request.prioritas.toLowerCase()}`}>
                          {request.prioritas === 'MENDESAK' ? 'Mendesak' : 'Normal'}
                        </span>
                      </td>
                      <td>
                        <span className={`request-status status-${request.status.toLowerCase()}`}>
                          {STATUS_LABELS[request.status] || request.status}
                        </span>
                      </td>
                      <td>
                        <button
                          className="request-detail-button"
                          type="button"
                          onClick={() => setSelectedRequest(request)}
                        >
                          Detail
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="request-footer">
          Menampilkan {filteredRequests.length} dari {requests.length} pengajuan
        </div>
      </section>

      {showForm && (
        <div
          className="request-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) setShowForm(false)
          }}
        >
          <section
            className="request-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="request-form-title"
          >
            <div className="request-modal-header">
              <div>
                <span className="eyebrow">PENGAJUAN SERVICE</span>
                <h3 id="request-form-title">Buat Permintaan Baru</h3>
              </div>
              <button
                type="button"
                className="request-close-button"
                onClick={() => !saving && setShowForm(false)}
                disabled={saving}
              >
                ×
              </button>
            </div>

            {errorMessage && <div className="request-alert error">{errorMessage}</div>}

            <form onSubmit={handleSubmit}>
              <div className="request-form-grid">
                <div className="request-field full">
                  <label htmlFor="request-vehicle">Kendaraan*</label>
                  <select
                    id="request-vehicle"
                    value={form.kendaraan_id}
                    onChange={handleVehicleChange}
                    disabled={saving}
                  >
                    <option value="">Pilih kendaraan...</option>
                    {vehicles
                      .filter((vehicle) => vehicle.status !== 'TIDAK_AKTIF')
                      .map((vehicle) => (
                        <option key={vehicle.id} value={vehicle.id}>
                          {vehicle.nomor_polisi} — {vehicle.merk}
                          {vehicle.tipe ? ` ${vehicle.tipe}` : ''}
                        </option>
                      ))}
                  </select>
                  <small>Pilih kendaraan sekali; data identitas akan tampil otomatis.</small>
                </div>

                {form.kendaraan_id && (
                  <div className="request-vehicle-preview full">
                    {(() => {
                      const vehicle = vehiclesById[form.kendaraan_id]
                      return (
                        <>
                          <div>
                            <span>Nomor Polisi</span>
                            <strong>{vehicle?.nomor_polisi || '-'}</strong>
                          </div>
                          <div>
                            <span>Merk / Tipe</span>
                            <strong>
                              {vehicle
                                ? `${vehicle.merk}${vehicle.tipe ? ` • ${vehicle.tipe}` : ''}`
                                : '-'}
                            </strong>
                          </div>
                          <div>
                            <span>Kepemilikan</span>
                            <strong>
                              {vehicle?.kepemilikan === 'SEWA'
                                ? `Sewa • ${vehicle.jenis_sewa === 'SEWA_PERORANGAN' ? 'Perorangan' : 'Rental'}`
                                : 'Aset Kantor'}
                            </strong>
                          </div>
                          <div>
                            <span>Pemilik / PIC</span>
                            <strong>{vehicle?.pemilik || 'Mengikuti data driver kendaraan'}</strong>
                          </div>
                          <div>
                            <span>Lokasi</span>
                            <strong>{vehicle?.lokasi || '-'}</strong>
                          </div>
                          <div>
                            <span>KM Terakhir</span>
                            <strong>{formatNumber(vehicle?.kilometer_terakhir)} km</strong>
                          </div>
                        </>
                      )
                    })()}
                  </div>
                )}

                <div className="request-field">
                  <label htmlFor="request-type">Jenis Kebutuhan*</label>
                  <select
                    id="request-type"
                    value={form.jenis_permintaan}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, jenis_permintaan: event.target.value }))
                    }
                    disabled={saving}
                  >
                    {Object.entries(TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="request-field">
                  <label htmlFor="request-km">KM Saat Pengajuan*</label>
                  <input
                    id="request-km"
                    type="number"
                    min="0"
                    step="1"
                    value={form.kilometer}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, kilometer: event.target.value }))
                    }
                    disabled={saving}
                  />
                  <small>Otomatis dari KM terakhir; bisa dikoreksi setelah pemeriksaan.</small>
                </div>

                <div className="request-field full">
                  <label htmlFor="request-priority">Prioritas</label>
                  <select
                    id="request-priority"
                    value={form.prioritas}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, prioritas: event.target.value }))
                    }
                    disabled={saving}
                  >
                    <option value="NORMAL">Normal</option>
                    <option value="MENDESAK">Mendesak</option>
                  </select>
                </div>

                <div className="request-field full">
                  <label htmlFor="request-complaint">Keluhan / Kebutuhan Service*</label>
                  <textarea
                    id="request-complaint"
                    rows="5"
                    value={form.keluhan}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, keluhan: event.target.value }))
                    }
                    placeholder="Contoh: Mesin terasa bergetar saat idle dan perlu diperiksa."
                    disabled={saving}
                  />
                  <small>Tuliskan masalah atau kebutuhan secara jelas.</small>
                </div>
              </div>

              <div className="request-form-actions">
                <button
                  className="request-light-button"
                  type="button"
                  onClick={() => setShowForm(false)}
                  disabled={saving}
                >
                  Batal
                </button>
                <button className="request-primary-button" type="submit" disabled={saving}>
                  {saving ? 'Mengirim...' : 'Kirim Pengajuan'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {selectedRequest && (
        <div
          className="request-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedRequest(null)
          }}
        >
          <section
            className="request-modal request-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="request-detail-title"
          >
            <div className="request-modal-header">
              <div>
                <span className="eyebrow">DETAIL PENGAJUAN</span>
                <h3 id="request-detail-title">
                  {selectedRequest.nomor_pengajuan || `Pengajuan #${selectedRequest.id}`}
                </h3>
              </div>
              <button
                type="button"
                className="request-close-button"
                onClick={() => setSelectedRequest(null)}
              >
                ×
              </button>
            </div>
            <div className="request-detail-grid">
              <div>
                <span>Status</span>
                <strong>{STATUS_LABELS[selectedRequest.status] || selectedRequest.status}</strong>
              </div>
              <div>
                <span>Tanggal</span>
                <strong>{formatDate(selectedRequest.tanggal_pengajuan)}</strong>
              </div>
              <div>
                <span>Jenis</span>
                <strong>{TYPE_LABELS[selectedRequest.jenis_permintaan] || selectedRequest.jenis_permintaan}</strong>
              </div>
              <div>
                <span>Prioritas</span>
                <strong>{selectedRequest.prioritas === 'MENDESAK' ? 'Mendesak' : 'Normal'}</strong>
              </div>
              <div>
                <span>Kendaraan</span>
                <strong>{vehiclesById[selectedRequest.kendaraan_id]?.nomor_polisi || '-'}</strong>
              </div>
              <div>
                <span>KM</span>
                <strong>{formatNumber(selectedRequest.kilometer_pengajuan)} km</strong>
              </div>
              <div className="full">
                <span>Keluhan / Kebutuhan</span>
                <p>{selectedRequest.keluhan}</p>
              </div>
              <div className="full">
                <span>Catatan Transport</span>
                <p>{selectedRequest.catatan_transport || 'Belum ada catatan dari Transport.'}</p>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

export default PermintaanServicePage
