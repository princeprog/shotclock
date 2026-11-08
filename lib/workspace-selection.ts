type StorageLike = Pick<Storage, 'getItem' | 'setItem'>
export type WorkspaceSelection = { leagueId: string; seasons: Record<string, string> }
const prefix = 'shotclock:workspace:'
const eventName = 'shotclock:workspace-change'

function storage(): StorageLike | undefined {
  try { return typeof window === 'undefined' ? undefined : window.localStorage } catch { return undefined }
}

export function readWorkspaceSelection(organizationId: string, source = storage()): string {
  try { return organizationId ? source?.getItem(prefix + organizationId) ?? '' : '' } catch { return '' }
}

export function parseWorkspaceSelection(raw: string): WorkspaceSelection {
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid selection')
    const record = value as Record<string, unknown>
    const seasons = record.seasons && typeof record.seasons === 'object' && !Array.isArray(record.seasons)
      ? Object.fromEntries(Object.entries(record.seasons).filter((entry): entry is [string, string] => typeof entry[1] === 'string')) : {}
    return { leagueId: typeof record.leagueId === 'string' ? record.leagueId : '', seasons }
  } catch { return { leagueId: '', seasons: {} } }
}

export function saveWorkspaceSelection(organizationId: string, selection: WorkspaceSelection, source = storage()): void {
  if (!organizationId) return
  try { source?.setItem(prefix + organizationId, JSON.stringify(selection)) } catch { /* The in-memory selection still works. */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(eventName))
}

export function subscribeWorkspaceSelection(callback: () => void): () => void {
  window.addEventListener(eventName, callback)
  window.addEventListener('storage', callback)
  return () => { window.removeEventListener(eventName, callback); window.removeEventListener('storage', callback) }
}

export function resolveWorkspaceLeague<T extends { id: string }>(items: T[], preferred: string): T | undefined {
  return items.find((item) => item.id === preferred) ?? (items.length === 1 ? items[0] : undefined)
}

export function resolveWorkspaceSeason<T extends { id: string; status: string }>(items: T[], preferred: string): T | undefined {
  const active = items.filter((item) => item.status === 'active')
  return items.find((item) => item.id === preferred) ?? (items.length === 1 ? items[0] : active.length === 1 ? active[0] : undefined)
}
