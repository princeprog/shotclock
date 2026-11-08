import { test } from 'node:test'
import assert from 'node:assert/strict'
import { QueryClient } from '@tanstack/react-query'
import { checkSession } from '../lib/client-session.ts'

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
