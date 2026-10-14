import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  analyzeVehicleImportIntegrity,
  describeVehicleImportIntegrity,
} from '../src/utils/vehicleImportIntegrity.js'

test('blocks a repeated plate when its populated identity fields contradict each other', () => {
  const report = analyzeVehicleImportIntegrity([
    { excelRow: 19, nomor_polisi: 'BM 9672 TZ', merk: 'Daihatsu', tipe: 'Grandmax', tahun: '2011', nomor_mesin: 'DCK4885', nomor_rangka: 'MHKP3CMJB019734', pemilik: 'PT Elang', kepemilikan: 'SEWA' },
    { excelRow: 71, nomor_polisi: 'BM 9672 TZ', merk: 'Daihatsu', tipe: 'Grandmax', tahun: '2014', nomor_mesin: 'K3MH79043', nomor_rangka: 'MHKP3BA1JLK158426', pemilik: 'PT Elang', kepemilikan: 'SEWA' },
  ])
  assert.equal(report.duplicatePlateConflicts.length, 1)
  assert.equal(report.hasBlockingConflicts, true)
  assert.deepEqual(report.duplicatePlateConflicts[0].rows, [19, 71])
})

test('blocks an identifier reused by two different plates and reports both plates', () => {
  const report = analyzeVehicleImportIntegrity([
    { excelRow: 10, nomor_polisi: 'BM 1533 OA', nomor_mesin: '2NRF754840', nomor_rangka: 'MHKE8FA3JJK016543' },
    { excelRow: 7, nomor_polisi: 'BM 1533 VP', nomor_mesin: '2NRF754840', nomor_rangka: 'MHKE8FA3JJK016543' },
  ])
  assert.equal(report.duplicatePlateConflicts.length, 0)
  assert.equal(report.crossVehicleConflicts.length, 1)
  assert.deepEqual(report.crossVehicleConflicts[0].plates, ['BM 1533 OA', 'BM 1533 VP'])
  assert.match(describeVehicleImportIntegrity(report)[0], /BM 1533 OA ↔ BM 1533 VP/)
})

test('does not block ordinary duplicate source rows for the same vehicle', () => {
  const report = analyzeVehicleImportIntegrity([
    { excelRow: 31, nomor_polisi: 'BM 9383 TI', merk: 'Daihatsu', tahun: '2011', nomor_mesin: 'DJ35383', nomor_rangka: 'MHKP3BA1JBK027565' },
    { excelRow: 75, nomor_polisi: 'BM 9383 TI', merk: 'Daihatsu', tahun: '2011', nomor_mesin: 'DJ35383', nomor_rangka: 'MHKP3BA1JBK027565' },
  ])
  assert.equal(report.hasBlockingConflicts, false)
})
