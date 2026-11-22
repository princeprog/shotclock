type InvitationStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const key = 'shotclock:pending-invitation'
const maxAgeMs = 7 * 24 * 60 * 60 * 1000

function browserStorage(): InvitationStorage | undefined {
  if (typeof window === 'undefined') return undefined
  try { return window.localStorage } catch { return undefined }
}

// An invitation link can be opened before the invitee has an account. The token is kept in local storage so it survives
// sign-up, email verification in another tab, and sign-in, then the accept page picks it up again.
export function savePendingInvitation(token: string, now = Date.now(), storage = browserStorage()) {
  try { storage?.setItem(key, JSON.stringify({ token, savedAt: now })) } catch { /* The link still works in this tab. */ }
}

export function readPendingInvitation(now = Date.now(), storage = browserStorage()): string | null {
  try {
    const value: unknown = JSON.parse(storage?.getItem(key) ?? 'null')
    const saved = value && typeof value === 'object' ? value as { token?: unknown; savedAt?: unknown } : {}
    if (typeof saved.token === 'string' && typeof saved.savedAt === 'number' && now - saved.savedAt < maxAgeMs) return saved.token
    storage?.removeItem(key)
  } catch { /* Unreadable storage means there is no pending invitation. */ }
  return null
}

export function clearPendingInvitation(storage = browserStorage()) {
  try { storage?.removeItem(key) } catch { /* Nothing to clear. */ }
}

// Where to go after signing in: back to a pending invitation, otherwise to organization selection.
export function pathAfterSignIn(storage = browserStorage()) {
  return readPendingInvitation(Date.now(), storage) ? '/invitations/accept' : '/organizations'
}

