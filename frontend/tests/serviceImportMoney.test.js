import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  financialBreakdownMatches,
  normalizeServiceMoney,
} from '../src/utils/serviceImportMoney.js'

test('uses the explicit source Total to disambiguate shorthand PPN values', () => {
  const money = normalizeServiceMoney({
    qty: '2',
    harga: '619',
    dpp: '1.238.000',
    ppn: '136.18',
    total: '1.374.180',
  })

  assert.equal(money.harga_satuan, 619000)
  assert.equal(money.nilai_dpp, 1238000)
  assert.equal(money.ppn, 136180)
  assert.equal(money.total, 1374180)
  assert.equal(financialBreakdownMatches(money), true)
})

test('preserves Data Service source No. 327 mismatch rather than replacing Total', () => {
  const money = normalizeServiceMoney({
    qty: '1',
    harga: '10000',
    dpp: '10000',
    ppn: '10000',
    total: '1665000',
  })

  assert.equal(money.nilai_dpp, 10000)
  assert.equal(money.ppn, 10000)
  assert.equal(money.total, 1665000)
  assert.equal(financialBreakdownMatches(money), false)
})

test('preserves Data Service source No. 328 mismatch rather than replacing Total', () => {
  const money = normalizeServiceMoney({
    qty: '1',
    harga: '275000',
    dpp: '275000',
    ppn: '275000',
    total: '1665000',
  })

  assert.equal(money.nilai_dpp, 275000)
  assert.equal(money.ppn, 275000)
  assert.equal(money.total, 1665000)
  assert.equal(financialBreakdownMatches(money), false)
})

test('does not silently swap a shorthand source Total for the DPP plus PPN sum', () => {
  const money = normalizeServiceMoney({
    qty: '1',
    harga: '500',
    dpp: '500',
    ppn: '50',
    total: '900',
  })

  assert.equal(money.nilai_dpp, 500000)
  assert.equal(money.ppn, 50000)
  assert.equal(money.total, 900000)
  assert.equal(financialBreakdownMatches(money), false)
})

test('records a blank Total as blank source while retaining the derived transaction value', () => {
  const money = normalizeServiceMoney({
    qty: '1',
    harga: '1000',
    dpp: '1000',
    ppn: '-',
    total: '-',
  })

  assert.equal(money.total, 1000)
  assert.equal(money.total_source_blank, true)
})
