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

test('division and player routes are protected and accepted by the gateway', { skip: !base }, async () => {
  const id = '11111111-1111-4111-8111-111111111111'
  const headers = { origin: base, 'content-type': 'application/json', 'x-requested-with': 'Shotclock' }
  for (const path of [`seasons/${id}/divisions`, `organizations/${id}/players?search=alex`]) {
    assert.equal((await fetch(`${base}/api/league/${path}`)).status, 401)
  }
  for (const [method, path] of [['POST', `seasons/${id}/divisions`], ['POST', `organizations/${id}/players`], ['POST', `organizations/${id}/players/${id}/fork`], ['PATCH', `players/${id}`], ['DELETE', `divisions/${id}`], ['PATCH', `season-teams/${id}`], ['DELETE', `season-teams/${id}`], ['DELETE', `rosters/${id}`]]) {
    assert.equal((await fetch(`${base}/api/league/${path}`, { method, headers, body: '{}' })).status, 401)
  }
})
