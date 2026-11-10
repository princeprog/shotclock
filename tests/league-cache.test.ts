import { test } from 'node:test'
import assert from 'node:assert/strict'
import { QueryObserver } from '@tanstack/react-query'
import { makeQueryClient } from '../lib/query-client.ts'
import { applyLeagueMutation, invalidateLeagueChange, leagueChangeForMutation, subscribeToCacheChanges } from '../lib/league-cache.ts'

const tick = () => new Promise<void>((resolve) => setImmediate(resolve))

test('moving a roster entry invalidates both its previous and new team rosters', async () => {
  const client = makeQueryClient()
  client.setQueryData(['league', 'season-teams/old/roster'], [])
  client.setQueryData(['league', 'season-teams/new/roster'], [])
  await applyLeagueMutation(client, 'rosters/r1', 'PATCH', { seasonTeamId: 'new' }, { season_team_id: 'new' })
  assert.equal(client.getQueryState(['league', 'season-teams/old/roster'])?.isInvalidated, true)
  assert.equal(client.getQueryState(['league', 'season-teams/new/roster'])?.isInvalidated, true)
  client.clear()
})

test('team registration invalidates roster correction destinations', async () => {
  const client = makeQueryClient()
  client.setQueryData(['league', 'seasons/s1/teams?correction=all'], [])
  client.setQueryData(['league', 'seasons/s2/teams?correction=all'], [])
  await applyLeagueMutation(client, 'seasons/s1/teams', 'POST', { teamId: 't1' }, { season_id: 's1', team_id: 't1' })
  assert.equal(client.getQueryState(['league', 'seasons/s1/teams?correction=all'])?.isInvalidated, true)
  assert.equal(client.getQueryState(['league', 'seasons/s2/teams?correction=all'])?.isInvalidated, false)
  client.clear()
})

test('a league query is reused on remount and refetches only when invalidated', async () => {
  const client = makeQueryClient()
  let requests = 0
  const options = { queryKey: ['league', 'seasons/s1/standings'], queryFn: async () => ++requests }
  const first = new QueryObserver(client, options)
  const stopFirst = first.subscribe(() => {})
  await first.refetch()
  assert.equal(requests, 1)
  stopFirst()
  const second = new QueryObserver(client, options)
  const stopSecond = second.subscribe(() => {})
  await tick()
  assert.equal(requests, 1)
  await applyLeagueMutation(client, 'games/game1/score', 'POST', { homeScore: 90, awayScore: 80 }, { season_id: 's1' })
  assert.equal(requests, 2)
  stopSecond()
  client.clear()
})

test('a score change invalidates only the affected season games, standings and dashboard', async () => {
  const client = makeQueryClient()
  const paths = ['organizations', 'organizations/o1/leagues', 'organizations/o1/teams', 'leagues/l1/venues', 'seasons/s1/games?status=scheduled&page=1', 'seasons/s1/standings', 'seasons/s1/dashboard', 'seasons/s1/teams', 'seasons/s2/games?status=completed', 'seasons/s2/standings']
  for (const path of paths) client.setQueryData(['league', path], [])
  await applyLeagueMutation(client, 'games/g1/score', 'POST', {}, { season_id: 's1' })
  const invalidated = paths.filter((path) => client.getQueryState(['league', path])?.isInvalidated)
  assert.deepEqual(invalidated, ['seasons/s1/games?status=scheduled&page=1', 'seasons/s1/standings', 'seasons/s1/dashboard'])
  client.clear()
})

test('roster, team and venue changes affect their related cached views', async () => {
  const client = makeQueryClient()
  client.setQueryData(['league', 'organizations/o1/leagues'], [{ id: 'l1' }])
  client.setQueryData(['league', 'organizations/o1/teams?search=hawks'], [{ id: 't1', season_id: 's1' }, { id: 't1', season_id: 's2' }])
  for (const path of ['season-teams/st1/roster', 'season-teams/st1/roster?search=lee', 'season-teams/st2/roster', 'seasons/s1/standings', 'seasons/s2/games?status=scheduled', 'seasons/s3/standings', 'leagues/l1/venues', 'organizations/o1/venues']) client.setQueryData(['league', path], [])
  await applyLeagueMutation(client, 'rosters/r1', 'PATCH', {}, { season_team_id: 'st1' })
  assert.equal(client.getQueryState(['league', 'season-teams/st1/roster'])?.isInvalidated, true)
  assert.equal(client.getQueryState(['league', 'season-teams/st1/roster?search=lee'])?.isInvalidated, true)
  assert.equal(client.getQueryState(['league', 'season-teams/st2/roster'])?.isInvalidated, false)
  const team = leagueChangeForMutation(client, 'teams/t1', 'PATCH', {}, { id: 't1', league_id: 'l1' })
  assert.deepEqual(team.seasonIds, ['s1', 's2'])
  await invalidateLeagueChange(client, team)
  assert.equal(client.getQueryState(['league', 'seasons/s1/standings'])?.isInvalidated, true)
  assert.equal(client.getQueryState(['league', 'seasons/s2/games?status=scheduled'])?.isInvalidated, true)
  assert.equal(client.getQueryState(['league', 'seasons/s3/standings'])?.isInvalidated, false)
  assert.equal(client.getQueryState(['league', 'leagues/l1/venues'])?.isInvalidated, false)
  await applyLeagueMutation(client, 'leagues/l1/venues', 'POST', {}, { id: 'v1', league_id: 'l1' })
  assert.equal(client.getQueryState(['league', 'leagues/l1/venues'])?.isInvalidated, true)
  assert.equal(client.getQueryState(['league', 'organizations/o1/venues'])?.isInvalidated, true)
  client.clear()
})

