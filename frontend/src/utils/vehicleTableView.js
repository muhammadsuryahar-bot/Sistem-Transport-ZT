/**
 * Whether the main vehicle list has any meaningful acquisition-price value.
 * Zero is a valid value; null, undefined and whitespace-only strings are blank.
 */
export function hasVehicleAcquisitionPrice(vehicles) {
  if (!Array.isArray(vehicles)) return false
  return vehicles.some(vehicle => {
    const value = vehicle?.harga_perolehan
    return value !== null && value !== undefined && String(value).trim() !== ''
  })
}
