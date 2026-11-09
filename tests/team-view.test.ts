import { test } from 'node:test'
import assert from 'node:assert/strict'
import { availableTeamDivisions, selectSeasonTeamRegistrations, readTeamView, saveTeamView } from '../lib/team-view.ts'

test('team view defaults to the table and remembers a valid choice', () => {
  const values = new Map<string, string>()
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
  assert.equal(readTeamView(storage), 'table')
  saveTeamView('cards', storage)
  assert.equal(readTeamView(storage), 'cards')
  saveTeamView('table', storage)
  assert.equal(readTeamView(storage), 'table')
  values.set('shotclock:teams-view', 'unexpected')
  assert.equal(readTeamView(storage), 'table')
})

test('the view can still be changed when browser storage is unavailable', () => {
  const storage = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
  saveTeamView('cards', storage)
  assert.equal(readTeamView(storage), 'cards')
  saveTeamView('table', storage)
})


test('season team list includes every division entry and excludes other seasons', () => {
  const rows = [
    { id: 'team-a', season_id: 'season-1', division_id: 'open' },
    { id: 'team-a', season_id: 'season-1', division_id: 'under-18' },
    { id: 'team-b', season_id: 'season-2', division_id: 'open' },
    { id: 'team-c', season_id: null, division_id: null },
  ]
  assert.deepEqual(selectSeasonTeamRegistrations(rows, 'season-1'), rows.slice(0, 2))
  assert.deepEqual(selectSeasonTeamRegistrations(rows, ''), [])
})


test('division filter narrows the selected season without mixing team entries', () => {
  const rows = [
    { id: 'a', season_id: 's1', division_id: 'open' },
    { id: 'a', season_id: 's1', division_id: 'u18' },
    { id: 'b', season_id: 's2', division_id: 'u18' },
  ]
  assert.deepEqual(selectSeasonTeamRegistrations(rows, 's1', 'u18'), [rows[1]])
  assert.deepEqual(selectSeasonTeamRegistrations(rows, 's1', ''), rows.slice(0, 2))
})


test('available divisions exclude only this team’s entries in the current season', () => {
  const divisions = [{ id: 'open' }, { id: 'youth' }, { id: 'senior' }]
  const registrations = [
    { id: 'team-a', season_id: 's1', division_id: 'open' },
    { id: 'team-a', season_id: 's2', division_id: 'youth' },
    { id: 'team-b', season_id: 's1', division_id: 'senior' },
  ]
  assert.deepEqual(availableTeamDivisions(divisions, registrations, 'team-a', 's1'), divisions.slice(1))
  assert.deepEqual(availableTeamDivisions(divisions, registrations, 'team-a', 's2'), [divisions[0], divisions[2]])
})
