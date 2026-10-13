import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  benchmarkKey,
  buildServicePriceHistory,
  classifyBenchmarkCategory,
  mergeServicePriceBenchmarks,
  normalizeBenchmarkItemName,
} from '../src/utils/serviceBenchmark.js'

test('normalizes numbering and spacing when comparing item names', () => {
  assert.equal(normalizeBenchmarkItemName(' 1.   Oli Mesin Prima XP '), 'OLI MESIN PRIMA XP')
  assert.equal(normalizeBenchmarkItemName('2) Filter Oli'), 'FILTER OLI')
  assert.equal(benchmarkKey('1. Filter Oli', 'OLI', 'pcs'), benchmarkKey('Filter   Oli', 'OLI', 'PCS'))
})

test('classifies known part families ahead of broad historical work labels', () => {
  assert.equal(classifyBenchmarkCategory('Filter Oli', 'Jasa Service', 'JASA'), 'OLI')
  assert.equal(classifyBenchmarkCategory('Ban Accelera 185/70 R14', 'Jasa Service', 'JASA'), 'BAN')
  assert.equal(classifyBenchmarkCategory('Battery GS NS 70', 'Jasa Service', 'JASA'), 'AKI')
  assert.equal(classifyBenchmarkCategory('Switch Lampu', 'Pengadaan Barang', 'JASA'), 'SPAREPART')
  assert.equal(classifyBenchmarkCategory('Spooring', 'Jasa Service', 'LAINNYA'), 'JASA')
})

test('aggregates comparable prices by normalized item, category and unit', () => {
  const history = buildServicePriceHistory([
    { name: '1. Filter Oli', category: 'OLI', unit: 'pcs', price: 45000, vehicle: 'BM 1000 AA', workshop: 'Bengkel A' },
    { name: 'Filter   Oli', category: 'OLI', unit: 'PCS', price: 50000, vehicle: 'BM 1000 AA', workshop: 'Bengkel A' },
    { name: 'Filter Oli', category: 'OLI', unit: 'PCS', price: 55000, vehicle: 'BM 1001 AB', workshop: 'Bengkel B' },
    { name: 'Filter Oli', category: 'OLI', unit: 'LTR', price: 85000, vehicle: 'BM 1001 AB', workshop: 'Bengkel B' },
    { name: 'Filter Oli', category: 'OLI', unit: 'PCS', price: 0, vehicle: 'BM 1001 AB', workshop: 'Bengkel B' },
    { name: '', category: 'OLI', unit: 'PCS', price: 100, vehicle: 'BM 1001 AB', workshop: 'Bengkel B' },
  ])

  const pcs = history.find(row => row.unit === 'PCS')
  const ltr = history.find(row => row.unit === 'LTR')
  assert.equal(history.length, 2)
  assert.equal(pcs.transactionCount, 3)
  assert.equal(pcs.vehicleCount, 2)
  assert.equal(pcs.workshopCount, 2)
  assert.equal(pcs.minPrice, 45000)
  assert.equal(pcs.medianPrice, 50000)
  assert.equal(pcs.maxPrice, 55000)
  assert.equal(pcs.averagePrice, 50000)
  assert.equal(pcs.transactions.length, 3)
  assert.equal(pcs.transactions[0].price, 55000)
  assert.equal(pcs.transactions[0].vehicle, 'BM 1001 AB')
  assert.equal(pcs.transactions[0].workshop, 'Bengkel B')
  assert.equal(ltr.transactionCount, 1)
})

test('merges admin benchmarks and preserves benchmark-only items without inventing history', () => {
  const history = buildServicePriceHistory([
    { name: 'Oli Mesin Prima XP', category: 'OLI', unit: 'LTR', price: 36000, vehicle: 'BM 1056 NV', workshop: 'Bengkel A' },
    { name: 'Oli Mesin Prima XP', category: 'OLI', unit: 'LTR', price: 55000, vehicle: 'BM 1056 NV', workshop: 'Bengkel A' },
  ])
  const merged = mergeServicePriceBenchmarks(history, [
    { id: 10, nama_item: 'OLI MESIN PRIMA XP', kategori: 'OLI', satuan: 'ltr', harga_patokan: 40000, aktif: true },
    { id: 11, nama_item: 'Kampas Rem', kategori: 'SPAREPART', satuan: 'PCS', harga_patokan: 100000, aktif: false },
  ])
  const matched = merged.find(row => row.nama_item.toUpperCase().includes('OLI MESIN'))
  const benchmarkOnly = merged.find(row => row.benchmark?.id === 11)
  assert.equal(matched.history.transactionCount, 2)
  assert.equal(matched.benchmark.id, 10)
  assert.equal(benchmarkOnly.history, null)
  assert.equal(benchmarkOnly.benchmark.aktif, false)
})
