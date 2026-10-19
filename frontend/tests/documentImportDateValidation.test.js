import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  describeDocumentSourceDateIssues,
  validateDocumentSourceDates,
} from '../src/utils/documentImportDateValidation.js'

function source(kind, sheetName, header, rows) {
  return {
    kind,
    sheet: {
      name: sheetName,
      rows: [{ excelRow: 5, values: header }, ...rows],
    },
    header: { index: 0, row: header },
  }
}

const docHeader = ['No', 'Merk', 'Type', 'No. Polisi', 'Tahun', 'STNK', 'PAJAK', '5 TAHUN']

test('flags suspicious historical Excel serial values instead of importing them', () => {
  const result = validateDocumentSourceDates([
    source('doc', 'STNK', docHeader, [
      { excelRow: 15, values: ['15', 'MITSUBISHI', 'COLT', 'BM 9084 TS', '2015', '46493', '', '11429'] },
      { excelRow: 16, values: ['16', 'MITSUBISHI', 'COLT', 'BM 9085 TS', '2015', '46493', '', '11429'] },
      { excelRow: 33, values: ['35', 'DAIHATSU', 'GRANMAX', 'BM 8003 LN', '2015', '46428', '', '10999'] },
    ]),
  ])
  assert.equal(result.length, 3)
  assert.deepEqual(result.map(issue => [issue.excelRow, issue.plate, issue.rawValue, issue.parsedValue]), [
    [15, 'BM 9084 TS', '11429', '1931-04-16'],
    [16, 'BM 9085 TS', '11429', '1931-04-16'],
    [33, 'BM 8003 LN', '10999', '1930-02-10'],
  ])
  assert.match(describeDocumentSourceDateIssues(result), /BM 9084 TS/)
  assert.match(describeDocumentSourceDateIssues(result), /1931-04-16/)
})

test('accepts plausible Excel serial dates for STNK, tax and five-year documents', () => {
  const result = validateDocumentSourceDates([
    source('doc', 'STNK', docHeader, [
      { excelRow: 6, values: ['1', 'MITSUBISHI', 'COLT', 'BM 1001 AA', '2015', '46493', '', '47350'] },
    ]),
    source('tax', 'Data Kendaraan', ['No', 'No. Polisi', 'Merk', 'Type', 'Tahun', 'Masa Berlaku Pajak'], [
      { excelRow: 7, values: ['1', 'BM 1001 AA', 'MITSUBISHI', 'COLT', '2015', '46493'] },
    ]),
  ])
  assert.deepEqual(result, [])
})

test('blocks nonempty invalid dates and expiry dates outside the plausible range', () => {
  const result = validateDocumentSourceDates([
    source('doc', 'STNK', docHeader, [
      { excelRow: 19, values: ['19', 'MITSUBISHI', 'COLT', 'BM 1234 AA', '2015', '', '', 'not-a-date'] },
      { excelRow: 20, values: ['20', 'MITSUBISHI', 'COLT', 'BM 1235 AA', '2015', '', '', '81000'] },
    ]),
  ])
  assert.equal(result.length, 2)
  assert.match(result[0].reason, /tidak valid/)
  assert.match(result[1].reason, /di luar rentang wajar|tidak valid/)
})

test('flags a populated document date on a source row without a vehicle plate', () => {
  const result = validateDocumentSourceDates([
    source('doc', 'STNK', docHeader, [
      { excelRow: 27, values: ['', 'MITSUBISHI', 'COLT', '', '2015', '', '', '47350'] },
    ]),
  ])
  assert.equal(result.length, 1)
  assert.equal(result[0].excelRow, 27)
  assert.equal(result[0].plate, '')
  assert.match(result[0].reason, /No. Polisi kosong/)
})

test('does not treat fully blank date cells as errors', () => {
  const result = validateDocumentSourceDates([
    source('doc', 'STNK', docHeader, [
      { excelRow: 7, values: ['2', 'MITSUBISHI', 'COLT', 'BM 1001 AA', '2015', '', '', ''] },
    ]),
  ])
  assert.deepEqual(result, [])
})
