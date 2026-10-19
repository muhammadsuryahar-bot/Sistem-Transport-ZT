import test from 'node:test'
import assert from 'node:assert/strict'
import { parseGensetImportSheet, preserveExistingGensetValuesOnBlankSource } from '../src/utils/gensetExcelImport.js'

const headers = ['No', 'Merk', 'Kap. (KVa)', 'Engine No.', 'Generator No.', 'Lokasi Kerja', 'Pemilik', 'Status Kepemilikan', 'Keterangan']

function sheet(rows, name = 'Data Genset') {
  return {
    name,
    rows: [
      { excelRow: 1, values: ['DATA GENERATOR SET'] },
      { excelRow: 5, values: headers },
      ...rows,
    ],
  }
}

test('maps source workbook columns and preserves blank engine/generator numbers', () => {
  const result = parseGensetImportSheet(sheet([
    { excelRow: 6, values: ['1.0', ' Isuzu Fotton ', '20.0', '', '', 'Bangkinang', 'PT Zaman Teknindo', 'Aset', ''] },
    { excelRow: 7, values: ['2.0', 'Perkins', '20', 'ENG-02', 'GEN-02', 'Duri', 'Bpk. Edi', 'Sewa', 'Catatan'] },
  ]))

  assert.equal(result.errors.length, 0)
  assert.equal(result.rows.length, 2)
  assert.deepEqual(
    { source_no: result.rows[0].source_no, merk: result.rows[0].merk, kapasitas_kva: result.rows[0].kapasitas_kva, engine_no: result.rows[0].engine_no, generator_no: result.rows[0].generator_no, status_kepemilikan: result.rows[0].status_kepemilikan },
    { source_no: 1, merk: 'Isuzu Fotton', kapasitas_kva: 20, engine_no: null, generator_no: null, status_kepemilikan: 'ASET' },
  )
  assert.equal(result.rows[0].source_row, 6)
  assert.equal(result.rows[1].status_kepemilikan, 'SEWA')
  assert.equal(result.rows[1].engine_no, 'ENG-02')
})

test('blocks the entire import if any row has an invalid capacity or status', () => {
  const result = parseGensetImportSheet(sheet([
    { excelRow: 6, values: ['1', 'Isuzu Fotton', '20', '', '', 'Bangkinang', 'PT Zaman Teknindo', 'Aset', ''] },
    { excelRow: 7, values: ['2', 'Perkins', 'not-a-number', '', '', 'Duri', 'Bpk. Edi', 'Lease?', ''] },
  ]))

  assert.equal(result.rows.length, 2)
  assert.equal(result.errors.length, 2)
  assert.match(result.errors.join('\n'), /Baris Excel 7/)
  assert.match(result.errors.join('\n'), /Kapasitas KVA tidak valid/)
  assert.match(result.errors.join('\n'), /Status kepemilikan tidak dikenal/)
})

test('blocks duplicate source numbers, not just repeated names', () => {
  const result = parseGensetImportSheet(sheet([
    { excelRow: 6, values: ['1', 'Isuzu Fotton', '20', '', '', 'Bangkinang', 'PT Zaman Teknindo', 'Aset', ''] },
    { excelRow: 7, values: ['1.0', 'Perkins', '20', '', '', 'Duri', 'Bpk. Edi', 'Sewa', ''] },
  ]))

  assert.equal(result.errors.length, 1)
  assert.match(result.errors[0], /No sumber 1 duplikat/)
})

test('rejects a valid header with no source rows', () => {
  const result = parseGensetImportSheet({ name: 'Data Genset', rows: [{ excelRow: 5, values: headers }, { excelRow: 39, values: ['', '', '', '', '', '', '', '', ''] }] })
  assert.equal(result.rows.length, 0)
  assert.match(result.errors[0], /tidak berisi baris data/)
})

test('rejects a non-genset sheet that lacks required columns', () => {
  const result = parseGensetImportSheet({ name: 'Summary Rental', rows: [{ excelRow: 1, values: ['No', 'Supplier', 'Invoice'] }] })
  assert.equal(result.rows.length, 0)
  assert.match(result.errors[0], /Header Data Genset tidak lengkap/)
})

