import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  assertNoUnknownDocumentRows,
  classifyDocumentImportRows,
} from '../src/utils/documentImportVehicleScope.js'

test('imports only ASET rows and deliberately classifies known SEWA rows as excluded', () => {
  const assets = { nomor_polisi: 'BM 1001 AA', stnk: '2027-01-01' }
  const rental = { nomor_polisi: 'BM 1002 AA', pajak: '2027-02-01' }
  const scope = classifyDocumentImportRows(
    [assets, rental],
    [
      { nomor_polisi: 'BM 1001 AA', kepemilikan: 'ASET' },
      { nomor_polisi: 'BM 1002 AA', kepemilikan: 'SEWA' },
    ],
  )
  assert.deepEqual(scope.assetRows, [assets])
  assert.deepEqual(scope.rentalRows, [rental])
  assert.deepEqual(scope.rentalPlates, ['BM 1002 AA'])
  assert.deepEqual(scope.unknownPlates, [])
  assert.doesNotThrow(() => assertNoUnknownDocumentRows(scope))
})

test('blocks the complete document batch if even one non-rental source plate is absent from master', () => {
  const scope = classifyDocumentImportRows(
    [
      { nomor_polisi: 'BM 1001 AA', stnk: '2027-01-01' },
      { nomor_polisi: 'BM 9999 ZZ', pajak: '2027-02-01' },
    ],
    [{ nomor_polisi: 'BM 1001 AA', kepemilikan: 'ASET' }],
  )
  assert.equal(scope.assetRows.length, 1)
  assert.deepEqual(scope.unknownPlates, ['BM 9999 ZZ'])
  assert.throws(
    () => assertNoUnknownDocumentRows(scope),
    error => {
      assert.match(error.message, /Import Dokumen Kendaraan dibatalkan seluruhnya/)
      assert.match(error.message, /BM 9999 ZZ/)
      assert.match(error.message, /Tidak ada dokumen dari file ini yang disimpan/)
      return true
    },
  )
})

test('normalizes case and repeated whitespace when resolving vehicle plates', () => {
  const row = { nomor_polisi: ' bm   1001 aa ', stnk: '2027-01-01' }
  const scope = classifyDocumentImportRows(
    [row],
    [{ nomor_polisi: 'BM 1001 AA', kepemilikan: 'aset' }],
  )
  assert.deepEqual(scope.assetRows, [row])
  assert.deepEqual(scope.unknownPlates, [])
})

test('treats missing plate or unsupported master ownership as validation errors', () => {
  const scope = classifyDocumentImportRows(
    [
      { nomor_polisi: '', stnk: '2027-01-01' },
      { nomor_polisi: 'BM 1002 AA', stnk: '2027-01-01' },
    ],
    [{ nomor_polisi: 'BM 1002 AA', kepemilikan: '' }],
  )
  assert.deepEqual(scope.unknownPlates, ['BM 1002 AA', 'No. Polisi kosong'])
})
