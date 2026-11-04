import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = path => readFile(new URL(path, import.meta.url), 'utf8')

test('navigation exposes only the pages assigned to each system role', async () => {
  const app = await read('../src/AppTransport.jsx')
  const expected = {
    ADMIN: "ADMIN: ['dashboard', 'kendaraan', 'pengajuan', 'service', 'sewa', 'dokumen', 'laporan', 'pengguna']",
    TRANSPORT: "TRANSPORT: ['dashboard', 'kendaraan', 'pengajuan', 'service', 'sewa', 'dokumen', 'laporan']",
    OPERASIONAL: "OPERASIONAL: ['dashboard', 'pengajuan']",
    ATASAN_TRANSPORT: "ATASAN_TRANSPORT: ['dashboard', 'pengajuan', 'service', 'laporan']",
    DIREKTUR: "DIREKTUR: ['dashboard', 'service', 'laporan']",
    AKUNTANSI: "AKUNTANSI: ['dashboard', 'sewa', 'laporan']",
  }
  for (const [role, rule] of Object.entries(expected)) {
    assert.ok(app.includes(rule), `${role} retains its defined navigation access`)
  }
  assert.ok(app.includes('NAV_ITEMS.filter((item) => allowedPages.includes(item.id))'), 'the sidebar is filtered using role access')
  assert.ok(app.includes('if (!page || !allowedPages.includes(page)) return'), 'navigation rejects a page outside the current role')
  assert.ok(app.includes('if (session && profile && !allowedPages.includes(activePage)) setActivePage(\'dashboard\')'), 'an unauthorized restored page returns to Dashboard')
})

test('each module retains its separate read, create, edit, delete, and approval guards', async () => {
  const [vehicles, requests, service, rental, documents, reports, users, completion] = await Promise.all([
    read('../src/modules/MasterKendaraanExcelAlignedPage.jsx'),
    read('../src/modules/PermintaanServicePageFixed.jsx'),
    read('../src/modules/ServiceFeaturePage.jsx'),
    read('../src/modules/RentalFeaturePage.jsx'),
    read('../src/modules/DocumentsFeaturePage.jsx'),
    read('../src/modules/ReportsFeaturePage.jsx'),
    read('../src/modules/UsersFeaturePage.jsx'),
    read('../src/modules/ServiceCompletionPanel.jsx'),
  ])

  assert.ok(vehicles.includes("const canEdit = ['ADMIN', 'TRANSPORT'].includes(profile?.role)"), 'vehicle edit stays limited to Admin and Transport')
  assert.ok(vehicles.includes("const canPhoto = profile?.role === 'ADMIN'") && vehicles.includes("const canDelete = profile?.role === 'ADMIN'"), 'vehicle photo upload and deletion remain Admin-only')
  assert.ok(requests.includes("const canCreate = ['ADMIN', 'OPERASIONAL'].includes(profile?.role)"), 'Data Service request creation stays limited to Admin and Operational')
  assert.ok(requests.includes("const canDelete = profile?.role === 'ADMIN'"), 'request deletion stays Admin-only')
  assert.ok(requests.includes("const canManageService = ['ADMIN', 'TRANSPORT'].includes(profile?.role)"), 'service management from Data Service stays limited to Admin and Transport')
  assert.ok(service.includes("const canProcess = ['ADMIN', 'TRANSPORT'].includes(profile?.role)"), 'Service processing stays limited to Admin and Transport')
  assert.ok(service.includes("const canApprove = ['ADMIN', 'ATASAN_TRANSPORT', 'DIREKTUR'].includes(profile?.role)"), 'Service approvals retain the required management roles')
  assert.ok(rental.includes("const editable = ['ADMIN', 'TRANSPORT', 'AKUNTANSI'].includes(profile?.role)"), 'rental finance editing keeps its assigned roles')
  assert.ok(rental.includes("const historyEditable = ['ADMIN', 'TRANSPORT'].includes(profile?.role)"), 'rental history editing stays with Admin and Transport')
  assert.ok(documents.includes("const canManage=['ADMIN','TRANSPORT'].includes(profile?.role)"), 'document management stays with Admin and Transport')
  assert.ok(reports.includes("const canReadRental = ['ADMIN', 'TRANSPORT', 'AKUNTANSI'].includes(profile?.role)"), 'rental report details remain role-gated')
  assert.ok(users.includes("const canEdit = profile?.role === 'ADMIN'"), 'user administration remains Admin-only')
  assert.ok(users.includes("view === 'audit' && canEdit ? <AuditTrailPanel") && users.includes("view === 'quality' && canEdit ? <DataQualityPanel"), 'Audit Trail and Data Quality remain Admin-only')
  assert.ok(completion.includes("const canApprove = ['ADMIN', 'ATASAN_TRANSPORT', 'DIREKTUR'].includes(profile?.role)"), 'the standalone approval panel preserves approval roles')
})

