import type { QueryClient } from '@tanstack/react-query'
import { checkSession } from '@/lib/client-session'
import { applyLeagueMutation } from '@/lib/league-cache'

export async function leagueRequest<T>(path: string, client: QueryClient, method = 'GET', body?: unknown): Promise<T> {
  const send = () => fetch(`/api/league/${path}`, {
    method, cache: 'no-store',
    headers: method === 'GET' ? undefined : { 'Content-Type': 'application/json', 'X-Requested-With': 'Shotclock' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let response = await send()
  if (response.status === 401) {
    if (!navigator.locks) { window.location.assign('/login'); throw new Error('Please sign in again.') }
    const restored = await navigator.locks.request('shotclock-refresh', async () => {
      const status = await checkSession(client)
      if (status === 200) return true
      if (status !== 401) throw new Error('The service is unavailable. Please try again.')
      const refresh = await fetch('/api/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'Shotclock' }, body: '{}' })
      if (refresh.status === 401) return false
      if (!refresh.ok) throw new Error('The service is unavailable. Please try again.')
      return true
    })
    if (!restored) { window.location.assign('/login'); throw new Error('Please sign in again.') }
    response = await send()
  }
  const data: unknown = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string' ? data.error : 'Unable to complete your request.')
  if (method !== 'GET') await applyLeagueMutation(client, path, method, body, data)
  return data as T
}
