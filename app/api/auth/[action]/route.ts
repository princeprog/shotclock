import { NextRequest, NextResponse } from 'next/server'
import { ACCESS_COOKIE, REFRESH_COOKIE, apiFetch, appOrigin } from '@/lib/auth-server'
import { isTrustedMutation, trustedClientHeaders } from '@/lib/auth-security'

const actions = new Set(['login', 'register', 'verify-email', 'resend-verification', 'forgot-password', 'reset-password', 'refresh', 'logout'])
const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/' }

function clearCookies(response: NextResponse) {
  response.cookies.set(ACCESS_COOKIE, '', { ...cookieOptions, maxAge: 0 })
  response.cookies.set(REFRESH_COOKIE, '', { ...cookieOptions, maxAge: 0 })
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params
  if (action !== 'me') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const access = request.cookies.get(ACCESS_COOKIE)?.value
  if (!access) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  try {
    const upstream = await apiFetch('/auth/me', { headers: { authorization: `Bearer ${access}` } })
    if (!upstream.ok) return NextResponse.json({ error: upstream.status === 401 ? 'Not authenticated' : 'Service unavailable' }, { status: upstream.status === 401 ? 401 : 503 })
    return NextResponse.json(await upstream.json(), { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params
  if (!actions.has(action)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  try {
    if (!isTrustedMutation(request.headers.get('origin'), request.headers.get('x-requested-with'), appOrigin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return NextResponse.json({ error: 'Invalid request' }, { status: 415 })
    const text = await request.text()
    if (text.length > 8192) return NextResponse.json({ error: 'Invalid request' }, { status: 413 })
    let body: Record<string, unknown>
    try {
      const parsed: unknown = JSON.parse(text)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid body')
      body = parsed as Record<string, unknown>
    } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }

    if (action === 'refresh' || action === 'logout') body = { refreshToken: request.cookies.get(REFRESH_COOKIE)?.value }
    const access = request.cookies.get(ACCESS_COOKIE)?.value
    const upstream = await apiFetch(`/auth/${action}`, { method: 'POST', headers: { 'content-type': 'application/json', ...trustedClientHeaders(request.headers, process.env.AUTH_GATEWAY_SECRET, process.env.AUTH_TRUSTED_CLIENT_IP_HEADER), ...(access && action === 'logout' ? { authorization: `Bearer ${access}` } : {}) }, body: JSON.stringify(body) })
    if (!upstream.ok) {
      const status = upstream.status === 429 ? 429 : upstream.status >= 500 ? 503 : upstream.status
      const response = NextResponse.json({ error: status === 429 ? 'Too many attempts. Please try again later.' : status === 503 ? 'Service unavailable. Please try again.' : 'Unable to complete your request.' }, { status })
      if (action === 'refresh' && upstream.status === 401) clearCookies(response)
      return response
    }
    const data = await upstream.json().catch(() => ({})) as { accessToken?: string; refreshToken?: string; user?: unknown }
    if ((action === 'login' || action === 'refresh') && (!data.accessToken || !data.refreshToken || !data.user)) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
    const response = NextResponse.json(action === 'login' || action === 'refresh' ? { user: data.user } : { ok: true }, { headers: { 'Cache-Control': 'no-store' } })
    if (data.accessToken && data.refreshToken && (action === 'login' || action === 'refresh')) {
      response.cookies.set(ACCESS_COOKIE, data.accessToken, { ...cookieOptions, maxAge: 15 * 60 })
      response.cookies.set(REFRESH_COOKIE, data.refreshToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 })
    }
    if (action === 'logout') clearCookies(response)
    return response
  } catch {
    return NextResponse.json({ error: 'Service unavailable. Please try again.' }, { status: 503 })
  }
}
