import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migration = await readFile(
  new URL('../../supabase/migrations/20261019060000_lock_down_audit_trigger_function.sql', import.meta.url),
  'utf8',
)

test('revokes direct execution from API login roles and PUBLIC', () => {
  assert.ok(migration.includes('REVOKE ALL ON FUNCTION private.write_transport_audit() FROM PUBLIC, anon, authenticated;'))
  assert.ok(migration.includes("has_function_privilege('anon'"))
  assert.ok(migration.includes("has_function_privilege('authenticated'"))
  assert.ok(migration.includes('aclexplode(coalesce(f.proacl, acldefault'))
  assert.ok(migration.includes('privilege.grantee = 0'))
})

test('fails closed if audit triggers are unexpectedly detached', () => {
  assert.ok(migration.includes("tgfoid = 'private.write_transport_audit()'::regprocedure"))
  assert.ok(migration.includes('AND NOT tgisinternal'))
  assert.ok(migration.includes("IF trigger_count = 0 THEN"))
  assert.ok(migration.includes("RAISE EXCEPTION 'No audit triggers reference"))
})
