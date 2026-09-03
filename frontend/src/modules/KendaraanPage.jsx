import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import './KendaraanPage.css'

const EMPTY_FORM = {
  kode_kendaraan: '',
  nomor_polisi: '',
  merk: '',
  tipe: '',
  jenis_kendaraan: '',
  tahun: '',
  warna: '',
  nomor_rangka: '',
  nomor_mesin: '',
  kepemilikan: 'ASET_KANTOR',
  jenis_sewa: '',
  pemilik: '',
  driver_id: '',
  lokasi: '',
  kilometer_terakhir: '',
  status: 'ACTIVE',
  kondisi: '',
  keterangan: '',
}

const STATUS_LABELS = {
  ACTIVE: 'Aktif',
  SERVICE: 'Service',
  TIDAK_AKTIF: 'Tidak Aktif',
}

const OWNERSHIP_LABELS = {
  ASET_KANTOR: 'Aset Kantor',
  SEWA: 'Sewa',
}

const RENTAL_LABELS = {
  SEWA_PERORANGAN: 'Sewa Perorangan',
  SEWA_RENTAL: 'Sewa Rental',
}

function formatNumber(value) {
  if (value === null || value === undefined || value === '') return '-'
  return new Intl.NumberFormat('id-ID').format(Number(value))
}

