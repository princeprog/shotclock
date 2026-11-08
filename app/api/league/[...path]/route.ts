import { NextRequest, NextResponse } from 'next/server'
import { ACCESS_COOKIE, apiFetch, appOrigin } from '@/lib/auth-server'
import { isTrustedMutation } from '@/lib/auth-security'

const uuid = '[0-9a-fA-F-]{36}'
const routes: Record<string, RegExp[]> = {
  GET: [new RegExp(`^(organizations|organizations/${uuid}|organizations/${uuid}/(leagues|seasons|teams|team-seasons|venues)|leagues/${uuid}|leagues/${uuid}/(seasons|teams|venues)|seasons/${uuid}|seasons/${uuid}/(teams|games|standings|dashboard)|teams/${uuid}|season-teams/${uuid}(/roster)?)$`)],
  POST: [new RegExp(`^(organizations|organizations/${uuid}/leagues|leagues/${uuid}/(seasons|teams|venues)|seasons/${uuid}/(status|teams|games)|season-teams/${uuid}/roster|games/${uuid}/score)$`)],
  PATCH: [new RegExp(`^(organizations|leagues|seasons|teams|rosters|games|venues)/${uuid}$`)],
}

async function forward(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params
  const route = path.join('/')
  if (!routes[request.method]?.some((pattern) => pattern.test(route))) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (request.method !== 'GET' && !isTrustedMutation(request.headers.get('origin'), request.headers.get('x-requested-with'), appOrigin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const access = request.cookies.get(ACCESS_COOKIE)?.value
  if (!access) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  let body: string | undefined
  if (request.method !== 'GET') {
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return NextResponse.json({ error: 'Invalid request' }, { status: 415 })
    body = await request.text()
    if (body.length > 8192) return NextResponse.json({ error: 'Request too large' }, { status: 413 })
    try { const parsed: unknown = JSON.parse(body); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error() }
    catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
  }
  try {
    const query = request.method === 'GET' && new RegExp(`^((leagues|organizations)/${uuid}/seasons|organizations/${uuid}/(teams|venues)|season-teams/${uuid}/roster|seasons/${uuid}/games)$`).test(route) ? request.nextUrl.search : ''
    const upstream = await apiFetch(`/league/${route}${query}`, { method: request.method, headers: { authorization: `Bearer ${access}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body })
    const data = await upstream.json().catch(() => ({})) as { message?: string | string[] }
    if (!upstream.ok) {
      const status = upstream.status >= 500 ? 503 : upstream.status
      const message = status === 400 || status === 409 ? (Array.isArray(data.message) ? data.message.join('. ') : data.message) : undefined
      return NextResponse.json({ error: message || (status === 401 ? 'Not authenticated' : status === 404 ? 'Not found' : 'Service unavailable') }, { status, headers: { 'Cache-Control': 'no-store' } })
    }
    return NextResponse.json(data, { status: upstream.status, headers: { 'Cache-Control': 'no-store' } })
  } catch { return NextResponse.json({ error: 'Service unavailable' }, { status: 503 }) }
}

export const GET = forward
export const POST = forward
export const PATCH = forward
