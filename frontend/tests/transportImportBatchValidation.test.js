import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertNoInvalidTransportRows } from '../src/utils/transportImportBatchValidation.js'

test('allows a fully validated batch', () => {
  assert.doesNotThrow(() => assertNoInvalidTransportRows('pengajuan', []))
  assert.doesNotThrow(() => assertNoInvalidTransportRows('sewa', undefined))
})

test('rejects the entire Pengajuan Service batch when any source row is invalid', () => {
  assert.throws(
    () => assertNoInvalidTransportRows('pengajuan', [
      { sourceRow: 4, plate: 'BM 1234 AA', reason: 'Tanggal/Keluhan kosong atau tidak valid' },
    ]),
    error => {
      assert.match(error.message, /Import Pengajuan Service dibatalkan seluruhnya/)
      assert.match(error.message, /baris data 4/)
      assert.match(error.message, /BM 1234 AA/)
      assert.match(error.message, /Tidak ada data dari file ini yang disimpan/)
      return true
    },
  )
})

test('rejects the entire Kendaraan Sewa batch when any plate is missing from the rental master', () => {
  assert.throws(
    () => assertNoInvalidTransportRows('sewa', [
      { sourceRow: 2, plate: 'BM 1111 XX', reason: 'Plat belum ada di Master Kendaraan Sewa' },
      { sourceRow: 8, plate: '', reason: 'Kolom kontrak/pemilik/periode/nilai sewa tidak lengkap' },
    ]),
    error => {
      assert.match(error.message, /Import Kendaraan Sewa dibatalkan seluruhnya: 2 baris/)
      assert.match(error.message, /BM 1111 XX/)
      assert.match(error.message, /No. Polisi kosong/)
      assert.match(error.message, /Tidak ada data dari file ini yang disimpan/)
      return true
    },
  )
})

test('reports only the first twelve invalid rows and counts the remainder', () => {
  const invalid = Array.from({ length: 15 }, (_, index) => ({
    sourceRow: index + 1,
    plate: `BM ${String(index + 1).padStart(4, '0')} AA`,
    reason: 'Tanggal kosong',
  }))
  assert.throws(
    () => assertNoInvalidTransportRows('pengajuan', invalid),
    error => {
      assert.match(error.message, /15 baris sumber bermasalah/)
      assert.match(error.message, /dan 3 baris bermasalah lainnya/)
      assert.doesNotMatch(error.message, /BM 0013 AA/)
      return true
    },
  )
})
