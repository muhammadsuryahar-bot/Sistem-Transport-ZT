import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('Kendaraan table restores the separate register columns and preserves row actions', async () => {
  const [page, css, tools] = await Promise.all([
    readFile(new URL('../src/modules/MasterKendaraanExcelAlignedPage.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/MasterKendaraanExcelAlignedPage.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/DataPageTools.jsx', import.meta.url), 'utf8'),
  ])

  const expectedHeaders = '<th>No. Pol / Merk / Type</th><th>Jenis</th><th>Kepemilikan</th><th>Jenis Sewa</th><th>Harga Perolehan</th><th>Pemilik</th><th>Driver</th><th>Lokasi Kerja</th><th>Pajak</th><th>Keterangan</th><th>Aksi</th>'
  assert.ok(page.includes(expectedHeaders), 'the original separate table headers must remain')
  assert.ok(page.includes('<td><span>{v.pemilik || \'-\'}</span></td>'), 'owner stays in its own column')
  assert.ok(page.includes('<td><span>{driver?.nama_lengkap || \'-\'}</span></td>'), 'driver stays in its own column')
  assert.ok(page.includes('activeRowId === v.id') && page.includes('enterSelectionMode(v.id)'), 'row action and multi-select behavior remains')
  assert.ok(!page.includes('hasVehicleAcquisitionPrice') && !page.includes('showAcquisitionPrice'), 'the compact-only price hiding helper is removed')
  assert.ok(!css.includes('Compact, data-first Kendaraan register') && !css.includes('min-width: 960px'), 'compact-only table rules are removed')
  assert.ok(tools.includes("if (context === 'kendaraan')"), 'Kendaraan row markers remain excluded from business columns')
  assert.ok(!tools.includes('transport_vehicle_column_layout_version'), 'saved Kendaraan column preferences are not reset')
  assert.ok(tools.includes("if (context === 'kendaraan') return"), 'clean mode cannot disable the native vehicle table')
  assert.ok(tools.includes("context !== 'kendaraan' && <button className="), 'clean-mode toggle is absent from Kendaraan toolbar')
  assert.ok(tools.includes("(context === 'kendaraan' && column.kind === 'action')"), 'stale preferences cannot hide the Aksi column')
  assert.ok(tools.includes("if (context === 'kendaraan') return {}"), 'stale column preferences are ignored for the fixed vehicle register')
  assert.ok(tools.includes("cell.style.removeProperty('display')"), 'legacy inline hidden cells are reset for Kendaraan')
  assert.ok(tools.includes("applyCleanRoot(false)"), 'generic clean-table styling is removed from Kendaraan')
  assert.ok(tools.includes("{context !== 'kendaraan' && <div className=\"dpt-column-popover\""), 'column visibility controls cannot hide fixed Kendaraan fields')
  assert.ok(css.includes('width:max-content;min-width:1420px;max-width:none;table-layout:auto'), 'the 11-column register keeps a wide intrinsic table layout')
  assert.ok(css.includes('touch-action:pan-x pan-y'), 'horizontal scrolling remains touch-friendly')
  assert.ok(css.includes('.mep-actions .mep-actions-inner > button { visibility: visible !important; pointer-events: auto !important; }'), 'selected vehicle actions stay visible and clickable')
})
