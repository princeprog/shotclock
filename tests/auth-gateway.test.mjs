import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const { NextRequest } = require('next/server')

// Loads a TypeScript module in-process so the gateway runs without a dev server.
function load(file, mocks = {}) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const loaded = { exports: {} }
  vm.runInThisContext(`(function (exports, require, module, process) {${compiled}\n})`)(loaded.exports, (name) => name in mocks ? mocks[name] : require(name), loaded, process)
  return loaded.exports
}

async function gateway() {
  const calls = []
  const server = createServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    calls.push({ method: req.method, path: req.url, authorization: req.headers.authorization, body: body ? JSON.parse(body) : undefined })
    res.setHeader('content-type', 'application/json')
    if (req.url === '/auth/login' || req.url === '/auth/refresh') res.end(JSON.stringify({ accessToken: 'private-access', refreshToken: 'private-refresh', user: { id: '1', email: 'user@example.com' } }))
    else if (req.url === '/auth/me' && req.method === 'GET') res.end(JSON.stringify({ user: { id: '1', email: 'user@example.com' } }))
    else if (req.url === '/auth/change-password' && JSON.parse(body).currentPassword === 'wrong') { res.statusCode = 400; res.end(JSON.stringify({ message: 'Current password is incorrect' })) }
    else if (req.url === '/auth/me' && req.method === 'PATCH') res.end(JSON.stringify({ user: { id: '1', email: 'user@example.com', name: JSON.parse(body).name } }))
    else res.end(JSON.stringify({ ok: true }))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  process.env.APP_ORIGIN = 'http://localhost:3100'
  process.env.AUTH_API_URL = `http://127.0.0.1:${server.address().port}`
  const security = load('lib/auth-security.ts')
  const authServer = load('lib/auth-server.ts', { 'server-only': {}, 'next/headers': {} })
  const route = load('app/api/auth/[action]/route.ts', { 'next/server': require('next/server'), '@/lib/auth-server': authServer, '@/lib/auth-security': security })
  const call = (method, action, { headers = {}, body } = {}) => route[method](new NextRequest(`http://localhost:3100/api/auth/${action}`, { method, headers, body }), { params: Promise.resolve({ action }) })
  return { calls, call, close: async () => { server.close(); await once(server, 'close') } }
}

const trusted = { origin: 'http://localhost:3100', 'x-requested-with': 'Shotclock', 'content-type': 'application/json' }

test('gateway enforces origin and keeps rotating credentials in HTTP-only cookies', async () => {
  const { calls, call, close } = await gateway()
  try {
    const blocked = await call('POST', 'login', { headers: { ...trusted, origin: 'http://evil.example' }, body: '{}' })
    assert.equal(blocked.status, 403)
    assert.equal(calls.length, 0)
    const response = await call('POST', 'login', { headers: trusted, body: JSON.stringify({ email: 'user@example.com', password: 'a long password' }) })
    assert.equal(response.status, 200)
    assert.doesNotMatch(await response.text(), /private-access|private-refresh/)
    const cookies = response.headers.getSetCookie()
    assert.equal(cookies.length, 2)
    assert.ok(cookies.every((cookie) => /HttpOnly/i.test(cookie) && /SameSite=lax/i.test(cookie)))
    const cookie = cookies.map((value) => value.split(';')[0]).join('; ')
    const me = await call('GET', 'me', { headers: { cookie } })
    assert.equal(me.status, 200)
    assert.equal(calls.at(-1).authorization, 'Bearer private-access')
    const refreshed = await call('POST', 'refresh', { headers: { ...trusted, cookie }, body: '{}' })
    assert.equal(refreshed.status, 200)
    assert.equal(calls.at(-1).body.refreshToken, 'private-refresh')
    const logout = await call('POST', 'logout', { headers: { ...trusted, cookie }, body: '{}' })
    assert.equal(logout.status, 200)
    assert.ok(logout.headers.getSetCookie().every((value) => /Max-Age=0/i.test(value)))
  } finally { await close() }
})

test('account actions forward the session, surface upstream messages and clear cookies after deletion', async () => {
  const { calls, call, close } = await gateway()
  try {
    const cookie = 'shotclock-access=private-access; shotclock-refresh=private-refresh'
    const anonymous = await call('POST', 'change-password', { headers: trusted, body: JSON.stringify({ currentPassword: 'a', newPassword: 'b' }) })
    assert.equal(anonymous.status, 401)
    const wrong = await call('POST', 'change-password', { headers: { ...trusted, cookie }, body: JSON.stringify({ currentPassword: 'wrong', newPassword: 'a long new password' }) })
    assert.equal(wrong.status, 400)
    assert.equal((await wrong.json()).error, 'Current password is incorrect')
    const renamed = await call('PATCH', 'me', { headers: { ...trusted, cookie }, body: JSON.stringify({ name: 'Coach' }) })
    assert.equal(renamed.status, 200)
    assert.equal((await renamed.json()).user.name, 'Coach')
    assert.deepEqual(calls.at(-1), { method: 'PATCH', path: '/auth/me', authorization: 'Bearer private-access', body: { name: 'Coach' } })
    const forged = await call('DELETE', 'me', { headers: { ...trusted, origin: 'http://evil.example', cookie }, body: JSON.stringify({ password: 'x' }) })
    assert.equal(forged.status, 403)
    const deleted = await call('DELETE', 'me', { headers: { ...trusted, cookie }, body: JSON.stringify({ password: 'a long password' }) })
    assert.equal(deleted.status, 200)
    assert.equal(calls.at(-1).method, 'DELETE')
    assert.ok(deleted.headers.getSetCookie().every((value) => /Max-Age=0/i.test(value)))
  } finally { await close() }
})

