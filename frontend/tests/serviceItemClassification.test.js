import assert from 'node:assert/strict'
import test from 'node:test'
import { encodeExcelMeta } from '../src/utils/excelSourceMeta.js'
import {
  classifySourceServiceItemCategory,
  serviceItemGroupKey,
} from '../src/utils/serviceItemClassification.js'

test('shopping list uses source work type to separate service labour and parts', () => {
  assert.equal(classifySourceServiceItemCategory({
    nama_item: '1. Oli Mesin Prima XP',
    kategori: 'JASA',
    keterangan: encodeExcelMeta({ jenis_pekerjaan: 'Service' }),
  }), 'SPAREPART')

  assert.equal(classifySourceServiceItemCategory({
    nama_item: '1. Scan Engine',
    kategori: 'JASA',
    keterangan: encodeExcelMeta({ jenis_pekerjaan: 'Service' }),
  }), 'JASA')

  assert.equal(classifySourceServiceItemCategory({
    nama_item: '1. Ganti Oli Mesin + Filter Oli',
    kategori: 'JASA',
    keterangan: encodeExcelMeta({ jenis_pekerjaan: 'Jasa Service' }),
  }), 'JASA')

  assert.equal(classifySourceServiceItemCategory({
    nama_item: '1. Ban GT 185/70 R14',
    kategori: 'JASA',
    keterangan: encodeExcelMeta({ jenis_pekerjaan: 'Pengadaan Barang' }),
  }), 'SPAREPART')
})

test('shopping list grouping normalizes numbered names but keeps category and unit distinct', () => {
  assert.equal(
    serviceItemGroupKey('1. Oli Mesin Prima XP', 'SPAREPART', 'Ltr'),
    serviceItemGroupKey('Oli Mesin Prima XP', 'SPAREPART', 'Ltr'),
  )
  assert.notEqual(
    serviceItemGroupKey('Oli Mesin Prima XP', 'SPAREPART', 'Ltr'),
    serviceItemGroupKey('Oli Mesin Prima XP', 'SPAREPART', 'Pcs'),
  )
  assert.notEqual(
    serviceItemGroupKey('Oli Mesin Prima XP', 'SPAREPART', 'Ltr'),
    serviceItemGroupKey('Oli Mesin Prima XP', 'JASA', 'Ltr'),
  )
})
