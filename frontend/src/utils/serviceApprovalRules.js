export const SERVICE_APPROVAL_LIMIT = 5_000_000

function amountOr(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : fallback
}

// Mirrors guard_service_approval(): the first approval is authorized against
// the estimate; an additional approval (only allowed when actual exceeds the
// estimate) is authorized against the actual amount.
export function getRequiredServiceApprovalRole({
  status,
  estimate,
  actual,
  approvedCount = 0,
} = {}) {
  if (status !== 'MENUNGGU_APPROVAL') return null

  const estimatedAmount = amountOr(estimate, 0)
  const actualAmount = amountOr(actual, estimatedAmount)
  const count = Number(approvedCount) || 0

  if (count >= 1 && actualAmount <= estimatedAmount) return null

  const approvalAmount = count <= 0 ? estimatedAmount : actualAmount
  return approvalAmount > SERVICE_APPROVAL_LIMIT ? 'DIREKTUR' : 'ATASAN_TRANSPORT'
}

// Mirrors guard_service_completion() exactly. A high estimate requires one
// approval unless actual exceeds the estimate (then two). For lower estimates,
// a changed/over-limit actual requires one; a separate Director check applies
// whenever actual itself exceeds Rp5 million.
export function getRequiredServiceApprovalCount({ estimate, actual } = {}) {
  const estimatedAmount = amountOr(estimate, 0)
  const actualAmount = amountOr(actual, estimatedAmount)

  if (estimatedAmount > SERVICE_APPROVAL_LIMIT) {
    return actualAmount > estimatedAmount ? 2 : 1
  }

  if (actualAmount > estimatedAmount || actualAmount > SERVICE_APPROVAL_LIMIT) {
    return 1
  }

  return 0
}
