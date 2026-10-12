import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeGensetInput, validateGensetInput } from '../src/utils/gensetData.js'

test('validates a supported source record', () => {
  assert.equal(validateGensetInput({ merk: ' Isuzu Fotton ', kapasitas_kva: '20', status_kepemilikan: 'ASET' }), '')
})

test('rejects empty merk and invalid capacity', () => {
  assert.match(validateGensetInput({ merk: ' ', kapasitas_kva: 20, status_kepemilikan: 'ASET' }), /Merk/)
  assert.match(validateGensetInput({ merk: 'Kubota', kapasitas_kva: 0, status_kepemilikan: 'ASET' }), /KVA/)
  assert.match(validateGensetInput({ merk: 'Kubota', kapasitas_kva: 'abc', status_kepemilikan: 'ASET' }), /KVA/)
})

test('normalizes optional source fields without manufacturing data', () => {
  const result = normalizeGensetInput({ source_no: 34, merk: '  Perkins ', kapasitas_kva: '20', engine_no: ' ', generator_no: '', lokasi_kerja: ' Bangkinang ', pemilik: '', status_kepemilikan: 'sewa', keterangan: ' ' })
  assert.equal(result.merk, 'Perkins')
  assert.equal(result.kapasitas_kva, 20)
  assert.equal(result.engine_no, null)
  assert.equal(result.generator_no, null)
  assert.equal(result.lokasi_kerja, 'Bangkinang')
  assert.equal(result.pemilik, null)
  assert.equal(result.status_kepemilikan, 'SEWA')
  assert.equal(result.keterangan, null)
})
