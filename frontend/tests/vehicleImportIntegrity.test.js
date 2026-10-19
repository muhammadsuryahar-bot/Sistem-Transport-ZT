import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  analyzeVehicleImportAgainstDatabase,
  analyzeVehicleImportIntegrity,
  describeVehicleDatabaseConflicts,
  describeVehicleImportIntegrity,
  describeVehicleSourceFieldErrors,
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

test('blocks duplicate rows for one plate when location or other populated operational fields conflict', () => {
  const report = analyzeVehicleImportIntegrity([
    { excelRow: 77, nomor_polisi: 'BM 8417 TW', merk: 'Daihatsu', tipe: 'Grandmax', jenis: 'Pickup', tahun: '2014', nomor_mesin: '3SZDGL3324', nomor_rangka: 'MHKP3CA1JHK155863', pemilik: 'PT Elang', kepemilikan: 'SEWA', lokasi: 'Pekanbaru' },
    { excelRow: 82, nomor_polisi: 'BM 8417 TW', merk: 'Daihatsu', tipe: 'Grandmax', jenis: 'Pickup', tahun: '2014', nomor_mesin: '3SZDGL3324', nomor_rangka: 'MHKP3CA1JHK155863', pemilik: 'PT Elang', kepemilikan: 'SEWA', lokasi: 'Dumai' },
  ])
  assert.equal(report.duplicatePlateConflicts.length, 1)
  assert.equal(report.duplicatePlateConflicts[0].plate, 'BM 8417 TW')
  assert.deepEqual(report.duplicatePlateConflicts[0].fields, ['lokasi'])
  assert.deepEqual(report.duplicatePlateConflicts[0].rows, [77, 82])
  assert.equal(report.hasBlockingConflicts, true)
})

test('blocks a source-only plate that reuses identifiers belonging to another stored plate', () => {
  const report = analyzeVehicleImportAgainstDatabase(
    [{ excelRow: 36, nomor_polisi: 'BM 9960 TM', nomor_mesin: '4G15S76333', nomor_rangka: 'MK2U5TU2EJK011885' }],
    [{ nomor_polisi: 'BM 9960 TW', nomor_mesin: '4G15S76333', nomor_rangka: 'MK2U5TU2EJK011885' }],
  )
  assert.equal(report.hasBlockingConflicts, true)
  assert.equal(report.databaseConflicts.length, 1)
  assert.equal(report.databaseConflicts[0].sourcePlate, 'BM 9960 TM')
  assert.equal(report.databaseConflicts[0].existingPlate, 'BM 9960 TW')
  assert.deepEqual(report.databaseConflicts[0].fields, ['nomor_mesin', 'nomor_rangka'])
  assert.match(describeVehicleDatabaseConflicts(report)[0], /BM 9960 TM vs kendaraan tersimpan BM 9960 TW/)
})

test('does not treat the same stored plate as a cross-vehicle identity conflict', () => {
  const report = analyzeVehicleImportAgainstDatabase(
    [{ excelRow: 12, nomor_polisi: 'BM 1533 OA', nomor_mesin: '2NRF754840', nomor_rangka: 'MHKE8FA3JJK016543' }],
    [{ nomor_polisi: 'BM 1533 OA', nomor_mesin: '2NRF754840', nomor_rangka: 'MHKE8FA3JJK016543' }],
  )
  assert.equal(report.hasBlockingConflicts, false)
  assert.deepEqual(report.databaseConflicts, [])
})

test('ignores blank identifiers during database preflight', () => {
  const report = analyzeVehicleImportAgainstDatabase(
    [{ excelRow: 12, nomor_polisi: 'BM 8241 TM', nomor_mesin: '', nomor_rangka: '' }],
    [{ nomor_polisi: 'BM 8241 TM', nomor_mesin: null, nomor_rangka: null }],
  )
  assert.equal(report.hasBlockingConflicts, false)
})

test('blocks a source engine/chassis value that would overwrite a different identifier on the same stored plate', () => {
  const report = analyzeVehicleImportAgainstDatabase(
    [{ excelRow: 50, nomor_polisi: 'BM 9084 TS', nomor_mesin: 'WRONG-ENGINE', nomor_rangka: 'WRONG-CHASSIS' }],
    [{ nomor_polisi: 'BM 9084 TS', nomor_mesin: '4G15L88671', nomor_rangka: 'MHMU5TU2EFK172154' }],
  )
  assert.equal(report.hasBlockingConflicts, true)
  assert.deepEqual(report.databaseConflicts, [])
  assert.equal(report.samePlateConflicts.length, 1)
  assert.deepEqual(report.samePlateConflicts[0].fields, ['nomor_mesin', 'nomor_rangka'])
  assert.match(describeVehicleDatabaseConflicts(report)[0], /BM 9084 TS: nomor mesin dan nomor rangka pada Excel berbeda/)
})


