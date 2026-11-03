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
  const styleImports = main.split('\\n').filter(line => line.startsWith('import ./') && line.endsWith('.css\'') )
  assert.equal(styleImports.at(-1), "import './system-readability-final.css'", 'the final readability rules load after every other global stylesheet')
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


test('the final readability layer raises data, headings, details, controls and navigation across modules', async () => {
  const css = await read('../src/system-readability-final.css')
  const main = await read('../src/main.jsx')

  const styleImports = main.split('\\n').filter(line => line.startsWith('import ./') && line.endsWith('.css\'') )
  assert.equal(styleImports.at(-1), "import './system-readability-final.css'", 'the stylesheet is applied last to win over legacy module rules')
  assert.ok(css.includes('font-size: 14.5px !important;'), 'operational table data is larger and comfortable to read')
  assert.ok(css.includes('font-size: 13px !important;') && css.includes('font-size: 13.5px !important;'), 'table headings, labels and actions have a consistent readable scale')
  assert.ok(css.includes('font-size: 13px !important;\n  line-height: 1.45 !important;\n  color: #66786e !important;'), 'supporting row details remain readable')
  assert.ok(css.includes('.service-filter-summary span') && css.includes('.request-print-grid span'), 'Data Service summary and print labels are covered')
  assert.ok(css.includes('.scp-detail-grid span') && css.includes('.scp-note-field textarea'), 'Service approval details and notes are covered')
  assert.ok(css.includes('.document-status-expired') && css.includes('.document-status-aman'), 'document expiry states remain readable')
  assert.ok(css.includes('.request-detail-grid span') && css.includes('.request-vehicle-preview span'), 'Data Service detail labels are not rendered as tiny captions')
  assert.ok(css.includes('.login-page .login-form label') && css.includes('.login-page .login-form input[type="email"]'), 'login labels and inputs retain readable text sizes')
  assert.ok(css.includes('.report-period-summary span') && css.includes('.users-audit-meta-grid span'), 'report summaries and user audit metadata are covered')
  assert.ok(css.includes('.dashboard-v2 .dashboard-bar-meta small') && css.includes('.dashboard-v2 .dashboard-gauge span'), 'Dashboard chart annotations remain readable')
  assert.ok(css.includes('.dashboard-layout .sidebar .nav-item'), 'navigation labels are part of the readability standard')
  assert.ok(css.includes('@media (max-width: 760px)'), 'the same standards are checked for mobile layouts')
})


test('each operational page uses the real components covered by the readability layer', async () => {
  const paths = [
    '../src/modules/DashboardFeaturePage.jsx',
    '../src/modules/PermintaanServicePageFixed.jsx',
    '../src/modules/ServiceFeaturePage.jsx',
    '../src/modules/RentalFeaturePage.jsx',
    '../src/modules/DocumentsFeaturePage.jsx',
    '../src/modules/ReportsFeaturePage.jsx',
    '../src/modules/UsersFeaturePage.jsx',
    '../src/modules/ServiceCompletionPanel.jsx',
    '../src/modules/AuditTrailPanel.jsx',
    '../src/modules/DataQualityPanel.jsx',
  ]
  const pages = await Promise.all(paths.map(read))
  const css = await read('../src/system-readability-final.css')
  const tableScroll = await read('../src/table-scroll-ui-fix.css')

  assert.ok(pages[0].includes('dashboard-v2') && pages[0].includes('dashboard-stat-card'), 'Dashboard summary and chart UI is included')
  assert.ok(pages[1].includes('request-table') && pages[1].includes('request-field'), 'Data Service tables and forms are included')
  assert.ok(pages[2].includes('className="x-table"') && pages[2].includes('className="x-grid"'), 'Service tables and forms are included')
  assert.ok(pages[3].includes('className="x-table') && pages[3].includes('className="x-grid"'), 'Rental tables and forms are included')
  assert.ok(pages[4].includes('document-monitor-table') && pages[4].includes('document-status-'), 'Documents monitoring, status and expiry labels are included')
  assert.ok(pages[5].includes('className="x-table"') && pages[5].includes('report-period-grid'), 'Reports tables and period controls are included')
  assert.ok(pages[6].includes('users-table') && pages[6].includes('users-summary-item'), 'Users account table and summaries are included')
  assert.ok(pages[7].includes('scp-detail-grid') && pages[7].includes('scp-note-field'), 'Service completion and approval panel is included')
  assert.ok(pages[8].includes('users-audit-table') && pages[8].includes('users-audit-meta-grid'), 'Audit Trail table and metadata are included')
  assert.ok(pages[9].includes('data-quality-details') && pages[9].includes('Pemeriksaan integritas data'), 'Data Quality explanations are included')
  assert.ok(css.includes('.x-table tbody td') && css.includes('.request-table tbody td'), 'shared styles cover both table families')
  assert.ok(tableScroll.includes('.x-table-wrap') && tableScroll.includes('.request-table-wrap'), 'wide tables remain independently scrollable')
})

test('Kendaraan uses the requested larger type scale even after legacy global overrides', async () => {
  const css = await read('../src/system-readability-final.css')
  assert.ok(css.includes('.dashboard-layout .main-content .content-container .master-excel-page .mep-table tbody td {\n  font-size: 14.5px !important;'), 'vehicle table data is 14.5px')
  assert.ok(css.includes('.dashboard-layout .main-content .content-container .master-excel-page .mep-table tbody td:first-child > b {\n  font-size: 16px !important;'), 'vehicle plate numbers are 16px')
  assert.ok(css.includes('.dashboard-layout .main-content .content-container .master-excel-page .mep-table tbody td small {\n  font-size: 13px !important;'), 'vehicle support text is 13px')
  assert.ok(css.includes('.dashboard-layout .main-content .content-container .master-excel-page .mep-table thead th {\n  font-size: 13px !important;'), 'vehicle table headings are 13px')
})
