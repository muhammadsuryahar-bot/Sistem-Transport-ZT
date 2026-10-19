import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migration = await readFile(
  new URL('../../supabase/migrations/20261019040000_fix_imported_service_kilometer_history.sql', import.meta.url),
  'utf8',
)

test('historical mileage is not filtered out by a newer master odometer', () => {
  assert.match(migration, /where \(value->>'kendaraan_id'\)::bigint = vehicle_id[\s\S]*?and coalesce\(\(value->>'kilometer'\)::numeric, 0\) > 0/)
  assert.doesNotMatch(migration, /and coalesce\(\(value->>'kilometer'\)::numeric, 0\) > current_km/)
  assert.match(migration, /if imported_max_km > current_km then[\s\S]*?update public\.kendaraan[\s\S]*?set kilometer_terakhir = imported_max_km/)
})

test('history imports are retry-safe and retain only positive readings', () => {
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS uq_riwayat_kilometer_import_service_reading/)
  assert.match(migration, /ON CONFLICT \(kendaraan_id, tanggal, kilometer, keterangan\)[\s\S]*?DO NOTHING/)
  assert.match(migration, /sumber = 'IMPORT_SERVICE'/)
})

test('backfill copies completed imported Service records without rewriting source kilometers', () => {
  assert.match(migration, /s\.nomor_service LIKE 'IMP-SRV-%'[\s\S]*?s\.status = 'SELESAI'[\s\S]*?s\.kilometer > 0/)
  assert.match(migration, /src\.tanggal_service,[\s\S]*?src\.kilometer,[\s\S]*?'Import histori Excel: Data Service'/)
  assert.match(migration, /Backfill riwayat KM tidak lengkap/)
})
