import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getDocumentAttachmentStatus } from '../src/utils/documentAttachmentStatus.js'

test('identifies Excel-imported metadata without claiming the physical file was lost', () => {
  const status = getDocumentAttachmentStatus({
    file_path: null,
    keterangan: 'EXCEL_META:{"source":"STNK_DAN_5_TAHUNAN","source_no":"1"}',
  })
  assert.equal(status.key, 'metadata-only')
  assert.equal(status.label, 'Metadata Excel saja')
  assert.match(status.message, /belum diunggah/i)
})

test('treats null, empty, and whitespace-only paths as unattached', () => {
  for (const file_path of [null, '', '   ']) {
    const status = getDocumentAttachmentStatus({ file_path, keterangan: 'Input manual' })
    assert.equal(status.key, 'missing')
    assert.match(status.message, /belum ada berkas fisik/i)
  }
})

test('treats an existing non-empty path as recorded, without guaranteeing the object opens', () => {
  const status = getDocumentAttachmentStatus({ file_path: '42/doc.pdf', keterangan: '' })
  assert.equal(status.key, 'linked')
  assert.match(status.message, /memastikan berkas dapat dibuka/i)
})
