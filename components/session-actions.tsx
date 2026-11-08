'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { checkSession } from '@/lib/client-session'
import { publishSessionChange } from '@/lib/league-cache'
import { useAppDispatch } from '@/lib/store-hooks'
import { resetUi } from '@/lib/ui-slice'
import { clearOrganizationSelection } from '@/lib/organization-selection'

const requestHeaders = { 'Content-Type': 'application/json', 'X-Requested-With': 'Shotclock' }

export function RestoreSession() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    async function restore() {
      if (!navigator.locks) { router.replace('/login'); return }
      try {
        await navigator.locks.request('shotclock-refresh', async () => {
          if (!active) return
          const status = await checkSession(queryClient)
          if (status === 200) { router.refresh(); return }
          if (status !== 401) { setError('The service is unavailable. Please try again.'); return }
          const response = await fetch('/api/auth/refresh', { method: 'POST', headers: requestHeaders, body: '{}' })
          if (response.ok) router.refresh()
          else if (response.status === 401) router.replace('/login')
          else setError('The service is unavailable. Please try again.')
        })
      } catch { if (active) setError('The service is unavailable. Please try again.') }
    }
    void restore()
    return () => { active = false }
  }, [queryClient, router])
  return <main className="flex min-h-svh items-center justify-center p-6"><div role="status" className="flex flex-col items-center gap-4 text-center"><p>{error || 'Restoring your session…'}</p>{error && <Button onClick={() => window.location.reload()}>Try again</Button>}</div></main>
}

export function SignOut() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const dispatch = useAppDispatch()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  async function signOut() {
    setPending(true)
    setError('')
    try {
      const run = () => fetch('/api/auth/logout', { method: 'POST', headers: requestHeaders, body: '{}' })
      const response = navigator.locks ? await navigator.locks.request('shotclock-refresh', run) : await run()
      if (!response.ok) { setError('Could not sign out. Please try again.'); return }
      queryClient.clear()
      publishSessionChange()
      dispatch(resetUi())
      clearOrganizationSelection()
      router.replace('/login')
      router.refresh()
    } catch { setError('Could not sign out. Please try again.') }
    finally { setPending(false) }
  }
  return <div className="flex items-center gap-3">{error && <span role="alert" className="text-sm text-destructive">{error}</span>}<Button variant="outline" onClick={signOut} disabled={pending}>{pending ? 'Signing out…' : 'Sign out'}</Button></div>
}
