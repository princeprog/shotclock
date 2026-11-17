'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { clearOrganizationSelection } from '@/lib/organization-selection'
import { beginLeavingWorkspace, claimFirstCheck, clearLastActivity, isWorkspaceStale, markActive, readLastActivity } from '@/lib/session-freshness'
import { useAppDispatch } from '@/lib/store-hooks'
import { resetUi } from '@/lib/ui-slice'

const activityEvents = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'] as const

// Sends the user back to organization selection after a fresh visit or an idle period, instead of resuming a manage page.
export function SessionFreshnessGuard() {
  const router = useRouter()
  const dispatch = useAppDispatch()
  useEffect(() => {
    let left = false
    const leave = () => {
      if (left) return
      left = true
      beginLeavingWorkspace()
      clearOrganizationSelection()
      clearLastActivity()
      dispatch(resetUi())
      router.replace('/organizations')
    }
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    if (isWorkspaceStale({ now: Date.now(), lastActivity: readLastActivity(), firstCheck: claimFirstCheck(), navigationType: navigation?.type })) { leave(); return }
    markActive()
    let stamped = Date.now()
    const onActivity = () => {
      const now = Date.now()
      if (isWorkspaceStale({ now, lastActivity: readLastActivity(), firstCheck: false })) { leave(); return }
      if (now - stamped > 10_000) { stamped = now; markActive(now) }
    }
    const onVisible = () => { if (document.visibilityState === 'visible') onActivity() }
    for (const name of activityEvents) window.addEventListener(name, onActivity, { passive: true })
    window.addEventListener('focus', onActivity)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      for (const name of activityEvents) window.removeEventListener(name, onActivity)
      window.removeEventListener('focus', onActivity)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [dispatch, router])
  return null
}
