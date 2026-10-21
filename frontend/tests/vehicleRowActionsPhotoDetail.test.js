import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const pageUrl = new URL('../src/modules/MasterKendaraanExcelAlignedPage.jsx', import.meta.url)
const cssUrl = new URL('../src/modules/MasterKendaraanExcelAlignedPage.css', import.meta.url)

test('vehicle details request signed URLs for all five stored photos', async () => {
  const source = await readFile(pageUrl, 'utf8')
  for (const key of ['depan', 'belakang', 'kiri', 'kanan', 'stnk']) {
    assert.match(source, new RegExp(`key: '${key}'`))
  }
  assert.match(source, /const urls = await loadVehiclePhotoUrls\(vehicle\)/)
  assert.match(source, /const editPhotoRequest = useRef\(0\)/)
  assert.match(source, /const requestId = \+\+editPhotoRequest\.current/)
  assert.match(source, /if \(requestId === editPhotoRequest\.current\) setPhotoUrls\(urls\)/)
  assert.match(source, /editing\?\.\[photo\.field\] \? photoLoading \? 'Memuat foto\.\.\.' : 'Foto tidak dapat dimuat'/)
  assert.match(source, /detailPhotoUrls\[photo\.key\]/)
  assert.match(source, /detail\[photo\.field\] \? 'Foto tidak dapat dimuat' : 'Belum ada foto'/)
})

test('vehicle table and detail use the same legacy rental-type fallback', async () => {
  const source = await readFile(pageUrl, 'utf8')
  assert.match(source, /rentalTypeLabel\(rentalTypeForVehicle\(v\)\)/)
  assert.match(source, /rentalTypeLabel\(rentalTypeForVehicle\(detail\)\)/)
})

test('vehicle row actions are visible without clicking the row and the actions column stays compact', async () => {
  const [source, css, globalCss] = await Promise.all([
    readFile(pageUrl, 'utf8'),
    readFile(cssUrl, 'utf8'),
    readFile(new URL('../src/transport-ui-final.css', import.meta.url), 'utf8'),
  ])
  assert.match(source, /<td className="mep-actions"><div className="mep-actions-inner"><button type="button" aria-label=\{\`Detail kendaraan/);
  assert.match(source, /aria-label=\{\`Edit kendaraan/);
  assert.match(source, /aria-label=\{\`Hapus kendaraan/);
  assert.doesNotMatch(source, /mep-row-action-hint|Klik baris/);
  assert.match(source, /Klik dua kali pada baris untuk memilih beberapa kendaraan/);
  assert.match(source, /onDoubleClick=.*enterSelectionMode\(v\.id\)/);
  assert.match(source, /className="danger"/);
  assert.match(source, /retainVisibleVehicleSelection\(current, filtered\)/);
  assert.match(source, /const applySummaryFilter = \(ownership, type\) =>/);
  assert.match(source, /setIntegrityFilter\(false\)/);
  assert.match(source, /placeholder="Cari kode\/plat, mesin\/rangka, merk\/type, pemilik\/driver, lokasi\/pajak\.\.\."/);
  assert.match(source, /Tidak ada kendaraan yang cocok dengan pencarian atau filter/);
  assert.match(source, /Reset Pencarian &amp; Filter/);
  assert.match(source, /vehicleTableState === 'load-error'/);
  assert.match(source, /vehicleTableState === 'empty'/);
  assert.match(source, /vehicleTableState === 'no-results'/);
  assert.match(source, /if \(selectionMode && selected\.length === 0\)/);
  assert.match(css, /\.mep-table th:last-child,\s*\.mep-table \.mep-actions\s*\{\s*width: 168px;\s*min-width: 168px;\s*max-width: 168px;/);
  assert.match(css, /\.mep-table \.mep-actions-inner > button\s*\{[^}]*margin: 0 !important/s);
  assert.match(css, /\.mep-actions button\.danger/);
  assert.match(globalCss, /\.mep-actions \{ display: table-cell !important;/);
  assert.match(globalCss, /\.mep-actions-inner \{ display: flex !important;/);
  assert.doesNotMatch(globalCss, /\.mep-actions \{ display: flex !important;/);
  assert.match(css, /\.mep-table tbody tr\.dpt-row-selected/);
})
