export function roundCurrency(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    throw new TypeError('Nilai mata uang harus berupa angka hingga.')
  }
  const adjustment = Math.sign(numeric) * Number.EPSILON
  return Math.round((numeric + adjustment) * 100) / 100
}
