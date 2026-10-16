function numericOrZero(value) {
  if (value === null || value === undefined || value === '') return 0
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : 0
}

// Never replace the master odometer with a missing/zero reading or a value
// lower than either the current master value or recorded kilometer history.
export function shouldUpdateVehicleKilometer(serviceKm, currentVehicleKm, latestHistoryKm) {
  if (serviceKm === null || serviceKm === undefined || serviceKm === '') return false

  const candidate = Number(serviceKm)
  if (!Number.isFinite(candidate) || candidate <= 0) return false

  const currentMaster = numericOrZero(currentVehicleKm)
  const latestHistory = numericOrZero(latestHistoryKm)
  return candidate >= currentMaster && candidate >= latestHistory
}
