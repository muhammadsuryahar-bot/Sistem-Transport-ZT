import assert from 'node:assert/strict'
import { test } from 'node:test'
import { historyNumberInput, normalizeHistoryPpn } from '../src/utils/serviceHistoryMoney.js'

test('parses Indonesian grouping and decimal separators without changing magnitude', () => {
  assert.equal(historyNumberInput('619.000'), '619000')
  assert.equal(historyNumberInput('1.238.000,50'), '1238000.50')
  assert.equal(historyNumberInput('136,18'), '136.18')
  assert.equal(historyNumberInput('70000'), '70000')
  assert.equal(historyNumberInput('-'), '')
})

test('converts source PPN values from thousands to actual rupiah using DPP', () => {
  assert.equal(normalizeHistoryPpn(1238000, '136.18'), 136180)
  assert.equal(normalizeHistoryPpn(35000, '3.85'), 3850)
  assert.equal(normalizeHistoryPpn(1238000, '136180'), 136180)
  assert.equal(normalizeHistoryPpn(1238000, '136.180'), 136180)
  assert.equal(normalizeHistoryPpn(70000, '-'), 0)
})

test('does not accept malformed or negative PPN values as valid numbers', () => {
  assert.equal(Number.isNaN(normalizeHistoryPpn(100000, 'not-a-number')), true)
  assert.equal(Number.isNaN(normalizeHistoryPpn(100000, '-100')), true)
})
