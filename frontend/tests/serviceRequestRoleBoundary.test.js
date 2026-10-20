import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('service request initiation and edit actions stay with Operational (and Admin support)', async () => {
  const source = await readFile(new URL('../src/modules/PermintaanServicePageFixed.jsx', import.meta.url), 'utf8')
  assert.match(source, /const canCreate = \['ADMIN', 'OPERASIONAL'\]\.includes\(profile\?\.role\)/)
  assert.match(source, /const canEditRequest = \['ADMIN', 'OPERASIONAL'\]\.includes\(profile\?\.role\)/)
  assert.doesNotMatch(source, /const canCreate = \['ADMIN', 'OPERASIONAL', 'TRANSPORT'\]/)
  assert.doesNotMatch(source, /const canEditRequest = \['ADMIN', 'OPERASIONAL', 'TRANSPORT'\]/)
})

test('database migration restricts request creation and preserves Transport processing workflow', async () => {
  const migration = await readFile(new URL('../../supabase/migrations/20261020152000_restrict_service_request_initiation.sql', import.meta.url), 'utf8')
  assert.match(migration, /CREATE POLICY permintaan_service_insert_import/i)
  assert.match(migration, /ARRAY\['ADMIN'::user_role,\s*'OPERASIONAL'::user_role\]/)
  assert.doesNotMatch(migration, /ARRAY\[[^\]]*'TRANSPORT'::user_role/)
  assert.match(migration, /guard_transport_request_fields/)
  assert.match(migration, /NEW\.status\s+IS DISTINCT FROM OLD\.status/i, 'workflow status remains a Transport-editable field')
  assert.match(migration, /NEW\.catatan_transport\s+IS DISTINCT FROM OLD\.catatan_transport/i, 'Transport notes remain editable')
  assert.match(migration, /NEW\.id\s+IS DISTINCT FROM OLD\.id/i)
  assert.match(migration, /NEW\.diproses_oleh\s+IS DISTINCT FROM auth\.uid\(\)/i)
})
