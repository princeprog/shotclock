import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../app/api/league/[...path]/route.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const calls = []
class NextResponse extends Response { static json(body, init) { return Response.json(body, init) } }
const context = { exports: {}, Response, NextResponse, TextEncoder, TextDecoder, Uint8Array, require(name) {
  if (name === 'next/server') return { NextResponse }
  if (name === '@/lib/auth-server') return { ACCESS_COOKIE: 'access', appOrigin: () => 'https://app.test', apiFetch: async (path, options) => { calls.push({ path, options }); return Response.json({ ok: true }) } }
  if (name === '@/lib/auth-security') return { isTrustedMutation: (origin, marker, expected) => origin === expected && marker === 'Shotclock' }
  throw new Error(`Unexpected dependency: ${name}`)
} }
vm.runInNewContext(compiled, context)
const route = context.exports
const id = '12345678-1234-1234-1234-123456789abc'
async function request(method, path, body, headers = {}) {
  const value = new Request(`https://app.test/api/league/${path}`, { method, headers: { origin: 'https://app.test', 'x-requested-with': 'Shotclock', 'content-type': 'application/json', ...headers }, body })
  value.nextUrl = new URL(value.url)
  value.cookies = { get: () => ({ value: 'test-access' }) }
  return route[method](value, { params: Promise.resolve({ path: path.split('?')[0].split('/') }) })
}

test('schedule routes and game deletion are allowlisted while other routes remain blocked', async () => {
  for (const [method, path] of [['GET', `divisions/${id}/schedule/status`], ['POST', `divisions/${id}/schedule/preview`], ['POST', `divisions/${id}/schedule`], ['POST', `divisions/${id}/playoffs/preview`], ['POST', `divisions/${id}/playoffs`], ['DELETE', `games/${id}`]]) {
    assert.equal((await request(method, path, method === 'POST' ? '{}' : undefined)).status, 200, `${method} ${path}`)
  }
  assert.equal((await request('POST', `divisions/${id}/schedule/other`, '{}')).status, 404)
  assert.equal((await request('DELETE', `games/${id}/score`)).status, 404)
  assert.equal((await request('POST', `divisions/${id}/schedule`, '{}', { origin: 'https://evil.test' })).status, 403)
})

test('only schedule saves receive the 256 KiB byte limit', async () => {
  const larger = JSON.stringify({ value: 'é'.repeat(5000) })
  assert.equal((await request('POST', `divisions/${id}/schedule`, larger)).status, 200)
  assert.equal((await request('POST', `divisions/${id}/playoffs`, larger)).status, 200)
  assert.equal((await request('POST', `divisions/${id}/schedule/preview`, larger)).status, 413)
  assert.equal((await request('POST', `games/${id}/score`, larger)).status, 413)
  const tooLarge = JSON.stringify({ value: 'é'.repeat(131072) })
  assert.equal((await request('POST', `divisions/${id}/schedule`, tooLarge)).status, 413)
  assert.equal((await request('POST', `divisions/${id}/playoffs`, tooLarge)).status, 413)
  const sizedBody = (size) => `{"value":"${'x'.repeat(size - 12)}"}`
  assert.equal(Buffer.byteLength(sizedBody(8192)), 8192)
  assert.equal((await request('POST', `divisions/${id}/schedule/preview`, sizedBody(8192))).status, 200)
  assert.equal((await request('POST', `divisions/${id}/schedule/preview`, sizedBody(8193))).status, 413)
  assert.equal((await request('POST', `divisions/${id}/schedule`, sizedBody(256 * 1024))).status, 200)
  assert.equal((await request('POST', `divisions/${id}/schedule`, sizedBody(256 * 1024 + 1))).status, 413)
})

test('forfeit and schedule history routes preserve gateway checks', async () => {
  assert.equal((await request('GET', `games/${id}/schedule-history`)).status, 200)
  assert.equal((await request('POST', `games/${id}/forfeit`, '{}')).status, 200)
  assert.equal((await request('POST', `games/${id}/forfeit`, '{}', { origin: 'https://evil.test' })).status, 403)
  assert.equal((await request('POST', `games/${id}/forfeit`, JSON.stringify({ value: 'x'.repeat(8192) }))).status, 413)
  assert.equal((await request('GET', `games/not-a-uuid/schedule-history`)).status, 404)
  assert.equal((await request('GET', `games/${id}/forfeit`)).status, 404)
})


test('season scheduling routes are allowlisted and reject unsupported paths', async () => {
  for (const [method, path] of [['GET', `seasons/${id}/schedule/status`], ...['schedule', 'playoffs'].flatMap((kind) => [['POST', `seasons/${id}/${kind}`], ['POST', `seasons/${id}/${kind}/preview`]])]) {
    assert.equal((await request(method, path, method === 'POST' ? '{}' : undefined)).status, 200, `${method} ${path}`)
  }
  assert.equal((await request('GET', `seasons/${id}/schedule`)).status, 404)
  assert.equal((await request('POST', `seasons/${id}/schedule/other`, '{}')).status, 404)
  assert.equal((await request('POST', `seasons/${id}/playoffs`, '{}', { origin: 'https://evil.test' })).status, 403)
})

test('season saves accept at most 2 MiB while previews keep the 8192-byte limit', async () => {
  const sizedBody = (size) => `{"value":"${'x'.repeat(size - 12)}"}`
  for (const kind of ['schedule', 'playoffs']) {
    assert.equal((await request('POST', `seasons/${id}/${kind}`, sizedBody(2 * 1024 * 1024))).status, 200)
    assert.equal((await request('POST', `seasons/${id}/${kind}`, sizedBody(2 * 1024 * 1024 + 1))).status, 413)
    assert.equal((await request('POST', `seasons/${id}/${kind}/preview`, sizedBody(8192))).status, 200)
    assert.equal((await request('POST', `seasons/${id}/${kind}/preview`, sizedBody(8193))).status, 413)
  }
})

test('season-scoped query parameters are forwarded on existing GET routes', async () => {
  for (const kind of ['games', 'teams', 'standings', 'dashboard']) {
    assert.equal((await request('GET', `seasons/${id}/${kind}?scope=season&page=2`)).status, 200)
    assert.equal(calls.at(-1).path, `/league/seasons/${id}/${kind}?scope=season&page=2`)
  }
})

test('team pagination and filters reach the API unchanged', async () => {
  const query = `leagueId=${id}&seasonId=${id}&divisionId=${id}&search=hawks&page=2&pageSize=20`
  assert.equal((await request('GET', `organizations/${id}/teams?${query}`)).status, 200)
  assert.equal(calls.at(-1).path, `/league/organizations/${id}/teams?${query}`)
})
