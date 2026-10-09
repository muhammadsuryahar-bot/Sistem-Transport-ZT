import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DOCUMENT_UPLOAD_ACCEPT,
  IMAGE_UPLOAD_ACCEPT,
  MAX_STORAGE_UPLOAD_BYTES,
  validateStorageUploadFile,
} from '../src/utils/storageUpload.js'

const file = (name, type, size = 1024) => ({ name, type, size })

test('allows valid PDF document uploads', () => {
  assert.equal(validateStorageUploadFile(file('invoice.pdf', 'application/pdf')), 'application/pdf')
})

test('allows supported images for document uploads', () => {
  assert.equal(validateStorageUploadFile(file('photo.png', 'image/png')), 'image/png')
})

test('normalizes filename extension and MIME casing', () => {
  assert.equal(validateStorageUploadFile(file('INVOICE.PDF', 'APPLICATION/PDF')), 'application/pdf')
})

test('uses allowlisted extension when browser MIME is missing', () => {
  assert.equal(validateStorageUploadFile(file('photo.jpg', '')), 'image/jpeg')
})

test('uses allowlisted extension when browser reports generic binary MIME', () => {
  assert.equal(validateStorageUploadFile(file('photo.heic', 'application/octet-stream')), 'image/heic')
})

test('accepts extensionless files when their MIME is allowlisted', () => {
  assert.equal(validateStorageUploadFile(file('invoice', 'application/pdf')), 'application/pdf')
})

test('rejects a known but unsupported extension even when MIME is spoofed', () => {
  assert.throws(() => validateStorageUploadFile(file('payload.svg', 'image/png')), /Ekstensi file tidak didukung/)
})

test('rejects an extension and MIME conflict', () => {
  assert.throws(() => validateStorageUploadFile(file('payload.pdf', 'image/png')), /tidak cocok dengan ekstensinya/)
})

test('rejects SVG files from the supported document and image formats', () => {
  assert.throws(() => validateStorageUploadFile(file('drawing.svg', 'image/svg+xml')), /Ekstensi file tidak didukung/)
})

test('image-only uploads reject PDFs', () => {
  assert.throws(() => validateStorageUploadFile(file('invoice.pdf', 'application/pdf'), { imagesOnly: true }), /Format file tidak didukung/)
})

test('image-only uploads accept supported image MIME types', () => {
  assert.equal(validateStorageUploadFile(file('photo.webp', 'image/webp'), { imagesOnly: true }), 'image/webp')
})

test('rejects files larger than 50 MiB', () => {
  assert.throws(() => validateStorageUploadFile(file('large.pdf', 'application/pdf', MAX_STORAGE_UPLOAD_BYTES + 1)), /maksimal 50 MiB/)
})

test('accepts files exactly at the 50 MiB limit', () => {
  assert.equal(validateStorageUploadFile(file('limit.pdf', 'application/pdf', MAX_STORAGE_UPLOAD_BYTES)), 'application/pdf')
})

test('rejects invalid size metadata', () => {
  assert.throws(() => validateStorageUploadFile(file('bad.pdf', 'application/pdf', Number.NaN)), /Ukuran file tidak dapat diperiksa/)
})

test('declares only bucket-supported MIME types in file pickers', () => {
  assert.ok(DOCUMENT_UPLOAD_ACCEPT.includes('application/pdf'))
  assert.ok(DOCUMENT_UPLOAD_ACCEPT.includes('image/jpeg'))
  assert.ok(IMAGE_UPLOAD_ACCEPT.includes('image/png'))
  assert.ok(!DOCUMENT_UPLOAD_ACCEPT.includes('image/svg+xml'))
})
