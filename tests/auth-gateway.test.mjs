import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'

test('gateway enforces origin and keeps rotating credentials in HTTP-only cookies', async () => {
  const calls = []
  const server = createServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    calls.push({ path: req.url, authorization: req.headers.authorization, body: body ? JSON.parse(body) : undefined })
    res.setHeader('content-type', 'application/json')
    if (req.url === '/auth/login' || req.url === '/auth/refresh') {
      res.end(JSON.stringify({ accessToken: 'private-access', refreshToken: 'private-refresh', user: { id: '1', email: 'user@example.com' } }))
    } else if (req.url === '/auth/me') res.end(JSON.stringify({ user: { id: '1', email: 'user@example.com' } }))
    else res.end(JSON.stringify({ ok: true }))
  })
  server.listen(3101, '127.0.0.1')
  await once(server, 'listening')
  try {
    const url = 'http://localhost:3100/api/auth/login'
    const headers = { origin: 'http://localhost:3100', 'x-requested-with': 'Shotclock', 'content-type': 'application/json' }
    const blocked = await fetch(url, { method: 'POST', headers: { ...headers, origin: 'http://evil.example' }, body: '{}' })
    assert.equal(blocked.status, 403)
    assert.equal(calls.length, 0)
    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ email: 'user@example.com', password: 'a long password' }) })
    assert.equal(response.status, 200)
    const data = await response.text()
    assert.doesNotMatch(data, /private-access|private-refresh/)
    const cookies = response.headers.getSetCookie()
    assert.equal(cookies.length, 2)
    assert.ok(cookies.every(cookie => /HttpOnly/i.test(cookie) && /SameSite=lax/i.test(cookie)))
    const cookie = cookies.map(value => value.split(';')[0]).join('; ')
    const me = await fetch('http://localhost:3100/api/auth/me', { headers: { cookie } })
    assert.equal(me.status, 200)
    assert.equal(calls.at(-1).authorization, 'Bearer private-access')
    const refreshed = await fetch('http://localhost:3100/api/auth/refresh', { method: 'POST', headers: { ...headers, cookie }, body: '{}' })
    assert.equal(refreshed.status, 200)
    assert.equal(calls.at(-1).body.refreshToken, 'private-refresh')
    const logout = await fetch('http://localhost:3100/api/auth/logout', { method: 'POST', headers: { ...headers, cookie }, body: '{}' })
    assert.equal(logout.status, 200)
    assert.ok(logout.headers.getSetCookie().every(value => /Max-Age=0/i.test(value)))
  } finally { server.close(); await once(server, 'close') }
})
