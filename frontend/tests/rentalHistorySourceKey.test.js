import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rentalHistorySourceRowKey } from '../src/utils/rentalHistorySourceKey.js'

test('re-importing the same source sheet and Excel row identifies the same history row', () => {
  const original = { source_file: 'FPD OPS 01 September 2026.xlsx', source_sheet: 'SUMMERY RENTAL', excel_row: 12 }
  assert.equal(rentalHistorySourceRowKey(original), rentalHistorySourceRowKey({ ...original }))
})

test('the same sheet row from two different files is kept as two distinct source records', () => {
  const original = { source_file: 'FPD OPS 01 September 2026.xlsx', source_sheet: 'SUMMERY RENTAL', excel_row: 12 }
  const newer = { ...original, source_file: 'FPD OPS 01 Oktober 2026.xlsx' }
  assert.notEqual(rentalHistorySourceRowKey(original), rentalHistorySourceRowKey(newer))
})

test('the same Excel row from a different worksheet is kept distinct', () => {
  const original = { source_file: 'Data.xlsx', source_sheet: 'SUMMERY RENTAL', excel_row: 12 }
  const newer = { ...original, source_sheet: 'SUMMARY RENTAL' }
  assert.notEqual(rentalHistorySourceRowKey(original), rentalHistorySourceRowKey(newer))
})

test('source identity rejects missing or invalid provenance instead of silently using an incomplete key', () => {
  assert.throws(() => rentalHistorySourceRowKey({ source_file: 'Data.xlsx', source_sheet: 'SUMMERY RENTAL', excel_row: null }), /nomor baris Excel positif/)
  assert.throws(() => rentalHistorySourceRowKey({ source_file: '', source_sheet: 'SUMMERY RENTAL', excel_row: 12 }), /nama file/)
})
