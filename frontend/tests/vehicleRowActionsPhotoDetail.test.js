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

test('vehicle row actions are contextual and selection instructions match behavior', async () => {
  const [source, css] = await Promise.all([
    readFile(pageUrl, 'utf8'),
    readFile(cssUrl, 'utf8'),
  ])
  assert.match(source, /activeRowId === v\.id \?/)
  assert.match(source, /Klik satu kali pada baris untuk menampilkan aksi/)
  assert.match(source, /onDoubleClick=.*enterSelectionMode\(v\.id\)/)
  assert.match(source, /className="danger"/)
  assert.match(css, /\.mep-actions button\.danger/)
  assert.doesNotMatch(css, /\.mep-actions button:last-child/)
  assert.match(css, /\.mep-table tbody tr\.dpt-row-selected/)
  assert.match(css, /\.mep-table tbody tr\.dpt-row-selected\{background:#eaf4ee;outline:2px solid #86b99c/)
})
