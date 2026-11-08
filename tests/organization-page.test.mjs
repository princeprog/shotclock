import { test } from 'node:test'
import assert from 'node:assert/strict'

const base = process.env.SHOTCLOCK_TEST_WEB_URL

test('the organization picker redirects unauthenticated visitors to sign in', { skip: !base }, async () => {
  const response = await fetch(`${base}/organizations`, { redirect: 'manual' })
  assert.ok([302, 303, 307, 308].includes(response.status))
  assert.equal(new URL(response.headers.get('location'), base).pathname, '/login')
})

test('the retired management page leads to the organization picker', { skip: !base }, async () => {
  const response = await fetch(`${base}/manage/organizations`, { redirect: 'manual' })
  assert.ok([302, 303, 307, 308].includes(response.status))
  assert.equal(new URL(response.headers.get('location'), base).pathname, '/organizations')
})

test('unknown management routes are not treated as pages', { skip: !base }, async () => {
  const response = await fetch(`${base}/manage/toString`, { redirect: 'manual' })
  assert.equal(response.status, 404)
})
