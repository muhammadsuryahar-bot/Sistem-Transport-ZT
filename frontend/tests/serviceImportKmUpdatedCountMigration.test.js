import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migration = await readFile(
  new URL('../../supabase/migrations/20261019050000_report_imported_service_km_updates.sql', import.meta.url),
  'utf8',
)

test('captures original odometer readings before Service completion triggers run', () => {
  assert.ok(migration.includes("vehicle_km_before jsonb := '{}'::jsonb;"))
  assert.ok(migration.includes('Capture and lock each master odometer before any Service completion trigger'))
  assert.ok(migration.includes("vehicle_km_before := vehicle_km_before || jsonb_build_object(vehicle_id::text, current_km);"))
  assert.ok(migration.indexOf('vehicle_km_before := vehicle_km_before ||') < migration.indexOf('for grp in select value from jsonb_array_elements(p_payload)'))
})

test('reports a master odometer change only when imported max is above its original value', () => {
  assert.ok(migration.includes('if imported_max_km > current_km then'))
  assert.ok(migration.includes('current_km := imported_max_km;'))
  assert.ok(migration.includes('imported_max_km > coalesce((vehicle_km_before ->> vehicle_id::text)::numeric, 0)'))
  assert.ok(migration.includes('current_km >= imported_max_km'))
  assert.equal((migration.match(/km_updated_count := km_updated_count \+ 1;/g) || []).length, 1)
})

test('retains idempotent history writes and never lowers the master odometer', () => {
  assert.ok(migration.includes("and coalesce((grp->>'kilometer')::numeric, 0) > 0"))
  assert.ok(migration.includes('ON CONFLICT (kendaraan_id, tanggal, kilometer)'))
  assert.ok(migration.includes("CREATE UNIQUE INDEX IF NOT EXISTS uq_riwayat_kilometer_import_service_reading"))
})
