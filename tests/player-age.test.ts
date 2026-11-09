import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ageAtSeasonStart } from '../lib/player-age.ts'

test('age uses the season start calendar date and the birthday boundary', () => {
  assert.equal(ageAtSeasonStart('2008-11-19', '2026-11-18'), 17)
  assert.equal(ageAtSeasonStart('2008-11-18', '2026-11-18'), 18)
  assert.equal(ageAtSeasonStart('2008-11-17', '2026-11-18'), 18)
})

test('leap day follows the existing eligibility rule in a non-leap year', () => {
  assert.equal(ageAtSeasonStart('2008-02-29', '2025-02-28'), 16)
  assert.equal(ageAtSeasonStart('2008-02-29', '2025-03-01'), 17)
})

test('missing, invalid or impossible dates do not produce an age', () => {
  assert.equal(ageAtSeasonStart(null, '2026-11-18'), null)
  assert.equal(ageAtSeasonStart('2008-01-01', null), null)
  assert.equal(ageAtSeasonStart('2026-11-19', '2026-11-18'), null)
  assert.equal(ageAtSeasonStart('2008-02-30', '2026-11-18'), null)
  assert.equal(ageAtSeasonStart('2008-01-01', 'invalid'), null)
  assert.equal(ageAtSeasonStart('2008-01-01T00:00:00Z', '2026-01-01'), 18)
})
