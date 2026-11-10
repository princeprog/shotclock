const workspaceChangeEvent = 'shotclock:before-workspace-change'
const discardMessage = 'Leave this page? Your unsaved schedule preview will be discarded.'

export function confirmDiscardSchedulePreview() {
  return window.confirm(discardMessage)
}

export function allowWorkspaceChange() {
  return window.dispatchEvent(new Event(workspaceChangeEvent, { cancelable: true }))
}

export function installScheduleNavigationGuard(isDirty: () => boolean) {
  const currentUrl = window.location.href
  const currentState = window.history.state
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (!isDirty()) return
    event.preventDefault()
    event.returnValue = ''
  }
  const beforeWorkspaceChange = (event: Event) => {
    if (isDirty() && !confirmDiscardSchedulePreview()) event.preventDefault()
  }
  const beforeLink = (event: MouseEvent) => {
    if (!isDirty() || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const target = event.target as Element | null
    const anchor = typeof target?.closest === 'function' ? target.closest('a[href]') as HTMLAnchorElement | null : null
    if (!anchor || (anchor.target && anchor.target !== '_self') || anchor.hasAttribute('download')) return
    const next = new URL(anchor.href, currentUrl)
    const current = new URL(currentUrl)
    if (next.origin === current.origin && next.pathname === current.pathname && next.search === current.search) return
    if (!confirmDiscardSchedulePreview()) { event.preventDefault(); event.stopImmediatePropagation() }
  }
  const beforeHistory = (event: PopStateEvent) => {
    if (!isDirty() || confirmDiscardSchedulePreview()) return
    event.stopImmediatePropagation()
    window.history.pushState(currentState, '', currentUrl)
  }
  window.addEventListener('beforeunload', beforeUnload)
  window.addEventListener(workspaceChangeEvent, beforeWorkspaceChange)
  window.addEventListener('popstate', beforeHistory, true)
  document.addEventListener('click', beforeLink, true)
  return () => {
    window.removeEventListener('beforeunload', beforeUnload)
    window.removeEventListener(workspaceChangeEvent, beforeWorkspaceChange)
    window.removeEventListener('popstate', beforeHistory, true)
    document.removeEventListener('click', beforeLink, true)
  }
}
