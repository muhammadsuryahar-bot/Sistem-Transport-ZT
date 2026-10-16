export const SERVICE_APPROVAL_LIMIT = 5_000_000

function amountOr(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : fallback
}

// Mirrors guard_service_approval(): the role is determined by the current
// effective service amount (actual cost when present, otherwise estimate).
export function getRequiredServiceApprovalRole({
  status,
  estimate,
  actual,
  approvedCount = 0,
} = {}) {
  if (status !== 'MENUNGGU_APPROVAL') return null

  const estimatedAmount = amountOr(estimate, 0)
  const actualAmount = amountOr(actual, estimatedAmount)

  // The database guard rejects another approval if a required approval has
  // already been recorded and the actual amount does not exceed the estimate.
  if (Number(approvedCount) >= 1 && actualAmount <= estimatedAmount) return null

  return actualAmount > SERVICE_APPROVAL_LIMIT ? 'DIREKTUR' : 'ATASAN_TRANSPORT'
}

// Mirrors guard_service_completion(): an amount above its estimate requires
// two approvals; an estimate/actual above the limit requires at least one.
export function getRequiredServiceApprovalCount({ estimate, actual } = {}) {
  const estimatedAmount = amountOr(estimate, 0)
  const actualAmount = amountOr(actual, estimatedAmount)

  if (actualAmount > estimatedAmount) return 2
  if (Math.max(estimatedAmount, actualAmount) > SERVICE_APPROVAL_LIMIT) return 1
  return 0
}
