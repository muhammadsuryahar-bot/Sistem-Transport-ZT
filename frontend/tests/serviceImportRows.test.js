import test from 'node:test'
import assert from 'node:assert/strict'
import { selectServiceImportRows } from '../src/utils/serviceImportRows.js'

function row(excelRow, fields = {}) {
  return {
    excelRow,
    values: fields.values || [fields.source_no ?? '', fields.nomor_polisi ?? '', fields.tanggal ?? '', fields.uraian ?? '', fields.total ?? ''],
    source_no: fields.source_no ?? '',
    nomor_polisi: fields.nomor_polisi ?? '',
    tanggal: fields.tanggal ?? '',
    driver: fields.driver ?? '',
    bulan: fields.bulan ?? '',
    jenis_pekerjaan: fields.jenis_pekerjaan ?? '',
    uraian: fields.uraian ?? '',
    bengkel: fields.bengkel ?? '',
    merk: fields.merk ?? '',
    tipe: fields.tipe ?? '',
  }
}

test('keeps source-numbered rows even when required plate or date is missing', () => {
  const valid = row(6, { source_no: '1.0', nomor_polisi: 'BM 1234 AA', tanggal: '2026-01-01', uraian: 'Oli' })
  const missingPlate = row(7, { source_no: '2.0', nomor_polisi: '', tanggal: '2026-01-02', uraian: 'Filter' })
  const missingDate = row(8, { source_no: '3.0', nomor_polisi: 'BM 1234 AA', tanggal: '', uraian: 'Rem' })
  assert.deepEqual(selectServiceImportRows([valid, missingPlate, missingDate]).map(item => item.excelRow), [6, 7, 8])
})

test('keeps orphan transaction rows without a source number for validation', () => {
  const orphan = row(9, { source_no: '', nomor_polisi: '', tanggal: '', uraian: 'Source line with missing identifiers' })
  assert.deepEqual(selectServiceImportRows([orphan]).map(item => item.excelRow), [9])
})

test('excludes the aggregate TOTAL footer but retains transaction rows', () => {
  const transaction = row(6, { source_no: '1.0', nomor_polisi: 'BM 1234 AA', tanggal: '2026-01-01', uraian: 'Oli' })
  const footer = row(2992, { source_no: 'TOTAL', total: '40.047.500', values: ['TOTAL', '', '', '', '', '27.766.000', '36.170.000', '3.877.500', '40.047.500'] })
  assert.deepEqual(selectServiceImportRows([transaction, footer]).map(item => item.excelRow), [6])
})

test('ignores empty styled rows', () => {
  const empty = row(400, { source_no: '', values: ['', '', '', '', ''] })
  assert.deepEqual(selectServiceImportRows([empty]), [])
})
