import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveCleanTableView } from '../src/utils/tableViewSettings.js'

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