function KendaraanPage() {
  const [vehicles, setVehicles] = useState([])
  const [drivers, setDrivers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('SEMUA')
  const [ownershipFilter, setOwnershipFilter] = useState('SEMUA')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [selectedVehicle, setSelectedVehicle] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const loadData = async () => {
    setLoading(true)
    setErrorMessage('')

    const [vehicleResult, driverResult] = await Promise.all([
      supabase
        .from('kendaraan')
        .select('id, kode_kendaraan, nomor_polisi, merk, tipe, jenis_kendaraan, tahun, warna, nomor_rangka, nomor_mesin, kepemilikan, jenis_sewa, pemilik, driver_id, lokasi, kilometer_terakhir, status, kondisi, keterangan, driver:driver_id(id, nama, nomor_hp, status)')
        .order('nomor_polisi', { ascending: true }),
      supabase
        .from('driver')
        .select('id, nama, nomor_hp, status, nomor_sim, masa_berlaku_sim, lokasi')
        .order('nama', { ascending: true }),
    ])

    if (vehicleResult.error) {
      setErrorMessage(`Data kendaraan belum dapat dimuat: ${vehicleResult.error.message}`)
      setVehicles([])
    } else {
      setVehicles(vehicleResult.data || [])
    }

    if (driverResult.error) {
      setErrorMessage((current) => current || `Data driver belum dapat dimuat: ${driverResult.error.message}`)
      setDrivers([])
    } else {
      setDrivers(driverResult.data || [])
    }

    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const filteredVehicles = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return vehicles.filter((vehicle) => {
      const haystack = [
        vehicle.kode_kendaraan,
        vehicle.nomor_polisi,
        vehicle.merk,
        vehicle.tipe,
        vehicle.jenis_kendaraan,
        vehicle.pemilik,
        vehicle.lokasi,
        vehicle.driver?.nama,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      const matchesSearch = !keyword || haystack.includes(keyword)
      const matchesStatus = statusFilter === 'SEMUA' || vehicle.status === statusFilter
      const matchesOwnership = ownershipFilter === 'SEMUA' || vehicle.kepemilikan === ownershipFilter
      return matchesSearch && matchesStatus && matchesOwnership
    })
  }, [vehicles, search, statusFilter, ownershipFilter])

  const openAddForm = () => {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setSelectedVehicle(null)
    setErrorMessage('')
    setSuccessMessage('')
    setShowForm(true)
  }

  const openEditForm = (vehicle) => {
    setForm({
      kode_kendaraan: vehicle.kode_kendaraan || '',
      nomor_polisi: vehicle.nomor_polisi || '',
      merk: vehicle.merk || '',
      tipe: vehicle.tipe || '',
      jenis_kendaraan: vehicle.jenis_kendaraan || '',
      tahun: vehicle.tahun ?? '',
      warna: vehicle.warna || '',
      nomor_rangka: vehicle.nomor_rangka || '',
      nomor_mesin: vehicle.nomor_mesin || '',
      kepemilikan: vehicle.kepemilikan || 'ASET_KANTOR',
      jenis_sewa: vehicle.jenis_sewa || '',
      pemilik: vehicle.pemilik || '',
      driver_id: vehicle.driver_id || '',
      lokasi: vehicle.lokasi || '',
      kilometer_terakhir: vehicle.kilometer_terakhir ?? '',
      status: vehicle.status || 'ACTIVE',
      kondisi: vehicle.kondisi || '',
      keterangan: vehicle.keterangan || '',
    })
    setEditingId(vehicle.id)
    setSelectedVehicle(null)
    setErrorMessage('')
    setSuccessMessage('')
    setShowForm(true)
  }

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((current) => {
      const next = { ...current, [name]: value }
      if (name === 'kepemilikan' && value === 'ASET_KANTOR') {
        next.jenis_sewa = ''
      }
      return next
    })
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setErrorMessage('')
    setSuccessMessage('')

    const nomorPolisi = form.nomor_polisi.trim().toUpperCase()
    const merk = form.merk.trim()
    const kode = form.kode_kendaraan.trim().toUpperCase()

    if (!kode || !nomorPolisi || !merk) {
      setErrorMessage('Kode kendaraan, nomor polisi, dan merk wajib diisi.')
      return
    }

    if (form.kepemilikan === 'SEWA' && !form.jenis_sewa) {
      setErrorMessage('Jenis sewa wajib dipilih untuk kendaraan dengan kepemilikan SEWA.')
      return
    }

    setSaving(true)

    const payload = {
      kode_kendaraan: kode,
      nomor_polisi: nomorPolisi,
      merk,
      tipe: form.tipe.trim() || null,
      jenis_kendaraan: form.jenis_kendaraan.trim() || null,
      tahun: form.tahun === '' ? null : Number(form.tahun),
      warna: form.warna.trim() || null,
      nomor_rangka: form.nomor_rangka.trim() || null,
      nomor_mesin: form.nomor_mesin.trim() || null,
      kepemilikan: form.kepemilikan,
      jenis_sewa: form.kepemilikan === 'SEWA' ? form.jenis_sewa : null,
      pemilik: form.pemilik.trim() || null,
      driver_id: form.driver_id ? Number(form.driver_id) : null,
      lokasi: form.lokasi.trim() || null,
      kilometer_terakhir: form.kilometer_terakhir === '' ? 0 : Number(form.kilometer_terakhir),
      status: form.status,
      kondisi: form.kondisi.trim() || null,
      keterangan: form.keterangan.trim() || null,
    }

    const result = editingId
      ? await supabase.from('kendaraan').update(payload).eq('id', editingId).select().single()
      : await supabase.from('kendaraan').insert(payload).select().single()

    if (result.error) {
      setErrorMessage(`Gagal menyimpan kendaraan: ${result.error.message}`)
      setSaving(false)
      return
    }

    await loadData()
    setSaving(false)
    setShowForm(false)
    setEditingId(null)
    setSuccessMessage(editingId ? 'Data kendaraan berhasil diperbarui.' : 'Data kendaraan berhasil ditambahkan.')
  }

  const closeForm = () => {
    if (saving) return
    setShowForm(false)
    setEditingId(null)
    setErrorMessage('')
  }

  return (
    <div className="vehicle-page">
      <div className="module-header">
        <div>
          <span className="eyebrow">MASTER DATA</span>
          <h2>Data Kendaraan</h2>
          <p>Satu sumber data untuk identitas kendaraan, kepemilikan, driver, lokasi, dan kondisi armada.</p>
        </div>
        <button className="vehicle-primary-button" type="button" onClick={openAddForm}>+ Tambah Kendaraan</button>
      </div>

      {successMessage && <div className="vehicle-alert success">{successMessage}</div>}
      {errorMessage && !showForm && <div className="vehicle-alert error">{errorMessage}</div>}

      <section className="vehicle-summary-grid">
        <div><span>Total</span><strong>{vehicles.length}</strong><small>Semua kendaraan</small></div>
        <div><span>Aktif</span><strong>{vehicles.filter((item) => item.status === 'ACTIVE').length}</strong><small>Siap digunakan</small></div>
        <div><span>Service</span><strong>{vehicles.filter((item) => item.status === 'SERVICE').length}</strong><small>Sedang ditangani</small></div>
        <div><span>Sewa</span><strong>{vehicles.filter((item) => item.kepemilikan === 'SEWA').length}</strong><small>Kendaraan sewa</small></div>
      </section>

      <section className="vehicle-panel">
        <div className="vehicle-toolbar">
          <input
            className="vehicle-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari plat, kode, merk, driver, lokasi..."
          />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="SEMUA">Semua status</option>
            <option value="ACTIVE">Aktif</option>
            <option value="SERVICE">Service</option>
            <option value="TIDAK_AKTIF">Tidak aktif</option>
          </select>
          <select value={ownershipFilter} onChange={(event) => setOwnershipFilter(event.target.value)}>
            <option value="SEMUA">Semua kepemilikan</option>
            <option value="ASET_KANTOR">Aset kantor</option>
            <option value="SEWA">Sewa</option>
          </select>
          <button className="vehicle-light-button" type="button" onClick={loadData} disabled={loading}>↻ Refresh</button>
        </div>

        <div className="vehicle-table-wrap">
          {loading ? (
            <div className="vehicle-empty">Memuat data kendaraan...</div>
          ) : filteredVehicles.length === 0 ? (
            <div className="vehicle-empty">
              <strong>Tidak ada kendaraan ditemukan.</strong>
              <span>Periksa filter atau tambahkan data kendaraan baru.</span>
            </div>
          ) : (
            <table className="vehicle-table">
              <thead>
                <tr>
                  <th>Kendaraan</th>
                  <th>Identitas</th>
                  <th>Kepemilikan</th>
                  <th>Driver / PIC</th>
                  <th>KM Terakhir</th>
                  <th>Status</th>
                  <th aria-label="Aksi" />
                </tr>
              </thead>
              <tbody>
                {filteredVehicles.map((vehicle) => (
                  <tr key={vehicle.id}>
                    <td>
                      <div className="vehicle-main-cell">
                        <strong>{vehicle.nomor_polisi}</strong>
                        <span>{vehicle.merk}{vehicle.tipe ? ` • ${vehicle.tipe}` : ''}</span>
                        <small>{vehicle.kode_kendaraan}</small>
                      </div>
                    </td>
                    <td>
                      <div className="vehicle-secondary-cell">
                        <span>{vehicle.jenis_kendaraan || 'Jenis belum diisi'}</span>
                        <small>{vehicle.tahun || '-'}{vehicle.warna ? ` • ${vehicle.warna}` : ''}</small>
                      </div>
                    </td>
                    <td>
                      <div className="vehicle-secondary-cell">
                        <strong>{OWNERSHIP_LABELS[vehicle.kepemilikan]}</strong>
                        <small>{vehicle.kepemilikan === 'SEWA' ? RENTAL_LABELS[vehicle.jenis_sewa] || '-' : 'Milik perusahaan'}</small>
                      </div>
                    </td>
                    <td>
                      <div className="vehicle-secondary-cell">
                        <span>{vehicle.driver?.nama || vehicle.pemilik || 'Belum ditentukan'}</span>
                        <small>{vehicle.lokasi || '-'}</small>
                      </div>
                    </td>
                    <td><strong>{formatNumber(vehicle.kilometer_terakhir)} km</strong></td>
                    <td><span className={`vehicle-status status-${vehicle.status.toLowerCase()}`}>{STATUS_LABELS[vehicle.status]}</span></td>
                    <td>
                      <div className="vehicle-row-actions">
                        <button type="button" onClick={() => setSelectedVehicle(vehicle)}>Detail</button>
                        <button type="button" onClick={() => openEditForm(vehicle)}>Edit</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="vehicle-table-footer">Menampilkan {filteredVehicles.length} dari {vehicles.length} kendaraan</div>
      </section>

      {showForm && (
        <div className="vehicle-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeForm() }}>
          <section className="vehicle-modal vehicle-form-modal" role="dialog" aria-modal="true" aria-labelledby="vehicle-form-title">
            <div className="vehicle-modal-header">
              <div>
                <span className="eyebrow">MASTER DATA KENDARAAN</span>
                <h3 id="vehicle-form-title">{editingId ? 'Edit Kendaraan' : 'Tambah Kendaraan'}</h3>
              </div>
              <button type="button" className="vehicle-close-button" onClick={closeForm} disabled={saving}>×</button>
            </div>

            {errorMessage && <div className="vehicle-alert error">{errorMessage}</div>}

            <form onSubmit={handleSubmit}>
              <div className="vehicle-form-grid">
                <div className="vehicle-form-section">
                  <h4>Identitas Kendaraan</h4>
                  <div className="vehicle-fields two-columns">
                    <label>Kode Kendaraan*<input name="kode_kendaraan" value={form.kode_kendaraan} onChange={handleChange} placeholder="Contoh: KND-001" /></label>
                    <label>Nomor Polisi*<input name="nomor_polisi" value={form.nomor_polisi} onChange={handleChange} placeholder="BM 1234 XX" /></label>
                    <label>Merk*<input name="merk" value={form.merk} onChange={handleChange} placeholder="Toyota" /></label>
                    <label>Tipe<input name="tipe" value={form.tipe} onChange={handleChange} placeholder="Fortuner" /></label>
                    <label>Jenis Kendaraan<input name="jenis_kendaraan" value={form.jenis_kendaraan} onChange={handleChange} placeholder="SUV" /></label>
                    <label>Tahun<input type="number" min="1900" max="2100" name="tahun" value={form.tahun} onChange={handleChange} placeholder="2020" /></label>
                    <label>Warna<input name="warna" value={form.warna} onChange={handleChange} placeholder="Hitam" /></label>
                    <label>Lokasi<input name="lokasi" value={form.lokasi} onChange={handleChange} placeholder="Pekanbaru" /></label>
                    <label>Nomor Rangka<input name="nomor_rangka" value={form.nomor_rangka} onChange={handleChange} /></label>
                    <label>Nomor Mesin<input name="nomor_mesin" value={form.nomor_mesin} onChange={handleChange} /></label>
                  </div>
                </div>

                <div className="vehicle-form-section">
                  <h4>Kepemilikan & Operasional</h4>
                  <div className="vehicle-fields two-columns">
                    <label>Kepemilikan*<select name="kepemilikan" value={form.kepemilikan} onChange={handleChange}><option value="ASET_KANTOR">Aset Kantor</option><option value="SEWA">Sewa</option></select></label>
                    {form.kepemilikan === 'SEWA' && <label>Jenis Sewa*<select name="jenis_sewa" value={form.jenis_sewa} onChange={handleChange}><option value="">Pilih jenis sewa</option><option value="SEWA_PERORANGAN">Sewa Perorangan</option><option value="SEWA_RENTAL">Sewa Rental</option></select></label>}
                    <label>Pemilik / PIC<input name="pemilik" value={form.pemilik} onChange={handleChange} placeholder="Nama pemilik bila kendaraan sewa" /></label>
                    <label>Driver<select name="driver_id" value={form.driver_id} onChange={handleChange}><option value="">Belum ditentukan</option>{drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.nama}{driver.status ? ` — ${driver.status}` : ''}</option>)}</select></label>
                    <label>KM Terakhir<input type="number" min="0" name="kilometer_terakhir" value={form.kilometer_terakhir} onChange={handleChange} /></label>
                    <label>Status<select name="status" value={form.status} onChange={handleChange}><option value="ACTIVE">Aktif</option><option value="SERVICE">Service</option><option value="TIDAK_AKTIF">Tidak Aktif</option></select></label>
                    <label className="full-width">Kondisi<textarea name="kondisi" value={form.kondisi} onChange={handleChange} rows="2" placeholder="Contoh: Baik, ada goresan ringan di bumper..." /></label>
                    <label className="full-width">Keterangan<textarea name="keterangan" value={form.keterangan} onChange={handleChange} rows="2" /></label>
                  </div>
                </div>
              </div>

              <div className="vehicle-form-actions">
                <button className="vehicle-light-button" type="button" onClick={closeForm} disabled={saving}>Batal</button>
                <button className="vehicle-primary-button" type="submit" disabled={saving}>{saving ? 'Menyimpan...' : editingId ? 'Simpan Perubahan' : 'Simpan Kendaraan'}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {selectedVehicle && (
        <div className="vehicle-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedVehicle(null) }}>
          <section className="vehicle-modal" role="dialog" aria-modal="true" aria-labelledby="vehicle-detail-title">
            <div className="vehicle-modal-header">
              <div>
                <span className="eyebrow">DETAIL KENDARAAN</span>
                <h3 id="vehicle-detail-title">{selectedVehicle.nomor_polisi}</h3>
                <p>{selectedVehicle.merk}{selectedVehicle.tipe ? ` ${selectedVehicle.tipe}` : ''}</p>
              </div>
              <button type="button" className="vehicle-close-button" onClick={() => setSelectedVehicle(null)}>×</button>
            </div>

            <div className="vehicle-detail-grid">
              <Detail label="Kode" value={selectedVehicle.kode_kendaraan} />
              <Detail label="Jenis" value={selectedVehicle.jenis_kendaraan} />
              <Detail label="Tahun" value={selectedVehicle.tahun} />
              <Detail label="Warna" value={selectedVehicle.warna} />
              <Detail label="Kepemilikan" value={OWNERSHIP_LABELS[selectedVehicle.kepemilikan]} />
              <Detail label="Jenis Sewa" value={selectedVehicle.kepemilikan === 'SEWA' ? RENTAL_LABELS[selectedVehicle.jenis_sewa] : '-'} />
              <Detail label="Pemilik / PIC" value={selectedVehicle.pemilik} />
              <Detail label="Driver" value={selectedVehicle.driver?.nama} />
              <Detail label="Lokasi" value={selectedVehicle.lokasi} />
              <Detail label="KM Terakhir" value={`${formatNumber(selectedVehicle.kilometer_terakhir)} km`} />
              <Detail label="Status" value={STATUS_LABELS[selectedVehicle.status]} />
              <Detail label="Kondisi" value={selectedVehicle.kondisi} />
              <Detail label="Nomor Rangka" value={selectedVehicle.nomor_rangka} />
              <Detail label="Nomor Mesin" value={selectedVehicle.nomor_mesin} />
              <Detail label="Keterangan" value={selectedVehicle.keterangan} wide />
            </div>

            <div className="vehicle-form-actions">
              <button className="vehicle-light-button" type="button" onClick={() => setSelectedVehicle(null)}>Tutup</button>
              <button className="vehicle-primary-button" type="button" onClick={() => openEditForm(selectedVehicle)}>Edit Kendaraan</button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

function Detail({ label, value, wide = false }) {
  return (
    <div className={`vehicle-detail-item ${wide ? 'wide' : ''}`}>
      <span>{label}</span>
      <strong>{value || '-'}</strong>
    </div>
  )
}

export default KendaraanPage
