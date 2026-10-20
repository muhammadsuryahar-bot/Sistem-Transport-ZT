import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('unneeded Genset feature is not exposed by the app shell or page tools', async () => {
  const [appSource, toolsSource] = await Promise.all([
    readFile(new URL('../src/AppTransport.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/DataPageTools.jsx', import.meta.url), 'utf8'),
  ])

  assert.doesNotMatch(appSource, /genset|GensetPage|DATA GENSET/i)
  assert.doesNotMatch(toolsSource, /genset|Data Genset/i)
})