test('all operational data tables stay inside their dedicated horizontal scroll containers', async () => {
  const [vehicles, requests, service, rental, documents, reports, users, audit] = await Promise.all([
    read('../src/modules/MasterKendaraanExcelAlignedPage.jsx'),
    read('../src/modules/PermintaanServicePageFixed.jsx'),
    read('../src/modules/ServiceFeaturePage.jsx'),
    read('../src/modules/RentalFeaturePage.jsx'),
    read('../src/modules/DocumentsFeaturePage.jsx'),
    read('../src/modules/ReportsFeaturePage.jsx'),
    read('../src/modules/UsersFeaturePage.jsx'),
    read('../src/modules/AuditTrailPanel.jsx'),
  ])
  assert.ok(vehicles.includes('className="mep-table-wrap"'), 'Kendaraan has its own scrollable table viewport')
  assert.ok(requests.includes('className="request-table-wrap"') && requests.includes('service-summary-table-wrap'), 'Data Service has scroll wrappers for request and summary tables')
  for (const [name, page] of [['Service', service], ['Rental', rental], ['Documents', documents], ['Reports', reports], ['Users', users], ['Audit Trail', audit]]) {
    assert.ok(page.includes('x-table-wrap'), `${name} tables use the shared local scroll wrapper`)
  }
})

test('responsive layout rules exist for every major page family and modal', async () => {
  const [dashboard, requestCss, operationsCss, vehicleCss, approvalCss, loginCss, appCss] = await Promise.all([
    read('../src/modules/DashboardFeaturePage.css'),
    read('../src/modules/PermintaanServicePage.css'),
    read('../src/modules/TransportOperationsFixed.css'),
    read('../src/modules/MasterKendaraanExcelAlignedPage.css'),
    read('../src/modules/ServiceCompletionPanel.css'),
    read('../src/modules/LoginPage.css'),
    read('../src/App.css'),
  ])
  assert.ok(dashboard.includes('@media (max-width: 760px)'), 'Dashboard stacks its visual area on mobile')
  assert.ok(requestCss.includes('max-width:560px') && requestCss.includes('.request-form-grid,.request-detail-grid') && requestCss.includes('grid-template-columns:1fr'), 'Data Service forms and details become single-column on mobile')
  assert.ok(operationsCss.includes('max-width:600px') && operationsCss.includes('.x-toolbar-inline{align-items:stretch;flex-direction:column}'), 'operational filters stack on mobile')
  assert.ok(vehicleCss.includes('@media (max-width: 760px)') && vehicleCss.includes('@media (max-width: 480px)'), 'Kendaraan controls rearrange for tablet and phone widths')
  assert.ok(approvalCss.includes('@media(max-width:760px)') && approvalCss.includes('.scp-modal-actions{flex-direction:column}'), 'approval modal actions stack on mobile')
  assert.ok(loginCss.includes('@media (max-width:560px)'), 'login card has a mobile layout')
  assert.ok(appCss.includes('@media (max-width: 760px)') && appCss.includes('@media (max-width: 560px)'), 'application shell and navigation have tablet/mobile layouts')
})

test('all page-specific readability overrides are applied in the last stylesheet', async () => {
  const main = await read('../src/main.jsx')
  const css = await read('../src/system-readability-final.css')
  const styleImports = main.split(String.fromCharCode(10)).filter(line => line.startsWith("import './") && line.endsWith(".css'"))
  assert.equal(styleImports.at(-1), "import './system-readability-final.css'", 'shared readability layer loads after module/global CSS')

  assert.ok(css.includes('.master-excel-page .mep-detail > div > b') && css.includes('font-size: 14.5px !important;'), 'vehicle modal values use readable text')
  assert.ok(css.includes('.master-excel-page .mep-summary-card .mep-stat-note') && css.includes('font-size: 12px !important;'), 'vehicle summary helper text is not microtext')
  assert.ok(css.includes('.dashboard-v2 .dashboard-health-copy > strong'), 'Dashboard health explanation is covered')
  assert.ok(css.includes('.data-quality-main strong') && css.includes('.data-quality-details'), 'Data Quality findings and evidence are readable')
  assert.ok(css.includes('.users-audit-meta-grid strong') && css.includes('.users-audit-pill'), 'Audit Trail detail values and action labels are readable')
  assert.ok(css.includes('.request-status') && css.includes('.request-priority'), 'Data Service statuses and priorities are readable')
  assert.ok(css.includes('.service-excel-scroll-label') && css.includes('.scp-detail-grid strong'), 'Service Excel guidance and approval details are readable')
})
