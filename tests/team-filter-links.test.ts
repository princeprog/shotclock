import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readTeamFilters, teamListHref } from '../lib/team-filter-links.ts'

const leagueId = 'd28c0d55-601a-4b4b-9eb5-6107bf8b4308'
const seasonId = 'e5287e1a-e071-4609-8a5c-d3de2a694542'

test('team filters round trip safely through a local return link', () => {
  const href = teamListHref({ search: 'City & Hawks', leagueId, seasonId })
  const url = new URL(href, 'http://localhost')
  assert.equal(url.pathname, '/manage/teams')
  assert.deepEqual(readTeamFilters(Object.fromEntries(url.searchParams)), { search: 'City & Hawks', leagueId, seasonId })
})

test('invalid filter values are ignored and all filters default to empty', () => {
  assert.deepEqual(readTeamFilters({ leagueId: '//example.com', seasonId: 'invalid', search: 'a'.repeat(121) }), { search: '', leagueId: '', seasonId: '' })
  assert.equal(teamListHref(readTeamFilters({})), '/manage/teams')
})

test('legacy all-teams links return to the selected division', () => {
  const filters = readTeamFilters({ search: 'hawks', scope: 'all' })
  assert.deepEqual(filters, { search: 'hawks', leagueId: '', seasonId: '' })
  assert.equal(teamListHref(filters), '/manage/teams?search=hawks')
})


test('division filter survives roster return links and rejects invalid IDs', () => {
  const divisionId = 'ab9c0d55-601a-4b4b-9eb5-6107bf8b4308'
  const href = teamListHref({ search: 'Hawks', leagueId: '', seasonId: '', divisionId })
  assert.equal(readTeamFilters(Object.fromEntries(new URL(href, 'http://localhost').searchParams)).divisionId, divisionId)
  assert.equal(readTeamFilters({ divisionId: 'invalid' }).divisionId, undefined)
})
