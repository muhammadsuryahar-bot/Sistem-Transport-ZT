import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { hasVehicleAcquisitionPrice } from '../src/utils/vehicleTableView.js'

test('acquisition price column is omitted when all values are blank but keeps zero', () => {
  assert.equal(hasVehicleAcquisitionPrice([]), false)
  assert.equal(hasVehicleAcquisitionPrice([{ harga_perolehan: null }, { harga_perolehan: undefined }, { harga_perolehan: '  ' }]), false)
  assert.equal(hasVehicleAcquisitionPrice([{ harga_perolehan: null }, { harga_perolehan: 125000 }]), true)
  assert.equal(hasVehicleAcquisitionPrice([{ harga_perolehan: 0 }]), true)
  assert.equal(hasVehicleAcquisitionPrice([{ harga_perolehan: '0' }]), true)
})

test('Kendaraan master groups related fields and avoids noisy blank cells', async () => {
  const [page, css, tools] = await Promise.all([
    readFile(new URL('../src/modules/MasterKendaraanExcelAlignedPage.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/MasterKendaraanExcelAlignedPage.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/DataPageTools.jsx', import.meta.url), 'utf8'),
  ])

  assert.match(page, /hasVehicleAcquisitionPrice\(vehicles\)/)
  assert.match(page, /showAcquisitionPrice && <th>Harga Perolehan<\\/th>/)
  assert.match(page, /showAcquisitionPrice && <td className="mep-col-price">/)
  assert.match(page, /<th>Kendaraan<\\/th><th>Jenis \\/ Kepemilikan<\\/th>/)
  assert.match(page, /<th>Pemilik \\/ Driver<\\/th><th>Lokasi \\/ Unit Kerja<\\/th>/)
  assert.match(page, /<th>Pajak \\/ Status<\\/th><th>Catatan &amp; Hutang<\\/th>/)
  assert.doesNotMatch(page, /<th>Jenis Sewa<\\/th>|<th>Driver<\\/th>/)
  assert.match(page, /const vehicleMeta =/)
  assert.match(page, /const note = clean\(v\.keterangan\)/)
  assert.match(css, /min-width: 960px/)
  assert.match(css, /mep-tax-status\.is-hidup/)
  assert.match(tools, /transport_vehicle_column_layout_version/)
  assert.match(tools, /if \(context === 'kendaraan'\)[\\s\\S]{0,900}dpt-row-mark-cell/)
  assert.match(tools, /preferences for other modules stay/)
})
