import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextSort, sortParams, sortRows, statusRank } from '../lib/table-sort.ts'

const rows = [
  { name: 'Team 10', wins: 3, venue: 'Bayview' },
  { name: 'team 2', wins: 5, venue: null },
  { name: 'Alpha', wins: 3, venue: 'Arena' },
]
const accessors = { name: (row: typeof rows[number]) => row.name, wins: (row: typeof rows[number]) => row.wins, venue: (row: typeof rows[number]) => row.venue }

test('a column cycles ascending, descending, then back to the default order', () => {
  assert.deepEqual(nextSort(null, 'name'), { key: 'name', dir: 'asc' })
  assert.deepEqual(nextSort({ key: 'name', dir: 'asc' }, 'name'), { key: 'name', dir: 'desc' })
  assert.equal(nextSort({ key: 'name', dir: 'desc' }, 'name'), null)
  assert.deepEqual(nextSort({ key: 'name', dir: 'desc' }, 'wins'), { key: 'wins', dir: 'asc' })
})

test('text sorts naturally and case-insensitively; numbers sort numerically with stable ties', () => {
  assert.deepEqual(sortRows(rows, { key: 'name', dir: 'asc' }, accessors).map((row) => row.name), ['Alpha', 'team 2', 'Team 10'])
  assert.deepEqual(sortRows(rows, { key: 'wins', dir: 'desc' }, accessors).map((row) => row.name), ['team 2', 'Team 10', 'Alpha'])
  assert.deepEqual(sortRows(rows, null, accessors), rows)
})

test('empty values stay last in both directions', () => {
  assert.deepEqual(sortRows(rows, { key: 'venue', dir: 'asc' }, accessors).map((row) => row.venue), ['Arena', 'Bayview', null])
  assert.deepEqual(sortRows(rows, { key: 'venue', dir: 'desc' }, accessors).map((row) => row.venue), ['Bayview', 'Arena', null])
})

test('statuses follow the season lifecycle and server sorts become query parameters', () => {
  assert.deepEqual(['completed', 'draft', 'active'].map(statusRank).sort(), [1, 2, 3])
  assert.deepEqual(sortParams({ key: 'startDate', dir: 'desc' }), { sortBy: 'startDate', sortDir: 'desc' })
  assert.deepEqual(sortParams(null), {})
})
