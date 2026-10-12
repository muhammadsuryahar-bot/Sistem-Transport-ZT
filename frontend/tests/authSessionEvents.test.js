import assert from 'node:assert/strict'
import { test } from 'node:test'
import { shouldPreserveProfileOnAuthEvent } from '../src/utils/authSessionEvents.js'

test('preserves the rendered profile for a token refresh of the same user', () => {
  assert.equal(shouldPreserveProfileOnAuthEvent('TOKEN_REFRESHED', 'user-1', 'user-1'), true)
})

test('does not preserve the profile if the refreshed session belongs to another user', () => {
  assert.equal(shouldPreserveProfileOnAuthEvent('TOKEN_REFRESHED', 'user-2', 'user-1'), false)
})

test('does not skip profile handling for sign-in or sign-out events', () => {
  assert.equal(shouldPreserveProfileOnAuthEvent('SIGNED_IN', 'user-1', 'user-1'), false)
  assert.equal(shouldPreserveProfileOnAuthEvent('SIGNED_OUT', null, 'user-1'), false)
})
