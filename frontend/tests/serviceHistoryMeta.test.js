import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decodeExcelMeta, encodeExcelMeta } from '../src/utils/excelSourceMeta.js'

test('editing a historical service row preserves metadata fields not edited by the user', () => {
  const original = {
    source: 'DATA_SERVICE',
    source_no: 7,
    merk: 'Toyota',
    nomor_polisi: 'BM 1234 XX',
    extra_import_flag: 'keep-me',
    qty: 1,
    uraian: 'Servis awal',
    keterangan: 'Catatan lama',
  }
  const parsed = decodeExcelMeta(encodeExcelMeta(original, 'Catatan lama'))
  const nextMeta = { ...parsed.meta, qty: 2, uraian: 'Servis diperbarui', keterangan: 'Catatan baru' }
  const saved = decodeExcelMeta(encodeExcelMeta(nextMeta, 'Catatan baru'))

  assert.equal(saved.meta.source, 'DATA_SERVICE')
  assert.equal(saved.meta.source_no, 7)
  assert.equal(saved.meta.extra_import_flag, 'keep-me')
  assert.equal(saved.meta.qty, 2)
  assert.equal(saved.meta.uraian, 'Servis diperbarui')
  assert.equal(saved.meta.keterangan, 'Catatan baru')
  assert.equal(saved.note, 'Catatan baru')
})
