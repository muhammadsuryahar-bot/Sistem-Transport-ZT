import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  historySourcePpnValue,
  historySourceTotalIsBlank,
  historySourceTotalValue,
  isBlankSourceAmount,
} from '../src/utils/serviceHistorySourceMoney.js'

test('distinguishes blank source cells from numeric zero', () => {
  assert.equal(isBlankSourceAmount(''), true)
  assert.equal(isBlankSourceAmount('   '), true)
  assert.equal(isBlankSourceAmount('-'), true)
  assert.equal(isBlankSourceAmount('0'), false)
  assert.equal(isBlankSourceAmount(0), false)
})

test('shows blank source PPN as a dash, but displays normalized values when supplied', () => {
  assert.equal(historySourcePpnValue({ ppn: 0, ppn_source: '-' }), '-')
  assert.equal(historySourcePpnValue({ ppn: 136180, ppn_source: '136.18' }), 136180)
  assert.equal(historySourcePpnValue({ ppn: 136180 }), 136180)
})

test('preserves blank source Total without changing computed transaction values', () => {
  assert.equal(historySourceTotalValue({ total: 1220000, total_source_blank: true }), '-')
  assert.equal(historySourceTotalValue({ total: 1220000, total_source_blank: false }), 1220000)
  assert.equal(historySourceTotalValue({}), '-')
})

test('recovers known blank Total cells in legacy imported rows without overriding explicit flags', () => {
  assert.equal(historySourceTotalIsBlank({ source: 'DATA_SERVICE', source_no: '361.0', total: 1220000 }), true)
  assert.equal(historySourceTotalIsBlank({ source: 'DATA_SERVICE', source_no: '384.0', total: 1140000 }), true)
  assert.equal(historySourceTotalIsBlank({ source: 'DATA_SERVICE', source_no: '360.0', total: 1000000 }), false)
  assert.equal(historySourceTotalIsBlank({ source: 'DATA_SERVICE', source_no: '361.0', total: 1220000, total_source_blank: false }), false)
  assert.equal(historySourceTotalIsBlank({ source: 'DATA_SERVICE', source_no: '360.0', total: 1000000, total_source_blank: true }), true)
})
