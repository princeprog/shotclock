import 'server-only'
import { cookies } from 'next/headers'

export type AuthUser = { id: string; email: string; name?: string | null }
const production = process.env.NODE_ENV === 'production'
export const ACCESS_COOKIE = production ? '__Host-shotclock-access' : 'shotclock-access'
export const REFRESH_COOKIE = production ? '__Host-shotclock-refresh' : 'shotclock-refresh'

export function appOrigin(): string {
  const value = process.env.APP_ORIGIN ?? (production ? '' : 'http://localhost:3000')
  const url = new URL(value)
  if ((production && url.protocol !== 'https:') || url.origin !== value) throw new Error('APP_ORIGIN must be an origin using HTTPS in production')
  return url.origin
}

export function apiUrl(): string {
  const value = process.env.AUTH_API_URL ?? (production ? '' : 'http://localhost:3001')
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || (production && url.protocol !== 'https:') || url.origin !== value) throw new Error('AUTH_API_URL must be an origin using HTTPS in production')
  return url.origin
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${apiUrl()}${path}`, { ...init, cache: 'no-store', signal: AbortSignal.timeout(10000) })
}

export async function sessionState(): Promise<{ state: 'authenticated'; user: AuthUser } | { state: 'restore' } | { state: 'anonymous' } | { state: 'unavailable' }> {
  const jar = await cookies()
  const access = jar.get(ACCESS_COOKIE)?.value
  const refresh = jar.has(REFRESH_COOKIE)
  if (!access) return { state: refresh ? 'restore' : 'anonymous' }
  try {
    const response = await apiFetch('/auth/me', { headers: { authorization: `Bearer ${access}` } })
    if (response.ok) {
      const data = await response.json() as { user: AuthUser }
      return { state: 'authenticated', user: data.user }
    }
    if (response.status === 401) return { state: refresh ? 'restore' : 'anonymous' }
    return { state: 'unavailable' }
  } catch {
    return { state: 'unavailable' }
  }
}
