import { test } from 'node:test'
import assert from 'node:assert/strict'
import { QueryClient } from '@tanstack/react-query'
import { checkSession, refreshSession } from '../lib/client-session.ts'

test('session checks are fresh and report status without caching user data', async () => {
  const client = new QueryClient()
  let calls = 0
  const fetcher: typeof fetch = async () => { calls++; return new Response('', { status: calls === 1 ? 200 : 401 }) }
  assert.equal(await checkSession(client, fetcher), 200)
  assert.equal(await checkSession(client, fetcher), 401)
  assert.equal(calls, 2)
  assert.equal(client.getQueryData(['auth', 'session-status']), 401)
  client.clear()
})

test('network errors do not retry authentication requests', async () => {
  const client = new QueryClient()
  let calls = 0
  const fetcher: typeof fetch = async () => { calls++; throw new Error('network unavailable') }
  await assert.rejects(checkSession(client, fetcher), /network unavailable/)
  assert.equal(calls, 1)
  client.clear()
})

test('restoring a session reports restored, signed out or unavailable', async () => {
  const locks = { request: (_name: string, callback: () => unknown) => Promise.resolve(callback()) } as unknown as Pick<LockManager, 'request'>
  const run = async (me: number, refresh?: number) => {
    const client = new QueryClient()
    const paths: string[] = []
    const fetcher: typeof fetch = async (input) => { paths.push(String(input)); return new Response('{}', { status: String(input).endsWith('/refresh') ? refresh ?? 500 : me }) }
    const result = await refreshSession(client, fetcher, locks)
    client.clear()
    return { result, paths }
  }
  assert.deepEqual(await run(200), { result: 'restored', paths: ['/api/auth/me'] })
  assert.equal((await run(401, 200)).result, 'restored')
  assert.equal((await run(401, 401)).result, 'signed-out')
  assert.equal((await run(401, 503)).result, 'unavailable')
  assert.equal((await run(503)).result, 'unavailable')
  assert.equal(await refreshSession(new QueryClient(), fetch, null), 'signed-out')
})
