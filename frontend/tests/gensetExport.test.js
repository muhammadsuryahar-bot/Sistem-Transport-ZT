import test from 'node:test'
import assert from 'node:assert/strict'
import { buildGensetExportRows } from '../src/utils/gensetExport.js'

test('exports engine and generator identifiers from the actual database column names', () => {
  const rows = buildGensetExportRows([{
    source_no: 12,
    merk: 'Kubota',
    kapasitas_kva: 15,
    engine_no: 'ENG-123',
    generator_no: 'GEN-456',
    lokasi_kerja: 'Pekanbaru',
    pemilik: 'PT Zaman Teknindo',
    status_kepemilikan: 'ASET',
    keterangan: 'uji mapping',
  }])

  assert.deepEqual(rows, [{
    no_export: 12,
    merk: 'Kubota',
    kapasitas_kva: 15,
    engine_no: 'ENG-123',
    generator_no: 'GEN-456',
    lokasi_kerja: 'Pekanbaru',
    pemilik: 'PT Zaman Teknindo',
    status_kepemilikan: 'Aset',
    keterangan: 'uji mapping',
  }])
})

test('keeps blank identifiers explicit and preserves source numbering', () => {
  assert.deepEqual(buildGensetExportRows([
    { source_no: 33, merk: 'Isuzu Fotton', kapasitas_kva: 20, status_kepemilikan: 'SEWA' },
    { merk: 'Kubota', kapasitas_kva: 15, status_kepemilikan: 'ASET' },
  ]), [
    {
      no_export: 33,
      merk: 'Isuzu Fotton',
      kapasitas_kva: 20,
      engine_no: '-',
      generator_no: '-',
      lokasi_kerja: '-',
      pemilik: '-',
      status_kepemilikan: 'Sewa',
      keterangan: '-',
    },
    {
      no_export: 2,
      merk: 'Kubota',
      kapasitas_kva: 15,
      engine_no: '-',
      generator_no: '-',
      lokasi_kerja: '-',
      pemilik: '-',
      status_kepemilikan: 'Aset',
      keterangan: '-',
    },
  ])
})

test('returns no rows for invalid or empty input', () => {
  assert.deepEqual(buildGensetExportRows(), [])
  assert.deepEqual(buildGensetExportRows(null), [])
})
