type ActivityStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

// After this long without activity, or on a fresh visit, the organization must be chosen again.
// It matches the access token's lifetime, so a restored session always starts at organization selection.
export const IDLE_LIMIT_MS = 15 * 60 * 1000
const key = 'shotclock:last-activity'
let checkedThisPage = false
let leavingWorkspace = false

function browserStorage(): ActivityStorage | undefined {
  try { return typeof window === 'undefined' ? undefined : window.sessionStorage } catch { return undefined }
}

export function readLastActivity(storage = browserStorage()): number {
  try { return Number(storage?.getItem(key)) || 0 } catch { return 0 }
}

export function markActive(now = Date.now(), storage = browserStorage()): void {
  try { storage?.setItem(key, String(now)) } catch { /* Without storage, every fresh visit asks for an organization. */ }
}

export function clearLastActivity(storage = browserStorage()): void {
  try { storage?.removeItem(key) } catch { /* Storage may be unavailable. */ }
}

// A workspace is stale when the tab has been idle too long, or when this page load is a fresh visit
// (new or reopened tab, typed address) rather than a reload of the page the user was already using.
export function isWorkspaceStale({ now, lastActivity, firstCheck, navigationType }: { now: number; lastActivity: number; firstCheck: boolean; navigationType?: string }): boolean {
  if (!lastActivity || now - lastActivity > IDLE_LIMIT_MS) return true
  return firstCheck && navigationType !== 'reload'
}

// The first workspace page in a document load decides whether this is a fresh visit; later client navigations do not.
export function claimFirstCheck(): boolean {
  if (checkedThisPage) return false
  checkedThisPage = true
  return true
}

// Choosing an organization starts a fresh workspace for this page load.
export function markWorkspaceFresh(now = Date.now(), storage = browserStorage()): void {
  checkedThisPage = true
  leavingWorkspace = false
  markActive(now, storage)
}

// While a stale workspace is being sent to organization selection, other redirects stand aside.
export function beginLeavingWorkspace(): void { leavingWorkspace = true }
export function isLeavingWorkspace(): boolean { return leavingWorkspace }