test('other-tab changes invalidate matching queries and session changes clear the cache', async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { value: {}, configurable: true })
  const client = makeQueryClient()
  client.setQueryData(['league', 'seasons/s1/standings'], [])
  client.setQueryData(['league', 'seasons/s2/standings'], [])
  let sessions = 0
  const stop = subscribeToCacheChanges(client, () => { sessions++ })
  const otherTab = new BroadcastChannel('shotclock-cache-v1')
  try {
    otherTab.postMessage({ senderId: 'another-tab', type: 'league-change', change: { kind: 'game', action: 'score', seasonId: 's1' } })
    await new Promise<void>((resolve) => setTimeout(resolve, 50))
    assert.equal(client.getQueryState(['league', 'seasons/s1/standings'])?.isInvalidated, true)
    assert.equal(client.getQueryState(['league', 'seasons/s2/standings'])?.isInvalidated, false)
    otherTab.postMessage({ senderId: 'another-tab', type: 'session-change' })
    await new Promise<void>((resolve) => setTimeout(resolve, 50))
    assert.equal(sessions, 1)
    assert.equal(client.getQueryCache().getAll().length, 0)
  } finally {
    otherTab.close(); stop(); client.clear()
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})

test('season and venue edits invalidate dependent views without refreshing other leagues', async () => {
  const client = makeQueryClient()
  client.setQueryData(['league', 'organizations/o1/leagues'], [{ id: 'l1' }])
  client.setQueryData(['league', 'leagues/l1/seasons'], [{ id: 's1' }, { id: 's2' }])
  client.setQueryData(['league', 'season-teams/st1'], { season_id: 's1' })
  client.setQueryData(['league', 'season-teams/st3'], { season_id: 's3' })
  for (const path of ['organizations/o1/seasons?page=1', 'organizations/o1/teams', 'seasons/s1', 'seasons/s3', 'leagues/l1/venues', 'seasons/s1/games', 'seasons/s2/dashboard', 'seasons/s3/games']) client.setQueryData(['league', path], [])
  await applyLeagueMutation(client, 'venues/v1', 'PATCH', {}, { league_id: 'l1' })
  assert.equal(client.getQueryState(['league', 'seasons/s1/games'])?.isInvalidated, true)
  assert.equal(client.getQueryState(['league', 'seasons/s2/dashboard'])?.isInvalidated, true)
  assert.equal(client.getQueryState(['league', 'seasons/s3/games'])?.isInvalidated, false)
  await applyLeagueMutation(client, 'seasons/s1', 'PATCH', {}, { league_id: 'l1' })
  assert.equal(client.getQueryState(['league', 'organizations/o1/seasons?page=1'])?.isInvalidated, true)
  assert.equal(client.getQueryState(['league', 'organizations/o1/teams'])?.isInvalidated, true)
  assert.equal(client.getQueryState(['league', 'seasons/s1'])?.isInvalidated, true)
  assert.equal(client.getQueryState(['league', 'seasons/s3'])?.isInvalidated, false)
  assert.equal(client.getQueryState(['league', 'season-teams/st1'])?.isInvalidated, true)
  assert.equal(client.getQueryState(['league', 'season-teams/st3'])?.isInvalidated, false)
  client.clear()
})


test('draft registration corrections refresh affected team and roster views', async () => {
  const client = makeQueryClient()
  for (const path of ['organizations/o1/teams', 'leagues/l1/teams', 'seasons/s1/teams', 'seasons/s1/standings', 'seasons/s1/dashboard', 'season-teams/st1', 'season-teams/st1/roster', 'seasons/s2/standings']) client.setQueryData(['league', path], {})
  await applyLeagueMutation(client, 'season-teams/st1', 'PATCH', { divisionId: 'd2' }, { id: 'st1', season_id: 's1', league_id: 'l1', team_id: 't1' })
  for (const path of ['organizations/o1/teams', 'leagues/l1/teams', 'seasons/s1/teams', 'seasons/s1/standings', 'seasons/s1/dashboard', 'season-teams/st1']) assert.equal(client.getQueryState(['league', path])?.isInvalidated, true, path)
  assert.equal(client.getQueryState(['league', 'seasons/s2/standings'])?.isInvalidated, false)
  await applyLeagueMutation(client, 'rosters/r1', 'DELETE', undefined, { season_team_id: 'st1' })
  assert.equal(client.getQueryState(['league', 'season-teams/st1/roster'])?.isInvalidated, true)
  client.clear()
})

