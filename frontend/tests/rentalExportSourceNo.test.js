import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { normalizeSourceNoForExport } from '../src/utils/exportExcel.js'

test('numeric Summary Rental source numbers remain numeric', () => {
  assert.equal(normalizeSourceNoForExport('341'), 341)
  assert.equal(normalizeSourceNoForExport(12), 12)
})

test('nonnumeric source No annotations are preserved instead of replaced by excel_row', () => {
  assert.equal(normalizeSourceNoForExport('341+A346:F349'), '341+A346:F349')
  assert.equal(normalizeSourceNoForExport(' 341+A346:F349 '), '341+A346:F349')
  assert.equal(normalizeSourceNoForExport(''), '')
  assert.equal(normalizeSourceNoForExport(null), '')
})

test('Summary Rental export preserves source No and orders records by physical Excel row', async () => {
  const source = await readFile(new URL('../src/AppTransport.jsx', import.meta.url), 'utf8')
  assert.match(source, /no_excel: normalizeSourceNoForExport\(h\.source_no\)/)
  assert.match(source, /excel_row: h\.excel_row/)
  assert.match(source, /sort\(\(a,b\)=>Number\(a\.excel_row\|\|0\)-Number\(b\.excel_row\|\|0\)\)/)
  assert.doesNotMatch(source, /no_excel: Number\(h\.source_no\) \|\| h\.excel_row/)
})