test('blocks stale ownership, owner, location and tax values from overwriting the stored master', () => {
  const report = analyzeVehicleImportAgainstDatabase(
    [{
      excelRow: 41,
      nomor_polisi: 'BM 8238 TM',
      merk: 'Daihatsu',
      tipe: 'Grandmax/P.U',
      jenis: 'Pickup',
      tahun: '2012',
      kepemilikan: 'ASET',
      jenis_sewa: '',
      pemilik: 'PT Zaman Teknindo',
      lokasi: 'Pekanbaru',
      unit_kerja: 'Operasional',
      masa_pajak: '2027-02-10',
      status_pajak: 'HIDUP',
    }],
    [{
      nomor_polisi: 'BM 8238 TM',
      nomor_mesin: '',
      nomor_rangka: '',
      merk: 'Daihatsu',
      tipe: 'Grandmax/P.U',
      jenis_kendaraan: 'Pickup',
      tahun: 2012,
      kepemilikan: 'SEWA',
      jenis_sewa: 'SEWA_PERORANGAN',
      pemilik: 'Bpk. Hariadi JS',
      lokasi: 'Bangkinang',
      unit_kerja: 'Operasional',
      masa_berlaku_pajak: '2026-02-10',
      status_pajak: 'HIDUP',
    }],
  )
  assert.equal(report.hasBlockingConflicts, true)
  assert.equal(report.masterFieldConflicts.length, 1)
  assert.deepEqual(report.masterFieldConflicts[0].fields, ['kepemilikan', 'pemilik', 'lokasi', 'masa_pajak'])
  assert.match(describeVehicleDatabaseConflicts(report).join('\n'), /BM 8238 TM: nilai Excel untuk status kepemilikan, pemilik, lokasi, masa berlaku pajak/)
})

test('allows blank legacy fields and equivalent year formatting without inventing conflicts', () => {
  const report = analyzeVehicleImportAgainstDatabase(
    [{
      excelRow: 50,
      nomor_polisi: 'BM 9383 TI',
      merk: 'Daihatsu',
      tipe: 'Grandmax',
      jenis: 'Pickup',
      tahun: '2011.0',
      kepemilikan: 'ASET',
      pemilik: 'PT Zaman Teknindo',
      lokasi: '',
      unit_kerja: '',
      masa_pajak: '',
      status_pajak: '',
      nomor_mesin: '',
      nomor_rangka: '',
    }],
    [{
      nomor_polisi: 'BM 9383 TI',
      merk: 'Daihatsu',
      tipe: 'Grandmax',
      jenis_kendaraan: 'Pickup',
      tahun: 2011,
      kepemilikan: 'ASET',
      pemilik: 'PT Zaman Teknindo',
      lokasi: 'Kandis',
      unit_kerja: null,
      masa_berlaku_pajak: '2027-01-01',
      status_pajak: 'HIDUP',
      nomor_mesin: 'DJ35383',
      nomor_rangka: 'MHKP3BA1JBK027565',
    }],
  )
  assert.equal(report.hasBlockingConflicts, false)
  assert.deepEqual(report.masterFieldConflicts, [])
  assert.deepEqual(report.databaseConflicts, [])
  assert.deepEqual(report.samePlateConflicts, [])
})


test('blocks invalid dates and tax-status strings instead of interpreting them as other fields', () => {
  const errors = describeVehicleSourceFieldErrors([
    {
      excelRow: 82,
      nomor_polisi: 'BM 8417 TW',
      masa_pajak_raw: 'Suppor Catu Daya',
      masa_pajak: null,
      status_pajak: '',
    },
    {
      excelRow: 84,
      nomor_polisi: 'BM 9483 TS',
      masa_pajak_raw: 'Suppor Catu Daya',
      masa_pajak: null,
      status_pajak: 'ANDESCER',
    },
  ])
  assert.equal(errors.length, 3)
  assert.match(errors[0], /BM 8417 TW.*Masa Berlaku Pajak/)
  assert.match(errors[1], /BM 9483 TS.*Masa Berlaku Pajak/)
  assert.match(errors[2], /BM 9483 TS.*Status Pajak/)
})

test('accepts recognised tax dates and Hidup/Mati status, while preserving blank fields', () => {
  assert.deepEqual(describeVehicleSourceFieldErrors([
    { excelRow: 7, nomor_polisi: 'BM 1056 NV', masa_pajak_raw: '2025-10-25', masa_pajak: '2025-10-25', status_pajak: 'HIDUP' },
    { excelRow: 8, nomor_polisi: 'BM 1798 TE', masa_pajak_raw: '-', masa_pajak: null, status_pajak: '-' },
    { excelRow: 9, nomor_polisi: 'BM 1846 JY', masa_pajak_raw: '', masa_pajak: null, status_pajak: '' },
  ]), [])
})
