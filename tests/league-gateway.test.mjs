import { test } from 'node:test'
import assert from 'node:assert/strict'

const base = process.env.SHOTCLOCK_TEST_WEB_URL

test('league gateway rejects cross-origin and unmarked writes before authentication', { skip: !base }, async () => {
  const url = `${base}/api/league/organizations`
  const body = JSON.stringify({ name: 'Example' })
  const headers = { 'content-type': 'application/json', 'x-requested-with': 'Shotclock' }
  assert.equal((await fetch(url, { method: 'POST', headers: { ...headers, origin: 'http://untrusted.example' }, body })).status, 403)
  assert.equal((await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body })).status, 403)
  assert.equal((await fetch(url, { method: 'POST', headers: { ...headers, origin: base }, body })).status, 401)
  assert.equal((await fetch(`${base}/api/league/not-a-route`)).status, 404)
})
