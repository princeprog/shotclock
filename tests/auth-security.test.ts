import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isSafeRedirect, isTrustedMutation, trustedClientHeaders } from '../lib/auth-security.ts'

test('only permits same-origin mutation requests carrying the CSRF header', () => {
  assert.equal(isTrustedMutation('https://shotclock.example', 'Shotclock', 'https://shotclock.example'), true)
  assert.equal(isTrustedMutation('https://evil.example', 'Shotclock', 'https://shotclock.example'), false)
  assert.equal(isTrustedMutation('https://shotclock.example', null, 'https://shotclock.example'), false)
  assert.equal(isTrustedMutation(null, 'Shotclock', 'https://shotclock.example'), false)
})

test('client IP attestation is opt-in and requires a valid configured ingress header', () => {
  const headers = new Headers({ 'x-forwarded-for': '203.0.113.4', 'x-real-ip': '203.0.113.5' })
  assert.deepEqual(trustedClientHeaders(headers, undefined, undefined), {})
  assert.throws(() => trustedClientHeaders(headers, 'short', 'x-real-ip'))
  const secret = 'a-secret-of-at-least-thirty-two-bytes'
  assert.deepEqual(trustedClientHeaders(headers, secret, 'x-real-ip'), { 'x-auth-client-ip': '203.0.113.5', 'x-auth-gateway-secret': secret })
  assert.deepEqual(trustedClientHeaders(new Headers({ 'x-real-ip': 'bad,header' }), secret, 'x-real-ip'), {})
})

test('redirect targets remain local paths', () => {
  assert.equal(isSafeRedirect('/dashboard?tab=1'), true)
  for (const input of ['https://evil.example', '//evil.example', '/\\evil.example', '/login\n']) {
    assert.equal(isSafeRedirect(input), false)
  }
})
