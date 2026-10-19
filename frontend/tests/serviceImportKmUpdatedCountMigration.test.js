import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migration = await readFile(
  new URL('../../supabase/migrations/20261019050000_report_imported_service_km_updates.sql', import.meta.url),
  'utf8',
)

test('captures original odometer readings before Service completion triggers run', () => {
  assert.match(migration, /vehicle_km_before jsonb := '\\{\\}'::jsonb/)
  assert.match(migration, /Capture and lock each master odometer before any Service completion trigger/)
  assert.match(migration, /order by \\(value->>'kendaraan_id'\\)::bigint[\\s\\S]*?vehicle_km_before := vehicle_km_before \\(\\|\\|\\) jsonb_build_object/)
})

test('reports a master odometer change only when imported max is above its original value', () => {
  assert.match(migration, /if imported_max_km > current_km then[\\s\\S]*?current_km := imported_max_km/)
  assert.match(migration, /imported_max_km > coalesce\\(\\(vehicle_km_before ->> vehicle_id::text\\)::numeric, 0\\)[\\s\\S]*?current_km >= imported_max_km[\\s\\S]*?km_updated_count := km_updated_count \\+ 1/)
  assert.doesNotMatch(migration, /km_updated_count := km_updated_count \\+ 1;[\\s\\S]*?end if;[\\s\\S]*?km_updated_count := km_updated_count \\+ 1;/)
})

test('retains the history fix and never lowers the master odometer', () => {
  assert.match(migration, /and coalesce\\(\\(value->>'kilometer'\\)::numeric, 0\\) > 0/)
  assert.match(migration, /ON CONFLICT \\(kendaraan_id, tanggal, kilometer\\)[\\s\\S]*?DO NOTHING/)
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS uq_riwayat_kilometer_import_service_reading/)
})
