import { test } from 'node:test'
import assert from 'node:assert/strict'

const base = process.env.SHOTCLOCK_TEST_WEB_URL
const email = process.env.SHOTCLOCK_TEST_EMAIL
const password = process.env.SHOTCLOCK_TEST_PASSWORD
const headers = { origin: base, 'content-type': 'application/json', 'x-requested-with': 'Shotclock' }

test('league requests recover after access expiry using an HTTP-only rotated refresh cookie', { skip: !base || !email || !password }, async () => {
  const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers, body: JSON.stringify({ email, password }) })
  assert.equal(login.status, 200)
  const cookies = login.headers.getSetCookie().map((value) => value.split(';')[0])
  const refresh = cookies.find((value) => value.startsWith('shotclock-refresh='))
  assert.ok(refresh)
  const expired = `shotclock-access=invalid; ${refresh}`
  assert.equal((await fetch(`${base}/api/league/organizations`, { headers: { cookie: expired } })).status, 401)
  const rotated = await fetch(`${base}/api/auth/refresh`, { method: 'POST', headers: { ...headers, cookie: expired }, body: '{}' })
  assert.equal(rotated.status, 200)
  const rotatedCookies = rotated.headers.getSetCookie()
  assert.equal(rotatedCookies.length, 2)
  assert.ok(rotatedCookies.every((value) => /httponly/i.test(value)))
  const cookie = rotatedCookies.map((value) => value.split(';')[0]).join('; ')
  assert.equal((await fetch(`${base}/api/league/organizations`, { headers: { cookie } })).status, 200)
  await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { ...headers, cookie }, body: '{}' })
})
