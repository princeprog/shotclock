export type TeamView = 'table' | 'cards'
type ViewStorage = Pick<Storage, 'getItem' | 'setItem'>

const key = 'shotclock:teams-view'
const eventName = 'shotclock:teams-view-change'
let memoryView: TeamView = 'table'
let storageUnavailable = false

function browserStorage(): ViewStorage | undefined {
  if (storageUnavailable || typeof window === 'undefined') return undefined
  try { return window.localStorage } catch { storageUnavailable = true; return undefined }
}

export function readTeamView(storage = browserStorage()): TeamView {
  if (!storage) return memoryView
  try {
    memoryView = storage.getItem(key) === 'cards' ? 'cards' : 'table'
    return memoryView
  } catch {
    storageUnavailable = true
    return memoryView
  }
}

export function saveTeamView(view: TeamView, storage = browserStorage()): void {
  memoryView = view
  try { storage?.setItem(key, view) } catch { storageUnavailable = true }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(eventName))
}

export function subscribeTeamView(callback: () => void): () => void {
  window.addEventListener(eventName, callback)
  window.addEventListener('storage', callback)
  return () => { window.removeEventListener(eventName, callback); window.removeEventListener('storage', callback) }
}

export function selectSeasonTeamRegistrations<T extends { season_id: string | null; division_id: string | null }>(rows: T[], seasonId: string, divisionId = ''): T[] {
  return seasonId ? rows.filter((row) => row.season_id === seasonId && (!divisionId || row.division_id === divisionId)) : []
}

export function availableTeamDivisions<T extends { id: string }>(divisions: T[], registrations: { id: string; season_id: string | null; division_id: string | null }[], teamId: string, seasonId: string): T[] {
  return divisions.filter((division) => !registrations.some((row) => row.id === teamId && row.season_id === seasonId && row.division_id === division.id))
}
