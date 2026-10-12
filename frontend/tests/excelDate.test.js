import assert from 'node:assert/strict'
import { test } from 'node:test'
import { excelDate } from '../src/utils/excelDate.js'

test('preserves day-first named month dates independently of timezone', () => {
  assert.equal(excelDate('25-Oct-2025'), '2025-10-25')
  assert.equal(excelDate('14-Aug-2023'), '2023-08-14')
  assert.equal(excelDate('11-Des-25'), '2025-12-11')
  assert.equal(excelDate('21-Agu-2025'), '2025-08-21')
})

test('parses ISO and numeric Indonesian calendar dates exactly', () => {
  assert.equal(excelDate('2025-10-25'), '2025-10-25')
  assert.equal(excelDate('2025-10-25T00:00:00.000Z'), '2025-10-25')
  assert.equal(excelDate('25/10/2025'), '2025-10-25')
  assert.equal(excelDate('1-2-2026'), '2026-02-01')
})

test('converts Excel date serials but does not guess short numeric values as dates', () => {
  assert.equal(excelDate('45941'), '2025-10-11')
  assert.equal(excelDate('47954'), '2031-04-16')
  assert.equal(excelDate('11429'), null)
})

test('rejects invalid dates and shifted text values', () => {
  assert.equal(excelDate('31/02/2025'), null)
  assert.equal(excelDate('Suppor Catu Daya'), null)
  assert.equal(excelDate(''), null)
})
