import assert from 'node:assert/strict'
import test from 'node:test'
import { matchesVehicleSearch } from '../src/utils/vehicleSearch.js'

const vehicle = {
  kode_kendaraan: 'KND-0102',
  nomor_polisi: 'BM 1234 XX',
  merk: 'Mitsubishi',
  tipe: 'L300',
  jenis_kendaraan: 'Pickup',
  tahun: 2022,
  nomor_mesin: '4N15UKB2434',
  nomor_rangka: 'MMBJJKL10PH065322',
  kepemilikan: 'ASET',
  jenis_sewa: null,
  harga_perolehan: 265000000,
  pemilik: 'PT Zaman Teknindo',
  unit_kerja: 'Operasional',
  lokasi: 'Pekanbaru',
  masa_berlaku_pajak: '2027-08-14',
  status_pajak: 'Aktif',
  status: 'ACTIVE',
  keterangan: 'Mobil operasional',
  catatan_hutang: '',
}
const driver = { nama_lengkap: 'Muhammad Surya Harja' }

test('search finds plate with or without spaces and punctuation', () => {
  assert.equal(matchesVehicleSearch(vehicle, driver, 'BM 1234 XX'), true)
  assert.equal(matchesVehicleSearch(vehicle, driver, 'BM1234XX'), true)
  assert.equal(matchesVehicleSearch(vehicle, driver, 'bm-1234-xx'), true)
})

test('search finds code, make, type, year, engine number, and chassis number', () => {
  for (const query of ['KND-0102', 'Mitsubishi', 'L300', '2022', '4N15UKB2434', 'MMBJJKL10PH065322']) {
    assert.equal(matchesVehicleSearch(vehicle, driver, query), true, query)
  }
})

test('search finds ownership, owner, department, location, tax and status fields', () => {
  for (const query of ['Aset', 'PT Zaman', 'Operasional', 'Pekanbaru', '2027-08-14', 'Aktif', 'Mobil operasional']) {
    assert.equal(matchesVehicleSearch(vehicle, driver, query), true, query)
  }
})

test('search finds acquisition price, rental type values, and driver name', () => {
  assert.equal(matchesVehicleSearch(vehicle, driver, '265000000'), true)
  assert.equal(matchesVehicleSearch(vehicle, driver, 'Muhammad Surya Harja'), true)
  assert.equal(matchesVehicleSearch({ ...vehicle, kepemilikan: 'SEWA', jenis_sewa: 'SEWA_PERUSAHAAN' }, driver, 'Sewa Perusahaan'), true)
})

test('empty query matches all and unrelated terms do not match', () => {
  assert.equal(matchesVehicleSearch(vehicle, driver, ''), true)
  assert.equal(matchesVehicleSearch(vehicle, driver, 'nomor yang tidak ada'), false)
})