test('schedule previews do not invalidate, while saves and game changes refresh schedule status', async () => {
  const client = makeQueryClient()
  client.setQueryData(['league', 'seasons/s1/divisions'], [{ id: 'd1', season_id: 's1' }])
  const paths = ['divisions/d1/schedule/status', 'divisions/d2/schedule/status', 'seasons/s1/games?page=1', 'seasons/s1/dashboard', 'seasons/s1/standings', 'seasons/s2/games', 'organizations/o1/leagues']
  for (const path of paths) client.setQueryData(['league', path], [])
  await applyLeagueMutation(client, 'divisions/d1/schedule/preview', 'POST', {}, {})
  await applyLeagueMutation(client, 'divisions/d1/playoffs/preview', 'POST', {}, {})
  assert.deepEqual(paths.filter((path) => client.getQueryState(['league', path])?.isInvalidated), [])
  await applyLeagueMutation(client, 'divisions/d1/schedule', 'POST', {}, {})
  assert.deepEqual(paths.filter((path) => client.getQueryState(['league', path])?.isInvalidated), ['divisions/d1/schedule/status', 'seasons/s1/games?page=1', 'seasons/s1/dashboard', 'seasons/s1/standings'])
  client.clear()
})

test('game deletion and scoring refresh schedule status even with empty responses', async () => {
  const client = makeQueryClient()
  for (const path of ['divisions/d1/schedule/status', 'divisions/d2/schedule/status', 'seasons/s1/games', 'seasons/s1/standings', 'seasons/s1/dashboard']) client.setQueryData(['league', path], [])
  await applyLeagueMutation(client, 'games/g1', 'DELETE', undefined, {})
  for (const path of ['divisions/d1/schedule/status', 'divisions/d2/schedule/status', 'seasons/s1/games', 'seasons/s1/standings', 'seasons/s1/dashboard']) assert.equal(client.getQueryState(['league', path])?.isInvalidated, true, path)
  client.clear()
})

test('playoff saves and final scores invalidate the affected division status', async () => {
  const client = makeQueryClient()
  client.setQueryData(['league', 'seasons/s1/divisions'], [{ id: 'd1' }])
  for (const path of ['divisions/d1/schedule/status', 'divisions/d2/schedule/status', 'seasons/s1/games', 'seasons/s1/standings']) client.setQueryData(['league', path], [])
  await applyLeagueMutation(client, 'divisions/d1/playoffs', 'POST', {}, {})
  assert.equal(client.getQueryState(['league', 'divisions/d1/schedule/status'])?.isInvalidated, true)
  assert.equal(client.getQueryState(['league', 'divisions/d2/schedule/status'])?.isInvalidated, false)
  client.setQueryData(['league', 'divisions/d1/schedule/status'], [])
  await applyLeagueMutation(client, 'games/g1/score', 'POST', {}, { season_id: 's1', division_id: 'd1' })
  assert.equal(client.getQueryState(['league', 'divisions/d1/schedule/status'])?.isInvalidated, true)
  assert.equal(client.getQueryState(['league', 'seasons/s1/standings'])?.isInvalidated, true)
  client.clear()
})

test('forfeits refresh the same scoped queries as scores', async () => {
  const client = makeQueryClient()
  const paths = ['divisions/d1/schedule/status', 'divisions/d2/schedule/status', 'seasons/s1/games', 'seasons/s1/standings', 'seasons/s1/dashboard', 'seasons/s2/games', 'organizations/o1/leagues']
  for (const path of paths) client.setQueryData(['league', path], [])
  await applyLeagueMutation(client, 'games/g1/forfeit', 'POST', { forfeitingTeamId: 't1' }, { season_id: 's1', division_id: 'd1' })
  assert.deepEqual(paths.filter((path) => client.getQueryState(['league', path])?.isInvalidated), ['divisions/d1/schedule/status', 'seasons/s1/games', 'seasons/s1/standings', 'seasons/s1/dashboard'])
  client.clear()
})

test('editing a game refreshes only its own schedule history', async () => {
  const client = makeQueryClient()
  for (const path of ['games/g1/schedule-history', 'games/g2/schedule-history']) client.setQueryData(['league', path], [])
  await applyLeagueMutation(client, 'games/g1', 'PATCH', {}, { season_id: 's1' })
  assert.equal(client.getQueryState(['league', 'games/g1/schedule-history'])?.isInvalidated, true)
  assert.equal(client.getQueryState(['league', 'games/g2/schedule-history'])?.isInvalidated, false)
  client.clear()
})
