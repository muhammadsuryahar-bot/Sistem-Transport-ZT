import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getDocumentSaveFeedback } from '../src/utils/documentSaveFeedback.js'

test('reports successful creation without a cleanup error', () => {
  assert.deepEqual(getDocumentSaveFeedback({ editing: false }), {
    success: 'Dokumen ditambahkan.',
    error: '',
  })
})

test('reports successful document update when old-file cleanup succeeds', () => {
  assert.deepEqual(getDocumentSaveFeedback({ editing: true, previousFileCleanupFailed: false }), {
    success: 'Dokumen diperbarui.',
    error: '',
  })
})

test('keeps update success separate from an old-file cleanup failure', () => {
  const feedback = getDocumentSaveFeedback({ editing: true, previousFileCleanupFailed: true })
  assert.equal(feedback.success, 'Dokumen diperbarui.')
  assert.match(feedback.error, /berkas lama gagal dibersihkan dari Storage/i)
  assert.match(feedback.error, /pemeriksaan Admin/i)
})
