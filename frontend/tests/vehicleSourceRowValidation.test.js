import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findInvalidVehicleSourceRows } from '../src/utils/vehicleSourceRowValidation.js'

test('finds non-empty source rows that were removed from the normalized vehicle set', () => {
  const sourceRows = [
    { excelRow: 6, values: ['1', 'Daihatsu', 'BM 1001 AA'] },
    { excelRow: 7, values: ['2', '', ''] },
    { excelRow: 11, values: ['', '', '', '', '', '', '', '13.0'] },
  ]
  const validRows = [
    { excelRow: 6, nomor_polisi: 'BM 1001 AA', merk: 'Daihatsu' },
  ]
  assert.deepEqual(
    findInvalidVehicleSourceRows(sourceRows, validRows).map(row => row.excelRow),
    [7, 11],
  )
})

test('does not report blank or unrelated trailing rows that are not part of the source list', () => {
  const sourceRows = [{ excelRow: 6 }, { excelRow: 7 }]
  const validRows = [{ excelRow: 6, nomor_polisi: 'BM 1001 AA', merk: 'Daihatsu' }]
  assert.deepEqual(
    findInvalidVehicleSourceRows(sourceRows.slice(0, 1), validRows).map(row => row.excelRow),
    [],
  )
})

test('matches source records by physical Excel row instead of array order', () => {
  const sourceRows = [{ excelRow: 101 }, { excelRow: 6 }]
  const validRows = [{ excelRow: 6, nomor_polisi: 'BM 1001 AA', merk: 'Daihatsu' }]
  assert.deepEqual(
    findInvalidVehicleSourceRows(sourceRows, validRows).map(row => row.excelRow),
    [101],
  )
})
