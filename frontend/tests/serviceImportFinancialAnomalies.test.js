import assert from 'node:assert/strict'
import test from 'node:test'
import { findServicePpnAnomalies } from '../src/utils/serviceImportFinancialAnomalies.js'

test('does not flag common 11% and 12% PPN rates', () => {
  const rows = [
    { excelRow: 6, source_no: '1', nilai_dpp: 100000, ppn: 11000 },
    { excelRow: 7, source_no: '2', nilai_dpp: 100000, ppn: 12000 },
  ]
  assert.deepEqual(findServicePpnAnomalies(rows), [])
})

test('flags high PPN rates without altering source financial values', () => {
  const row = { excelRow: 327, source_no: '327.0', nilai_dpp: 10000, ppn: 10000 }
  const anomalies = findServicePpnAnomalies([row])
  assert.equal(anomalies.length, 1)
  assert.equal(anomalies[0].excelRow, 327)
  assert.equal(anomalies[0].source_no, '327.0')
  assert.equal(anomalies[0].ratePercent, 100)
  assert.equal(row.nilai_dpp, 10000)
  assert.equal(row.ppn, 10000)
})

test('flags a positive PPN when DPP is zero or negative instead of dividing by zero', () => {
  const anomalies = findServicePpnAnomalies([
    { excelRow: 8, source_no: '4', nilai_dpp: 0, ppn: 10 },
    { excelRow: 9, source_no: '5', nilai_dpp: -1, ppn: 10 },
  ])
  assert.equal(anomalies.length, 2)
  assert.ok(anomalies.every(row => row.reason === 'PPN_WITHOUT_POSITIVE_DPP'))
  assert.ok(anomalies.every(row => row.ratePercent === null))
})

test('ignores empty, zero, or negative PPN values which are handled by existing financial validation', () => {
  assert.deepEqual(findServicePpnAnomalies([
    { excelRow: 10, nilai_dpp: 1000, ppn: 0 },
    { excelRow: 11, nilai_dpp: 1000, ppn: -1 },
    { excelRow: 12, nilai_dpp: 0, ppn: 0 },
  ]), [])
})

test('rejects an invalid review threshold', () => {
  assert.throws(() => findServicePpnAnomalies([], -0.1), /threshold/)
})
