import { test } from 'node:test'
import assert from 'node:assert/strict'
import { IDLE_LIMIT_MS, isWorkspaceStale } from '../lib/session-freshness.ts'

const now = 1_800_000_000_000

test('a reload while active keeps the current workspace', () => {
  assert.equal(isWorkspaceStale({ now, lastActivity: now - 60_000, firstCheck: true, navigationType: 'reload' }), false)
  assert.equal(isWorkspaceStale({ now, lastActivity: now - 60_000, firstCheck: false }), false)
})

test('a fresh visit, such as a new or reopened tab, asks for an organization', () => {
  assert.equal(isWorkspaceStale({ now, lastActivity: now - 60_000, firstCheck: true, navigationType: 'navigate' }), true)
  assert.equal(isWorkspaceStale({ now, lastActivity: now - 60_000, firstCheck: true, navigationType: 'back_forward' }), true)
  assert.equal(isWorkspaceStale({ now, lastActivity: 0, firstCheck: false }), true)
})

test('returning after the idle limit asks for an organization, even after a reload', () => {
  assert.equal(isWorkspaceStale({ now, lastActivity: now - IDLE_LIMIT_MS - 1, firstCheck: false }), true)
  assert.equal(isWorkspaceStale({ now, lastActivity: now - IDLE_LIMIT_MS - 1, firstCheck: true, navigationType: 'reload' }), true)
  assert.equal(isWorkspaceStale({ now, lastActivity: now - IDLE_LIMIT_MS, firstCheck: false }), false)
})
