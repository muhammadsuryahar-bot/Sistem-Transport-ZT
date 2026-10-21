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

test('generic Service rows from the May workbook classify identifiable physical components as parts', () => {
  const sourceItem = nama_item => ({
    nama_item,
    kategori: 'JASA',
    keterangan: encodeExcelMeta({ jenis_pekerjaan: 'Service' }),
  })

  for (const name of [
    'Lem Wealty RTV',
    'Karet Kaki Mesin F601',
    'Karet Kaki Transmisi F601',
    'Link Stabil F601',
    'Gearbox Stir Assy',
    'Shockbreaker Belakang',
    'Blok Rem Belakang F601',
    'Minyak Rem Kecil Auto Genuine',
    'Paking Tutup Klep F601',
    'Kunci Bagasi F601',
    'Carburator Cleaner 500 ML',
    'Sensor Water Temp',
    'Valve S/A Vent',
    'Dinamo Semprot Kaca F601',
    'Sensor Oxygen F601',
    'Klakson 12 V',
    'Dinamo Motor P. Windows F601',
    'Piston Sub Assy, W/Pin F601',
    'Baut Kartel All',
    'Ring Set, Piston, Std F601',
    'Metal Bulan F601',
    'Lifter Valve No. 60',
    'Thermostat F601 Asli',
    'Belt, V-Ribbed',
    'Clip-Clip',
    'Shoe Kit, Brake RR',
    'Support S/A FR F700',
    'Motor Fan BSR Denso',
    'Liner, FR Fender, LH AVZ/XENIA',
    'Handle Pintu Dalam RH',
    'Cable Doorlock Pintu 1 RH',
    'Kaca Spion',
    'Velg R13',
    'Reserve Tank A/S RAD',
    'Skring Petak',
    'Pen Payung TBR',
    'BBM (Bahan Bakar Minyak)',
    'Tinner Cuci',
  ]) {
    assert.equal(classifySourceServiceItemCategory(sourceItem(name)), 'SPAREPART', name)
  }
})

test('generic Service work that names an operation instead of a physical component remains JASA', () => {
  const sourceItem = nama_item => ({
    nama_item,
    kategori: 'JASA',
    keterangan: encodeExcelMeta({ jenis_pekerjaan: 'Service' }),
  })
  for (const name of ['Scan Engine', 'Spooring', 'Engine Tune Up', 'Isi Freon O']) {
    assert.equal(classifySourceServiceItemCategory(sourceItem(name)), 'JASA', name)
  }
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
