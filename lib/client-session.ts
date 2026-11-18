import type { QueryClient } from '@tanstack/react-query'

export function checkSession(client: QueryClient, fetcher: typeof fetch = fetch): Promise<number> {
  return client.fetchQuery({
    queryKey: ['auth', 'session-status'],
    queryFn: async () => (await fetcher('/api/auth/me', { cache: 'no-store' })).status,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  })
}


type Locks = Pick<LockManager, 'request'>
const authHeaders = { 'Content-Type': 'application/json', 'X-Requested-With': 'Shotclock' }

// Restores an expired access session from the refresh cookie, once at a time across tabs.
export async function refreshSession(client: QueryClient, fetcher: typeof fetch = fetch, locks: Locks | null = typeof navigator === 'undefined' ? null : navigator.locks ?? null): Promise<'restored' | 'signed-out' | 'unavailable'> {
  if (!locks) return 'signed-out'
  return locks.request('shotclock-refresh', async () => {
    const status = await checkSession(client, fetcher)
    if (status === 200) return 'restored'
    if (status !== 401) return 'unavailable'
    const response = await fetcher('/api/auth/refresh', { method: 'POST', headers: authHeaders, body: '{}' })
    return response.ok ? 'restored' : response.status === 401 ? 'signed-out' : 'unavailable'
  }) as Promise<'restored' | 'signed-out' | 'unavailable'>
}
