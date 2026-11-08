type SelectionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const key = 'shotclock:selected-organization'
const eventName = 'shotclock:organization-change'

export function resolveSelectedOrganization<T extends { id: string }>(organizations: T[], selectedId: string, storedId: string): T | undefined {
  const id = selectedId || storedId
  return organizations.find((organization) => organization.id === id)
}

function browserStorage(): SelectionStorage | undefined {
  try { return typeof window === 'undefined' ? undefined : window.sessionStorage } catch { return undefined }
}

export function readOrganizationSelection(storage = browserStorage()): string {
  try { return storage?.getItem(key) ?? '' } catch { return '' }
}

export function saveOrganizationSelection(id: string, storage = browserStorage()): void {
  try { storage?.setItem(key, id) } catch { /* Selection remains available in Redux. */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(eventName))
}

export function clearOrganizationSelection(storage = browserStorage()): void {
  try { storage?.removeItem(key) } catch { /* Storage may be unavailable. */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(eventName))
}

export function subscribeOrganizationSelection(callback: () => void): () => void {
  window.addEventListener(eventName, callback)
  window.addEventListener('storage', callback)
  return () => { window.removeEventListener(eventName, callback); window.removeEventListener('storage', callback) }
}
