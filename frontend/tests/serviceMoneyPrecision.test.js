import test from 'node:test'
import assert from 'node:assert/strict'
import { roundCurrency } from '../src/utils/serviceMoneyPrecision.js'

test('rounds IEEE-754 multiplication noise to two currency decimals', () => {
  assert.equal(roundCurrency(16170.000000000002), 16170)
  assert.equal(roundCurrency(32450.000000000004), 32450)
  assert.equal(roundCurrency(515039.99999999994), 515040)
  assert.equal(roundCurrency(260850.00000000003), 260850)
})

test('rounds source amounts to two decimal places without collapsing cents', () => {
  assert.equal(roundCurrency(16.17 * 1000), 16170)
  assert.equal(roundCurrency(515.04 * 1000), 515040)
  assert.equal(roundCurrency(123.456), 123.46)
  assert.equal(roundCurrency(-123.456), -123.46)
  assert.equal(roundCurrency(0), 0)
})

test('rejects non-finite currency values instead of hiding them as zero', () => {
  assert.throws(() => roundCurrency(Number.NaN), /angka hingga/)
  assert.throws(() => roundCurrency(Number.POSITIVE_INFINITY), /angka hingga/)
})
