import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('service evidence storage read roles match service evidence metadata roles', async () => {
  const migration = await readFile(
    new URL('../../supabase/migrations/20261020101221_align_service_evidence_storage_read_roles.sql', import.meta.url),
    'utf8',
  )
  assert.match(migration, /DROP POLICY IF EXISTS storage_service_bukti_select ON storage\.objects/i)
  assert.match(migration, /CREATE POLICY storage_service_bukti_select[\s\S]*?FOR SELECT[\s\S]*?TO authenticated/i)

  for (const role of ['ADMIN', 'TRANSPORT', 'ATASAN_TRANSPORT', 'DIREKTUR', 'AKUNTANSI']) {
    assert.match(migration, new RegExp(`'${role}'::user_role`))
  }

  assert.match(migration, /bucket_id = 'service-bukti'/)
  assert.match(migration, /private\.has_any_role/)
  assert.doesNotMatch(migration, /FOR (?:INSERT|UPDATE|DELETE)/i)
})
