import assert from 'node:assert/strict'
import { test } from 'node:test'
import { classifyTableColumnKind, isCleanTableUtilityColumn, isHiddenByCleanTableMode, resolveCleanTableView } from '../src/utils/tableViewSettings.js'
import { readFile } from 'node:fs/promises'

test('Kendaraan keeps its original table layout by default', () => {
  assert.equal(resolveCleanTableView(null, 'kendaraan'), false)
  assert.equal(resolveCleanTableView('{}', 'kendaraan'), false)
})

test('other data modules retain the current clean-view default', () => {
  assert.equal(resolveCleanTableView(null, 'pengajuan'), true)
  assert.equal(resolveCleanTableView('{}', 'service'), true)
})

test('an explicit saved preference still takes precedence', () => {
  assert.equal(resolveCleanTableView('{"kendaraan":true}', 'kendaraan'), true)
  assert.equal(resolveCleanTableView('{"kendaraan":false}', 'kendaraan'), false)
  assert.equal(resolveCleanTableView('{"pengajuan":false}', 'pengajuan'), false)
})

test('invalid storage falls back safely by context', () => {
  assert.equal(resolveCleanTableView('{broken', 'kendaraan'), false)
  assert.equal(resolveCleanTableView('{broken', 'service'), true)
})

test('selection checkbox headers are utility controls, not data columns', () => {
  assert.equal(classifyTableColumnKind('', true), 'selection')
  assert.equal(classifyTableColumnKind('Pilih', true), 'selection')
  assert.equal(classifyTableColumnKind('No. Polisi'), 'data')
  assert.equal(classifyTableColumnKind('Penanda'), 'mark')
  assert.equal(classifyTableColumnKind('Aksi'), 'action')
})

test('selection controls are treated as utility columns, not business data', () => {
  for (const kind of ['mark', 'action', 'selection']) {
    assert.equal(isCleanTableUtilityColumn(kind), true)
  }
  assert.equal(isCleanTableUtilityColumn('data'), false)
})

test('DataPageTools structurally detects checkbox headers and clean-mode styling', async () => {
  const [source, css] = await Promise.all([
    readFile(new URL('../src/modules/DataPageTools.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/DataPageTools.css', import.meta.url), 'utf8'),
  ])
  assert.match(source, /cell\.matches\('\.mep-check, \.request-select-cell, \.x-select-cell, \.dpt-bulk-select-head'\)/)
  assert.match(source, /dpt-selection-utility/)
  assert.match(source, /isHiddenByCleanMode\(column, table, cleanMode\)/)
  assert.match(css, /\.dpt-clean-data-table:not\(\[data-dpt-bulk-selection-active="true"\]\) \.dpt-selection-utility/)
  assert.match(css, /data-dpt-bulk-selection-active="true"\]\s+\.dpt-selection-utility\s*\{\s*display: table-cell/)
})

test('clean mode hides marker/action controls but preserves checkboxes during bulk selection', () => {
  assert.equal(isHiddenByCleanTableMode('mark', false), true)
  assert.equal(isHiddenByCleanTableMode('mark', true), true)
  assert.equal(isHiddenByCleanTableMode('action', false), true)
  assert.equal(isHiddenByCleanTableMode('action', true), true)
  assert.equal(isHiddenByCleanTableMode('selection', false), true)
  assert.equal(isHiddenByCleanTableMode('selection', true), false)
  assert.equal(isHiddenByCleanTableMode('data', false), false)
})

test('generic bulk-mode entry and exit immediately reapply the current column indexes', async () => {
  const source = await readFile(new URL('../src/modules/DataPageTools.jsx', import.meta.url), 'utf8')
  assert.match(source, /const resolvedContext = context \|\| table\.dataset\.dptContext/)
  assert.match(source, /applyColumnVisibility\(resolvedContext, table, getColumnDescriptors\(resolvedContext, table\)/)
  assert.match(source, /delete table\.dataset\.dptBulkMode\s+const context = table\.dataset\.dptContext\s+if \(context\) applyColumnVisibility/)
  assert.match(source, /table\.dataset\.dptBulkSelectionActive = isBulkSelectionActive\(table\) \? 'true' : 'false'/)
})
