import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldUpdateVehicleKilometer } from '../src/utils/vehicleKilometerGuard.js'

test('does not write missing, zero, negative, or invalid service kilometer readings', () => {
  assert.equal(shouldUpdateVehicleKilometer(null, 12000, 0), false)
  assert.equal(shouldUpdateVehicleKilometer('', 12000, 0), false)
  assert.equal(shouldUpdateVehicleKilometer(undefined, 12000, 0), false)
  assert.equal(shouldUpdateVehicleKilometer(0, 12000, 0), false)
  assert.equal(shouldUpdateVehicleKilometer(-1, 12000, 0), false)
  assert.equal(shouldUpdateVehicleKilometer('not-a-number', 12000, 0), false)
})

test('does not regress the vehicle master kilometer', () => {
  assert.equal(shouldUpdateVehicleKilometer(9000, 12000, 0), false)
  assert.equal(shouldUpdateVehicleKilometer(11500, 12000, 11000), false)
})

test('does not overwrite a newer history reading with an older service reading', () => {
  assert.equal(shouldUpdateVehicleKilometer(11500, 11000, 12000), false)
})

test('allows a newer service kilometer that is not lower than master or history', () => {
  assert.equal(shouldUpdateVehicleKilometer(12500, 12000, 12300), true)
  assert.equal(shouldUpdateVehicleKilometer('12500', '12000', '12300'), true)
})

test('allows an equal reading without any kilometer regression', () => {
  assert.equal(shouldUpdateVehicleKilometer(12000, 12000, 11500), true)
  assert.equal(shouldUpdateVehicleKilometer(12000, 11500, 12000), true)
})
