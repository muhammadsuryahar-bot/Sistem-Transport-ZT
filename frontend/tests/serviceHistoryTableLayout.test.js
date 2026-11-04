import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = path => readFile(new URL(path, import.meta.url), 'utf8')

test('Service Excel history keeps all 21 columns readable instead of wrapping each word into narrow cells', async () => {
  const css = await read('../src/modules/TransportOperationsFixed.css')
  const source = await read('../src/modules/ServiceFeaturePage.jsx')
  const start = css.indexOf('/* Service Excel table: keep every column readable')
  const end = css.indexOf('/* FINAL TABLE DATA CONTRACT */', start)
  const layout = css.slice(start, end)
  const tableStart = source.indexOf('<table className="x-table service-excel-table">')
  const tableSource = source.slice(tableStart)
  const header = tableSource.match(/<thead><tr>(.*?)<\/tr><\/thead>/s)

  assert.ok(start >= 0 && end > start, 'the dedicated Service Excel layout rules exist')
  assert.match(layout, /min-width:2539px!important;width:2539px!important;table-layout:fixed!important/, 'the history table has enough width for its 21 columns')
  assert.match(layout, /\.service-excel-table th\{white-space:normal!important/, 'headers may wrap at word boundaries')
  assert.match(layout, /\.service-excel-table td\{white-space:nowrap!important/, 'ordinary cell values stay on one line')
  assert.match(layout, /nth-child\(7\)[\s\S]*?width:140px!important/, 'Driver/PIC receives a readable width')
  assert.match(layout, /nth-child\(11\)[\s\S]*?width:250px!important/, 'Uraian receives a readable width')
  assert.match(layout, /nth-child\(14\)[\s\S]*?width:140px!important/, 'Harga Satuan receives a readable width')
  assert.match(layout, /nth-child\(20\)[\s\S]*?width:220px!important/, 'Keterangan receives a readable width')
  assert.match(layout, /nth-child\(11\)[\s\S]*?overflow-wrap:anywhere!important/, 'only long-description cells may break exceptionally long text')
  assert.ok(tableStart >= 0, 'the dedicated history table is rendered')
  assert.ok(header, 'the rendered table retains its explicit column header row')
  assert.equal((header[1].match(/<th\b/g) || []).length, 21, 'all 21 Service Excel columns remain present')
  assert.ok(source.includes('<table className="x-table service-excel-table">'), 'the layout is scoped to the intended Service history table')
})
