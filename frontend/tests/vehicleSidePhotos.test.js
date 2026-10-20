import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('vehicle form supports optional four-side photos and STNK for Admin', async () => {
  const source = await readFile(new URL('../src/modules/MasterKendaraanExcelAlignedPage.jsx', import.meta.url), 'utf8')
  assert.match(source, /const canPhoto = profile\?\.role === 'ADMIN'/)
  for (const field of ['foto_depan_path', 'foto_belakang_path', 'foto_kiri_path', 'foto_kanan_path', 'foto_stnk_path']) {
    assert.ok(source.includes(field), `Expected photo field ${field}`)
  }
  assert.match(source, /PHOTO_ITEMS\.map\(photo => <label className="mep-photo"/)
  assert.match(source, /uploadVehiclePhoto/)
  assert.match(source, /createSignedUrl\(path, 3600\)/)
  assert.match(source, /photoPathsCommitted/)
})
