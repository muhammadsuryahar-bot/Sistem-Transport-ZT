import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { inferRentalTypeFromOwner } from '../src/utils/vehicleOwnership.js'

test('infers company rental type from supported owner prefixes', () => {
  for (const owner of [
    'PT. Zaman Teknindo',
    'PT Zaman Teknindo',
    'CV. Sumber Makmur',
    'CV Sumber Makmur',
    'UD. Berkah',
    'Yayasan Contoh',
    'Koperasi Pegawai',
  ]) {
    assert.equal(inferRentalTypeFromOwner(owner), 'SEWA_PERUSAHAAN', owner)
  }
})

test('defaults named non-company owners to individual rental type', () => {
  for (const owner of ['Budi Santoso', 'Surya Harja', 'PTZaman tanpa pemisah']) {
    assert.equal(inferRentalTypeFromOwner(owner), 'SEWA_PERORANGAN', owner)
  }
})

test('returns an empty type for an empty owner', () => {
  assert.equal(inferRentalTypeFromOwner(''), '')
  assert.equal(inferRentalTypeFromOwner(null), '')
  assert.equal(inferRentalTypeFromOwner('   '), '')
})

test('master vehicle page uses the tested owner classifier', async () => {
  const source = await readFile(new URL('../src/modules/MasterKendaraanExcelAlignedPage.jsx', import.meta.url), 'utf8')
  assert.match(source, /import \{ inferRentalTypeFromOwner \} from '\.\.\/utils\/vehicleOwnership\.js'/)
  assert.match(source, /normalizeRentalType\(vehicle\?\.jenis_sewa\) \|\| inferRentalTypeFromOwner\(vehicle\?\.pemilik\)/)
})
