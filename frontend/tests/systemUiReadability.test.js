import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = path => readFile(new URL(path, import.meta.url), 'utf8')

test('all primary transport modules are routed through the shared application shell', async () => {
  const [main, app] = await Promise.all([
    read('../src/main.jsx'),
    read('../src/AppTransport.jsx'),
  ])

  assert.ok(main.includes("import './transport-ui-final.css'"), 'the shared UI contract is loaded by the application entry point')
  for (const route of [
    'dashboard: <DashboardFeaturePage',
    'kendaraan: <KendaraanPage',
    'pengajuan: <PermintaanServicePage',
    'service: <ServicePage',
    'sewa: <RentalPage',
    'dokumen: <DocumentsPage',
    'laporan: <ReportsPage',
    'pengguna: <UsersPage',
  ]) {
    assert.ok(app.includes(route), `the shared shell keeps the ${route.split(':')[0]} page registered`)
  }
})

test('operational data tables use readable shared type sizes', async () => {
  const css = await read('../src/transport-ui-final.css')
  const standardAt = css.lastIndexOf('SYSTEM-WIDE READABILITY STANDARD')
  assert.ok(standardAt > 0, 'the final readability layer exists after legacy duplicate rules')
  const standard = css.slice(standardAt)

  assert.ok(standard.includes('--zt-readable-table: 13.5px;'), 'desktop table body text is at least comfortably readable')
  assert.ok(standard.includes('--zt-readable-heading: 12px;'), 'table headings are not tiny uppercase captions')
  assert.ok(standard.includes('--zt-readable-meta: 12px;'), 'supporting row details remain readable')
  assert.ok(standard.includes('font-size: var(--zt-readable-table) !important;'), 'shared tables apply the common body type scale')
  assert.ok(standard.includes('font-size: var(--zt-readable-heading) !important;'), 'shared tables apply the common heading type scale')
  assert.ok(standard.includes('font-size: 13px !important;\n    padding: 11px 12px !important;'), 'mobile table text stays readable')
  assert.ok(standard.includes('font-size: 11.5px !important;\n  }\n  .dpt-clean-data-table'), 'mobile supporting text does not fall back to tiny captions')
})

test('forms, buttons, dashboard guidance, and navigation follow the shared readability standard', async () => {
  const css = await read('../src/transport-ui-final.css')
  const standard = css.slice(css.lastIndexOf('SYSTEM-WIDE READABILITY STANDARD'))

  assert.ok(standard.includes('--zt-readable-label: 12.5px;'), 'form labels have a consistent readable size')
  assert.ok(standard.includes('font-size: 13px !important;\n  line-height: 1.4 !important;'), 'form controls use readable input text')
  assert.ok(standard.includes('font-size: var(--zt-readable-label) !important;') && standard.includes('font-size: 12.5px !important;'), 'form labels stay readable on desktop and small screens')
  assert.ok(standard.includes('.dashboard-v2 .dashboard-stat-card span'), 'dashboard helper text follows the shared standard')
  assert.ok(standard.includes('.topbar-label'), 'the page header label is not reduced to microtext')
  assert.ok(standard.includes('.page-breadcrumb'), 'breadcrumb text has a readable size')
  assert.ok(standard.includes('min-height: 36px !important;'), 'table actions have a usable touch target')
})

test('wide operational tables remain locally scrollable on desktop and mobile', async () => {
  const css = await read('../src/table-scroll-ui-fix.css')
  assert.ok(css.includes('overflow-x: auto !important;'), 'wide tables scroll horizontally inside their own viewport')
  assert.ok(css.includes('.x-table-wrap'), 'service and operational tables retain the shared scroll wrapper')
  assert.ok(css.includes('.request-table-wrap'), 'request history tables retain the shared scroll wrapper')
})
