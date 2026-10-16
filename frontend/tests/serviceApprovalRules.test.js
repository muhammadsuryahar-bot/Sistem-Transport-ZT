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

test('requires one approval when estimate is above Rp5 million and actual does not exceed it', () => {
  assert.equal(getRequiredServiceApprovalCount({ estimate: 5_000_001, actual: 5_000_001 }), 1)
  assert.equal(getRequiredServiceApprovalCount({ estimate: 6_000_000, actual: 4_000_000 }), 1)
})

test('mirrors the database count for estimates above Rp5 million when actual exceeds estimate', () => {
  assert.equal(getRequiredServiceApprovalCount({ estimate: 6_000_000, actual: 6_500_000 }), 2)
})

test('mirrors the database count for estimates at or below Rp5 million when actual increases', () => {
  assert.equal(getRequiredServiceApprovalCount({ estimate: 4_000_000, actual: 4_500_000 }), 1)
  assert.equal(getRequiredServiceApprovalCount({ estimate: 4_000_000, actual: 6_000_000 }), 1)
})

test('first approver role is based on estimate even when actual later crosses Rp5 million', () => {
  assert.equal(getRequiredServiceApprovalRole({
    status: 'MENUNGGU_APPROVAL',
    estimate: 4_000_000,
    actual: 6_000_000,
    approvedCount: 0,
  }), 'ATASAN_TRANSPORT')
})

test('additional approver role is based on actual once estimate has an approval', () => {
  assert.equal(getRequiredServiceApprovalRole({
    status: 'MENUNGGU_APPROVAL',
    estimate: 4_000_000,
    actual: 6_000_000,
    approvedCount: 1,
  }), 'DIREKTUR')
  assert.equal(getRequiredServiceApprovalRole({
    status: 'MENUNGGU_APPROVAL',
    estimate: 4_000_000,
    actual: 4_500_000,
    approvedCount: 1,
  }), 'ATASAN_TRANSPORT')
})

test('an estimate above Rp5 million requires Director for its first approval', () => {
  assert.equal(getRequiredServiceApprovalRole({
    status: 'MENUNGGU_APPROVAL',
    estimate: 6_000_000,
    actual: 4_000_000,
    approvedCount: 0,
  }), 'DIREKTUR')
})

test('defaults missing actual cost to estimate', () => {
  assert.equal(getRequiredServiceApprovalRole({
    status: 'MENUNGGU_APPROVAL',
    estimate: 6_000_000,
    actual: null,
    approvedCount: 0,
  }), 'DIREKTUR')
  assert.equal(getRequiredServiceApprovalCount({ estimate: 6_000_000, actual: null }), 1)
})

test('does not request another approval when actual does not exceed an already-approved estimate', () => {
  assert.equal(getRequiredServiceApprovalRole({
    status: 'MENUNGGU_APPROVAL',
    estimate: 4_000_000,
    actual: 4_000_000,
    approvedCount: 1,
  }), null)
})

test('does not expose an approval action when service is not waiting for approval', () => {
  assert.equal(getRequiredServiceApprovalRole({
    status: 'DALAM_PENGERJAAN',
    estimate: 6_000_000,
    actual: 6_000_000,
    approvedCount: 0,
  }), null)
})
