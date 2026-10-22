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

test('vehicle row actions are contextual and click gestures toggle cleanly', async () => {
  const [source, css, globalCss] = await Promise.all([
    readFile(pageUrl, 'utf8'),
    readFile(cssUrl, 'utf8'),
    readFile(new URL('../src/transport-ui-final.css', import.meta.url), 'utf8'),
  ])

  assert.ok(source.includes('!selectionMode && activeRowId === v.id && <><button type="button" aria-label={`Detail kendaraan'))
  assert.ok(source.includes('aria-label={`Edit kendaraan'))
  assert.ok(source.includes('aria-label={`Hapus kendaraan'))
  assert.ok(source.includes('if (selectionMode) { exitSelection(); return }; enterSelectionMode(v.id)'))
  assert.ok(source.includes('if (selectionMode) return; if (e.detail > 1) return; rowClickTimer.current = window.setTimeout(() => setActiveRowId(current => current === v.id ? null : v.id), 180)'))
  assert.ok(source.includes('checked={picked} onChange={() => toggleSelected(v.id)} aria-label={`Pilih ${v.nomor_polisi}`}'))
  assert.ok(source.includes("className={`mep-table${!selectionMode && activeRowId !== null ? ' mep-has-active-row' : ''}`}"))
  assert.ok(source.includes('Klik satu kali untuk membuka atau menutup Aksi'))
  assert.ok(source.includes('Klik dua kali pada baris untuk keluar dari mode pilih banyak'))
  assert.ok(!source.includes('mep-row-action-hint'))
  assert.ok(!source.includes('Klik baris'))
  assert.ok(source.includes('retainVisibleVehicleSelection(current, filtered)'))
  assert.ok(source.includes('const applySummaryFilter = (ownership, type) =>'))
  assert.ok(source.includes('setIntegrityFilter(false)'))
  assert.ok(source.includes('placeholder="Cari kode/plat, mesin/rangka, merk/type, pemilik/driver, lokasi/pajak..."'))
  assert.ok(source.includes('Tidak ada kendaraan yang cocok dengan pencarian atau filter'))
  assert.ok(source.includes('Reset Pencarian &amp; Filter'))
  assert.ok(source.includes("vehicleTableState === 'load-error'"))
  assert.ok(source.includes("vehicleTableState === 'empty'"))
  assert.ok(source.includes("vehicleTableState === 'no-results'"))
  assert.ok(source.includes('if (selectionMode && selected.length === 0)'))
  assert.ok(css.includes('.mep-table th:last-child,\n.mep-table .mep-actions {\n  width: 64px;\n  min-width: 64px;\n  max-width: 64px;'))
  assert.ok(css.includes('.mep-table.mep-has-active-row th:last-child,\n.mep-table.mep-has-active-row .mep-actions {\n  width: 168px;\n  min-width: 168px;\n  max-width: 168px;'))
  assert.ok(css.includes('.mep-actions button.danger'))
  assert.ok(globalCss.includes('.mep-actions { display: table-cell !important;'))
  assert.ok(globalCss.includes('.mep-actions-inner { display: flex !important;'))
  assert.ok(!globalCss.includes('.mep-actions { display: flex !important;'))
  assert.ok(css.includes('.mep-table tbody tr.dpt-row-selected'))
})
