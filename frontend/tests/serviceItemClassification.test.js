import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { encodeExcelMeta } from '../src/utils/excelSourceMeta.js'
import {
  classifySourceServiceItemCategory,
  normalizeServiceItemName,
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

test('generic Service work classifies common vehicle parts before the stored JASA label', () => {
  const sourceItem = nama_item => ({
    nama_item,
    kategori: 'JASA',
    keterangan: encodeExcelMeta({ jenis_pekerjaan: 'Service' }),
  })
  for (const name of [
    'Bohlam Headlamp',
    'Seal Crankshaft',
    'Tie Rod Assy',
    'Radiator Upper Hose',
    'Filter Udara',
    'Busi Iridium',
    'O-Ring Injector',
    'Lampu Stop',
  ]) {
    assert.equal(classifySourceServiceItemCategory(sourceItem(name)), 'SPAREPART', name)
  }
  assert.equal(classifySourceServiceItemCategory(sourceItem('Bantuan Mekanik')), 'JASA')
})

test('shopping list item names, categories, and equivalent unit casing normalize consistently', () => {
  assert.equal(normalizeServiceItemName(' 1. Oli   Mesin Prima XP '), 'OLI MESIN PRIMA XP')
  assert.equal(
    serviceItemGroupKey('1. Oli   Mesin Prima XP', 'SPAREPART', 'Pcs'),
    serviceItemGroupKey('Oli Mesin Prima XP', 'sparepart', 'PCS'),
  )
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


test('Shopping List history grouping uses the source-aware classifier', async () => {
  const source = await readFile(new URL('../src/modules/PermintaanServicePageFixed.jsx', import.meta.url), 'utf8')
  assert.match(source, /const kategori = sourceWorkCategory\(item\)/)
  assert.match(source, /serviceItemGroupKey\(name, kategori, satuan\)/)
})
