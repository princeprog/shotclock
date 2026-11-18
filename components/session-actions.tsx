'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { RestoringSession } from '@/components/restoring-session'
import { refreshSession } from '@/lib/client-session'
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
    refreshSession(queryClient).then((result) => {
      if (!active) return
      if (result === 'restored') router.refresh()
      else if (result === 'signed-out') router.replace('/login')
      else setError('The service is unavailable. Please try again.')
    }, () => { if (active) setError('The service is unavailable. Please try again.') })
    return () => { active = false }
  }, [queryClient, router])
  return <main className="flex min-h-svh items-center justify-center p-6">{error ? <div role="alert" className="flex flex-col items-center gap-4 text-center"><p>{error}</p><Button onClick={() => window.location.reload()}>Try again</Button></div> : <RestoringSession />}</main>
}

// On the login page: a session that can still be restored continues to organization selection; otherwise the form shows.
export function ResumeSession({ children }: { children: ReactNode }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [signIn, setSignIn] = useState(false)
  useEffect(() => {
    let active = true
    refreshSession(queryClient).then((result) => {
      if (!active) return
      if (result === 'restored') { router.replace('/organizations'); router.refresh() } else setSignIn(true)
    }, () => { if (active) setSignIn(true) })
    return () => { active = false }
  }, [queryClient, router])
  return signIn ? children : <RestoringSession size="inline" />
}

export function useSignOut() {
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
  return { signOut, pending, error }
}

export function SignOut() {
  const { signOut, pending, error } = useSignOut()
  return <div className="flex items-center gap-3">{error && <span role="alert" className="text-sm text-destructive">{error}</span>}<Button variant="outline" onClick={signOut} disabled={pending}>{pending ? 'Signing out…' : 'Sign out'}</Button></div>
}


