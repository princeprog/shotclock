import { QueryClient } from '@tanstack/react-query'

export function makeQueryClient() {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000 } } })
  client.setQueryDefaults(['league'], { staleTime: Infinity, gcTime: Infinity })
  return client
}
