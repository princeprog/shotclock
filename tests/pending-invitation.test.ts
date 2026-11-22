import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clearPendingInvitation, pathAfterSignIn, readPendingInvitation, savePendingInvitation } from '../lib/pending-invitation.ts'

function memoryStorage() {
  const values = new Map<string, string>()
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
}

test('a saved invitation is returned until it is cleared', () => {
  const storage = memoryStorage()
  assert.equal(pathAfterSignIn(storage), '/organizations')
  savePendingInvitation('token-value-123', 1_000, storage)
  assert.equal(readPendingInvitation(2_000, storage), 'token-value-123')
  clearPendingInvitation(storage)
  assert.equal(readPendingInvitation(2_000, storage), null)
})

test('invitations older than seven days or unreadable values are dropped', () => {
  const storage = memoryStorage()
  savePendingInvitation('old-token-value', 0, storage)
  assert.equal(readPendingInvitation(7 * 24 * 60 * 60 * 1000, storage), null)
  assert.equal(storage.getItem('shotclock:pending-invitation'), null)
  storage.setItem('shotclock:pending-invitation', '{not json')
  assert.equal(readPendingInvitation(0, storage), null)
})

test('signing in returns to a pending invitation', () => {
  const storage = memoryStorage()
  savePendingInvitation('token-value-123', Date.now(), storage)
  assert.equal(pathAfterSignIn(storage), '/invitations/accept')
})

