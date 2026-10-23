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

  assert.ok(page.includes('hasVehicleAcquisitionPrice(vehicles)'))
  assert.ok(page.includes('showAcquisitionPrice && <th>Harga Perolehan</th>'))
  assert.ok(page.includes('showAcquisitionPrice && <td className="mep-col-price">'))
  assert.ok(page.includes('<th>Kendaraan</th><th>Jenis / Kepemilikan</th>'))
  assert.ok(page.includes('<th>Pemilik / Driver</th>'))
  assert.ok(page.includes('<th>Lokasi / Unit Kerja</th>'))
  assert.ok(page.includes('<th>Pajak / Status</th><th>Catatan &amp; Hutang</th>'))
  assert.ok(!page.includes('<th>Jenis Sewa</th>'))
  assert.ok(!page.includes('<th>Driver</th>'))
  assert.ok(page.includes('const vehicleMeta ='))
  assert.ok(page.includes('const note = clean(v.keterangan)'))
  assert.ok(css.includes('min-width: 960px'))
  assert.ok(css.includes('.mep-tax-status.is-hidup'))
  assert.ok(tools.includes('transport_vehicle_column_layout_version'))
  assert.ok(tools.includes("if (context === 'kendaraan')"))
  assert.ok(tools.includes("table.querySelectorAll('.dpt-row-mark-cell')"))
  assert.ok(tools.includes('preferences for other modules stay'))
})
