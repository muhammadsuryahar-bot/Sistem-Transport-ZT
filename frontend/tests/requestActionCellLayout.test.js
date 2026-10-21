import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('service request action cells preserve table layout while their controls wrap in an inner flex group', async () => {
  const [source, css] = await Promise.all([
    readFile(new URL('../src/modules/PermintaanServicePageFixed.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/transport-ui-final.css', import.meta.url), 'utf8'),
  ])

  const cells = source.match(/<td className="request-actions">/g) || []
  const wrappedCells = source.match(/<td className="request-actions"><div className="request-actions-inner">/g) || []
  assert.equal(cells.length, 4, 'Expected four action cells in summary, benchmark, requests, and nested history tables')
  assert.equal(wrappedCells.length, 4, 'Every service action cell must wrap the buttons, not turn the table cell into flex')

  assert.match(css, /\.request-actions \{ display: table-cell !important;/)
  assert.match(css, /\.request-actions-inner \{ display: flex !important;/)
  assert.doesNotMatch(css, /\.request-actions \{ display: flex !important;/)
  assert.match(css, /\.request-actions-inner \{ gap: 5px !important; \}/)
})
