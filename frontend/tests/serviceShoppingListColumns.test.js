import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('Shopping List empty state spans all table columns', async () => {
  const source = await readFile(new URL('../src/modules/PermintaanServicePageFixed.jsx', import.meta.url), 'utf8')
  const notePosition = source.indexOf('service-benchmark-note')
  const tablePosition = source.indexOf('<table className="request-table">', notePosition)
  const headerEnd = source.indexOf('</thead>', tablePosition)
  assert.ok(tablePosition >= 0 && headerEnd > tablePosition, 'Shopping List table header must exist')
  const header = source.slice(tablePosition, headerEnd)
  const headerCount = [...header.matchAll(/<th(?:\s|>)/g)].length
  assert.equal(headerCount, 17)
  const emptyRow = source.match(/<td colSpan="(\d+)"><div className="request-empty">Belum ada data item service untuk dijadikan patokan\./)
  assert.ok(emptyRow, 'Shopping List empty state must exist')
  assert.equal(Number(emptyRow[1]), headerCount)
})
