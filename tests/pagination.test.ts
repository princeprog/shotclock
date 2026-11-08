import { test } from 'node:test'
import assert from 'node:assert/strict'
import { requirePaginatedResult } from '../lib/pagination.ts'

test('accepts a paginated response and rejects an outdated array response', () => {
  const page = { items: [{ id: 'one' }], page: 1, pageSize: 10, total: 1, totalPages: 1 }
  assert.deepEqual(requirePaginatedResult(page), page)
  assert.throws(() => requirePaginatedResult([{ id: 'one' }]), /unexpected pagination response/)
  assert.throws(() => requirePaginatedResult({ items: [] }), /unexpected pagination response/)
})
