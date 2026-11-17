export type GamesView = 'list' | 'week' | 'month'
type ViewStorage = Pick<Storage, 'getItem' | 'setItem'>

const key = 'shotclock:games-view'
const eventName = 'shotclock:games-view-change'
const views: GamesView[] = ['list', 'week', 'month']
let memoryView: GamesView = 'list'
let storageUnavailable = false

function browserStorage(): ViewStorage | undefined {
  if (storageUnavailable || typeof window === 'undefined') return undefined
  try { return window.localStorage } catch { storageUnavailable = true; return undefined }
}

// The games page remembers whether the organizer last used the list, week or month view.
export function readGamesView(storage = browserStorage()): GamesView {
  if (!storage) return memoryView
  try {
    const stored = storage.getItem(key)
    memoryView = views.includes(stored as GamesView) ? stored as GamesView : 'list'
    return memoryView
  } catch {
    storageUnavailable = true
    return memoryView
  }
}

export function saveGamesView(view: GamesView, storage = browserStorage()): void {
  memoryView = view
  try { storage?.setItem(key, view) } catch { storageUnavailable = true }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(eventName))
}

export function subscribeGamesView(callback: () => void): () => void {
  window.addEventListener(eventName, callback)
  window.addEventListener('storage', callback)
  return () => { window.removeEventListener(eventName, callback); window.removeEventListener('storage', callback) }
}
