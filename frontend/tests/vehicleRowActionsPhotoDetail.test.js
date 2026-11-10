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

test('vehicle row actions appear beneath the selected row without widening the register', async () => {
  const [source, css, globalCss] = await Promise.all([
    readFile(pageUrl, 'utf8'),
    readFile(cssUrl, 'utf8'),
    readFile(new URL('../src/transport-ui-final.css', import.meta.url), 'utf8'),
  ])

  assert.ok(source.includes('return <Fragment key={v.id}><tr'), 'each vehicle and its optional contextual row are grouped')
  assert.ok(source.includes('className="mep-row-actions-row"'), 'the action strip is rendered as a row below the selected vehicle')
  assert.ok(source.includes('className="mep-row-actions-panel"'), 'the action strip fills the table width')
  assert.ok(source.includes('className="mep-row-action-buttons"'), 'actions are grouped in the contextual strip')
  assert.ok(source.includes('activeRowId === v.id'), 'only the clicked vehicle receives an action strip')
  assert.ok(!source.includes('mep-actions-header') && !source.includes('mep-col-actions') && !source.includes('className="mep-actions"'), 'the table never inserts an action column at the far right')
  assert.ok(source.includes('aria-label="Detail kendaraan"') && source.includes('aria-label="Edit kendaraan"'))
  assert.ok(source.includes('aria-label="Hapus kendaraan"'))
  assert.ok(source.includes('if (selectionMode) { exitSelection(); return }; enterSelectionMode(v.id)'))
  assert.ok(source.includes('if (selectionMode) return; if (e.detail > 1) return; rowClickTimer.current = window.setTimeout(() => setActiveRowId(current => current === v.id ? null : v.id), 180)'))
  assert.ok(source.includes('checked={picked} onChange={() => toggleSelected(v.id)} aria-label={`Pilih ${v.nomor_polisi}`}'))
  assert.ok(!source.includes('mep-has-active-row'), 'selecting a row does not change the register width')
  assert.ok(source.includes('Pilih satu baris untuk membuka aksi'))
  assert.ok(source.includes('Klik dua kali pada baris untuk keluar dari mode pilih'))
  assert.ok(!source.includes('mep-row-action-hint'))
  assert.ok(source.includes('retainVisibleVehicleSelection(current, filtered)'))
  assert.ok(source.includes('const applySummaryFilter = (ownership, type) =>'))
  assert.ok(source.includes('setIntegrityFilter(false)'))
  assert.ok(source.includes('placeholder="Cari nomor polisi, merk, pemilik, driver, atau lokasi..."'))
  assert.ok(source.includes('Tidak ada kendaraan yang cocok dengan pencarian atau filter'))
  assert.ok(source.includes('Reset Pencarian &amp; Filter'))
  assert.ok(source.includes("vehicleTableState === 'load-error'"))
  assert.ok(source.includes("vehicleTableState === 'empty'"))
  assert.ok(source.includes("vehicleTableState === 'no-results'"))
  assert.ok(source.includes('if (selectionMode && selected.length === 0)'))
  assert.ok(css.includes('.master-excel-page .mep-row-actions-panel {'))
  assert.ok(css.includes('.master-excel-page .mep-row-action-buttons > button {'))
  assert.ok(css.includes('.master-excel-page .mep-table tbody tr.mep-row-actions-row'))
  assert.ok(!css.includes('1908px') && !css.includes('.mep-col-actions'), 'the CSS has no selected-row width expansion')
  assert.ok(!css.includes('.mep-table th:last-child'), 'the last data column is never mistaken for the hidden Aksi column')
  assert.ok(globalCss.includes('.mep-actions { display: table-cell !important;'))
  assert.ok(globalCss.includes('.mep-actions-inner { display: flex !important;'))
  assert.ok(!globalCss.includes('.mep-actions { display: flex !important;'))
  assert.ok(css.includes('.mep-table tbody tr.dpt-row-selected'))
})
