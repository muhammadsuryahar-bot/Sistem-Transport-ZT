import assert from 'node:assert/strict'
import { test } from 'node:test'
import { analyzeVehicleIntegrity } from '../src/utils/vehicleIntegrity.js'

test('flags duplicated engine/chassis values used by different plates as needing review', () => {
  const report = analyzeVehicleIntegrity([
    { id: 1, nomor_polisi: 'BM 1533 OA', nomor_mesin: '2NRF754840', nomor_rangka: 'MHKE8FA3JJK016543' },
    { id: 2, nomor_polisi: 'BM 1533 VP', nomor_mesin: '2NRF754840', nomor_rangka: 'MHKE8FA3JJK016543' },
    { id: 3, nomor_polisi: 'BM 1000 AA', nomor_mesin: 'OTHER-1', nomor_rangka: 'OTHER-2' },
  ])
  assert.equal(report.reviewCount, 2)
  assert.equal(report.duplicateIdentityPairCount, 1)
  assert.equal(report.isFlagged({ id: 1, nomor_polisi: 'BM 1533 OA' }), true)
  assert.equal(report.isFlagged({ id: 3, nomor_polisi: 'BM 1000 AA' }), false)
})

test('uses source audit notes to flag conflicts and missing fields without inventing values', () => {
  const report = analyzeVehicleIntegrity([
    { id: 4, nomor_polisi: 'BM 9672 TZ', keterangan: 'PERLU VERIFIKASI IDENTITAS' },
    { id: 5, nomor_polisi: 'BM 8091 QO', keterangan: 'NO MESIN/RANGKA KOSONG DI SUMBER' },
    { id: 6, nomor_polisi: 'BM 1000 AA', keterangan: 'Data valid' },
  ])
  assert.equal(report.reviewCount, 2)
  assert.equal(report.isFlagged({ id: 4, nomor_polisi: 'BM 9672 TZ' }), true)
  assert.equal(report.isFlagged({ id: 5, nomor_polisi: 'BM 8091 QO' }), true)
  assert.equal(report.isFlagged({ id: 6, nomor_polisi: 'BM 1000 AA' }), false)
})
