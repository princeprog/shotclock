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
