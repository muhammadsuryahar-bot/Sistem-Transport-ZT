import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getRequiredServiceApprovalCount,
  getRequiredServiceApprovalRole,
  SERVICE_APPROVAL_LIMIT,
} from '../src/utils/serviceApprovalRules.js'

test('does not require approval at or below Rp5 million when actual does not exceed estimate', () => {
  assert.equal(getRequiredServiceApprovalCount({ estimate: 4_000_000, actual: 4_000_000 }), 0)
  assert.equal(getRequiredServiceApprovalCount({ estimate: SERVICE_APPROVAL_LIMIT, actual: SERVICE_APPROVAL_LIMIT }), 0)
})

test('requires one approval when an estimate above Rp5 million is not exceeded', () => {
  assert.equal(getRequiredServiceApprovalCount({ estimate: 5_000_001, actual: 5_000_001 }), 1)
  assert.equal(getRequiredServiceApprovalCount({ estimate: 6_000_000, actual: 4_000_000 }), 1)
})

test('requires two approvals whenever actual cost exceeds the estimate', () => {
  assert.equal(getRequiredServiceApprovalCount({ estimate: 4_000_000, actual: 4_500_000 }), 2)
  assert.equal(getRequiredServiceApprovalCount({ estimate: 4_000_000, actual: 6_000_000 }), 2)
  assert.equal(getRequiredServiceApprovalCount({ estimate: 6_000_000, actual: 6_500_000 }), 2)
})

test('uses actual cost for the initial approver role when actual crosses Rp5 million', () => {
  assert.equal(getRequiredServiceApprovalRole({
    status: 'MENUNGGU_APPROVAL',
    estimate: 4_000_000,
    actual: 6_000_000,
    approvedCount: 0,
  }), 'DIREKTUR')
})

test('uses actual cost for the initial approver role when actual is below estimate and below Rp5 million', () => {
  assert.equal(getRequiredServiceApprovalRole({
    status: 'MENUNGGU_APPROVAL',
    estimate: 6_000_000,
    actual: 4_000_000,
    approvedCount: 0,
  }), 'ATASAN_TRANSPORT')
})

test('defaults a missing actual cost to the estimate for approval role/count', () => {
  assert.equal(getRequiredServiceApprovalRole({
    status: 'MENUNGGU_APPROVAL',
    estimate: 6_000_000,
    actual: null,
    approvedCount: 0,
  }), 'DIREKTUR')
  assert.equal(getRequiredServiceApprovalCount({ estimate: 6_000_000, actual: null }), 1)
})

test('does not request another approval when the actual does not exceed an already-approved estimate', () => {
  assert.equal(getRequiredServiceApprovalRole({
    status: 'MENUNGGU_APPROVAL',
    estimate: 4_000_000,
    actual: 4_000_000,
    approvedCount: 1,
  }), null)
})

test('continues to require the current threshold role for an additional approval when actual exceeds estimate', () => {
  assert.equal(getRequiredServiceApprovalRole({
    status: 'MENUNGGU_APPROVAL',
    estimate: 4_000_000,
    actual: 4_500_000,
    approvedCount: 1,
  }), 'ATASAN_TRANSPORT')
  assert.equal(getRequiredServiceApprovalRole({
    status: 'MENUNGGU_APPROVAL',
    estimate: 4_000_000,
    actual: 6_000_000,
    approvedCount: 1,
  }), 'DIREKTUR')
})

test('does not expose an approval action when service is not waiting for approval', () => {
  assert.equal(getRequiredServiceApprovalRole({
    status: 'DALAM_PENGERJAAN',
    estimate: 6_000_000,
    actual: 6_000_000,
    approvedCount: 0,
  }), null)
})