test('ignores empty formatted rows but flags any non-empty incomplete source row', () => {
  const result = parseGensetImportSheet(sheet([
    { excelRow: 6, values: ['1', 'Isuzu Fotton', '20', '', '', 'Bangkinang', 'PT Zaman Teknindo', 'Aset', ''] },
    { excelRow: 39, values: ['', '', '', '', '', '', '', '', ''] },
    { excelRow: 40, values: ['', 'Catatan orphan', '', '', '', '', '', '', ''] },
  ]))

  assert.equal(result.dataRows.length, 2)
  assert.equal(result.rows.length, 2)
  assert.ok(result.errors.length >= 1)
  assert.ok(result.errors.some(issue => /Baris Excel 40/.test(issue)))
  assert.ok(result.errors.some(issue => /No sumber wajib/.test(issue)))
})


test('matches the official source shape of 33 Genset rows and preserves blank serial values', () => {
  const result = parseGensetImportSheet(sheet(
    Array.from({ length: 33 }, (_, index) => ({
      excelRow: index + 6,
      values: [
        String(index + 1),
        index < 7 ? 'Isuzu Fotton' : 'Kubota',
        index === 1 ? '15.0' : '20.0',
        '',
        '',
        `Lokasi ${index + 1}`,
        index < 7 ? 'PT Zaman Teknindo' : 'Pemilik Sewa',
        index < 7 ? 'Aset' : 'Sewa',
        '',
      ],
    })),
  ))

  assert.equal(result.errors.length, 0)
  assert.equal(result.rows.length, 33)
  assert.deepEqual(result.rows.map(row => row.source_no), Array.from({ length: 33 }, (_, index) => index + 1))
  assert.equal(result.rows[0].source_row, 6)
  assert.equal(result.rows[32].source_row, 38)
  assert.ok(result.rows.every(row => row.engine_no === null && row.generator_no === null))
})

test('preserves existing master values when the source cells are blank', () => {
  const imported = {
    source_no: 1,
    merk: 'Isuzu Fotton',
    kapasitas_kva: 20,
    engine_no: null,
    generator_no: '',
    lokasi_kerja: '',
    pemilik: 'PT Zaman Teknindo',
    status_kepemilikan: 'ASET',
    keterangan: '',
  }
  const existing = {
    engine_no: 'ENG-VERIFIED-1',
    generator_no: 'GEN-VERIFIED-1',
    lokasi_kerja: 'Pekanbaru',
    pemilik: 'Pemilik lama',
    keterangan: 'Nilai sudah diverifikasi manual',
  }

  const result = preserveExistingGensetValuesOnBlankSource(imported, existing)

  assert.equal(result.row.engine_no, 'ENG-VERIFIED-1')
  assert.equal(result.row.generator_no, 'GEN-VERIFIED-1')
  assert.equal(result.row.lokasi_kerja, 'Pekanbaru')
  assert.equal(result.row.keterangan, 'Nilai sudah diverifikasi manual')
  assert.equal(result.row.pemilik, 'PT Zaman Teknindo')
  assert.deepEqual(result.preservedFields, ['engine_no', 'generator_no', 'lokasi_kerja', 'keterangan'])
})

test('non-empty source values still replace old master values', () => {
  const result = preserveExistingGensetValuesOnBlankSource(
    { engine_no: 'ENG-SOURCE-2', generator_no: null, keterangan: '' },
    { engine_no: 'ENG-OLD-2', generator_no: 'GEN-VERIFIED-2', keterangan: 'Verified note' },
  )

  assert.equal(result.row.engine_no, 'ENG-SOURCE-2')
  assert.equal(result.row.generator_no, 'GEN-VERIFIED-2')
  assert.equal(result.row.keterangan, 'Verified note')
  assert.deepEqual(result.preservedFields, ['generator_no', 'keterangan'])
})
