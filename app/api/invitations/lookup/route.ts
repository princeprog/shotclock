import { NextRequest, NextResponse } from 'next/server'
import { apiFetch, appOrigin } from '@/lib/auth-server'
import { isTrustedMutation, trustedClientHeaders } from '@/lib/auth-security'

// Invitation links are opened before sign-in, so this lookup is forwarded without a session.
export async function POST(request: NextRequest) {
  if (!isTrustedMutation(request.headers.get('origin'), request.headers.get('x-requested-with'), appOrigin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const text = await request.text()
  if (text.length > 1024) return NextResponse.json({ error: 'Request too large' }, { status: 413 })
  let token: unknown
  try { token = (JSON.parse(text) as { token?: unknown }).token } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
  if (typeof token !== 'string') return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  try {
    const upstream = await apiFetch('/invitations/lookup', { method: 'POST', headers: { 'content-type': 'application/json', ...trustedClientHeaders(request.headers, process.env.AUTH_GATEWAY_SECRET, process.env.AUTH_TRUSTED_CLIENT_IP_HEADER) }, body: JSON.stringify({ token }) })
    if (upstream.status === 400 || upstream.status === 404) return NextResponse.json({ error: 'This invitation link isn’t valid.' }, { status: 404 })
    if (upstream.status === 429) return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 })
    if (!upstream.ok) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
    return NextResponse.json(await upstream.json(), { headers: { 'Cache-Control': 'no-store' } })
  } catch { return NextResponse.json({ error: 'Service unavailable' }, { status: 503 }) }
}

