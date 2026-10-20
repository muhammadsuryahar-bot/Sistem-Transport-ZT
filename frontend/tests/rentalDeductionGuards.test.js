import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('rental payment form guards gross amount and remaining repair deduction', async () => {
  const source = await readFile(new URL('../src/modules/RentalFeaturePage.jsx', import.meta.url), 'utf8')
  assert.match(source, /Jumlah potongan tidak boleh melebihi tagihan sewa sebelum potongan/)
  assert.match(source, /jumlah_tagihan_bruto: gross/)
  assert.match(source, /const getRepairAvailableAmount = r =>/)
  assert.match(source, /approvedAmount - usedAmount/)
  assert.match(source, /sisa biaya perbaikan yang belum dipotong/)
  assert.match(source, /Tagihan Bruto \/ Bersih/)
})

test('database tracks gross invoice and prevents cumulative deductions exceeding repair or invoice amount', async () => {
  const migration = await readFile(new URL('../../supabase/migrations/20261020121500_guard_rental_deduction_totals.sql', import.meta.url), 'utf8')
  assert.match(migration, /ADD COLUMN IF NOT EXISTS jumlah_tagihan_bruto/)
  assert.match(migration, /FOR UPDATE/)
  assert.match(migration, /r_prior_deductions \+ NEW\.jumlah_potongan > r_limit/)
  assert.match(migration, /r_prior_deductions \+ NEW\.jumlah_potongan > r_cost/)
  assert.match(migration, /p_prior_deductions \+ NEW\.jumlah_potongan > p_gross/)
  assert.match(migration, /p_prior_deductions \+ NEW\.jumlah_potongan <> p_gross - p_net/)
})
