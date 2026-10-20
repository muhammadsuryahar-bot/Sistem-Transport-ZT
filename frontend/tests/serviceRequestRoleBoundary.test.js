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

test('database migration restricts request creation and allows only processing fields for Transport', async () => {
  const migration = await readFile(new URL('../../supabase/migrations/20261020152000_restrict_service_request_initiation.sql', import.meta.url), 'utf8')
  assert.ok(migration.includes('CREATE POLICY permintaan_service_insert_import'))
  assert.ok(migration.includes("ARRAY['ADMIN'::user_role, 'OPERASIONAL'::user_role]"))
  assert.ok(!migration.includes("ARRAY['ADMIN'::user_role, 'OPERASIONAL'::user_role, 'TRANSPORT'::user_role]"))
  assert.ok(migration.includes('guard_transport_request_fields'))
  assert.ok(migration.includes('NEW.id IS DISTINCT FROM OLD.id'))
  assert.ok(migration.includes('NEW.diproses_oleh IS DISTINCT FROM auth.uid()'))
  assert.ok(!migration.includes('NEW.status IS DISTINCT FROM OLD.status'))
  assert.ok(!migration.includes('NEW.catatan_transport IS DISTINCT FROM OLD.catatan_transport'))
})
