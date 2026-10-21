import assert from 'node:assert/strict'
import { test } from 'node:test'
import { classifyTableColumnKind, isCleanTableUtilityColumn, resolveCleanTableView } from '../src/utils/tableViewSettings.js'
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

test('clean view hides every utility column, including selection controls', () => {
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
  assert.match(source, /cleanMode && isCleanTableUtilityColumn\(column\.kind\)/)
  assert.match(css, /\.dpt-clean-data-table \.dpt-selection-utility/)
})
