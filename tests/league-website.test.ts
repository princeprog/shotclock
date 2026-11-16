import { test } from 'node:test'
import assert from 'node:assert/strict'
import { slugError, suggestSlug } from '../lib/league-website.ts'

test('suggests a web address from the league name', () => {
  assert.equal(suggestSlug('Metro Hoops League'), 'metro-hoops-league')
  assert.equal(suggestSlug('  Liga Niño 2026! '), 'liga-nino-2026')
  assert.equal(suggestSlug('QC'), 'league-qc')
  assert.equal(suggestSlug('!!!'), 'league')
})

test('accepts only addresses the API accepts', () => {
  assert.equal(slugError('metro-hoops'), '')
  assert.match(slugError('ab'), /at least 3/)
  assert.match(slugError('metro--hoops'), /single hyphens/)
  assert.match(slugError('-metro'), /single hyphens/)
  assert.match(slugError('Metro'), /lowercase/)
  assert.match(slugError('a'.repeat(61)), /60 characters/)
})
