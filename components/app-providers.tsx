'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { Provider } from 'react-redux'
import { makeStore } from '@/lib/store'
import { subscribeToCacheChanges } from '@/lib/league-cache'
import { makeQueryClient } from '@/lib/query-client'

let browserQueryClient: QueryClient | undefined
function getQueryClient() {
  if (typeof window === 'undefined') return makeQueryClient()
  return browserQueryClient ??= makeQueryClient()
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [store] = useState(makeStore)
  const queryClient = getQueryClient()
  useEffect(() => subscribeToCacheChanges(queryClient, () => window.location.reload()), [queryClient])
  return <Provider store={store}><QueryClientProvider client={queryClient}>{children}</QueryClientProvider></Provider>
}
