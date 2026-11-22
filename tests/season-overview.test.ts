import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildAttentionItems, buildSetupSteps, dayLabel, groupGamesByDay, seasonDay, type OverviewDivision, type SeasonOverviewData } from '../lib/season-overview.ts'

const division = (values: Partial<OverviewDivision>): OverviewDivision => ({ id: 'd', name: 'Open', teams: 4, players: 40, games: 6, completedGames: 0, scheduled: true, playoffs: null, standings: [], ...values })
const overview = (values: Partial<SeasonOverviewData> = {}): SeasonOverviewData => ({
  totals: { divisions: 1, teams: 4, players: 40, venues: 1, games: 6, completedGames: 0 },
  live: [], upcoming: [], awaitingResults: { count: 0, games: [] }, recent: [], shortRosters: { count: 0, teams: [] },
  divisions: [division({})], ...values,
})

test('attention items list missing scores, schedules, rosters and venues in order', () => {
  const items = buildAttentionItems(overview({
    totals: { divisions: 2, teams: 6, players: 40, venues: 0, games: 6, completedGames: 0 },
    awaitingResults: { count: 2, games: [] },
    shortRosters: { count: 1, teams: [{ seasonTeamId: 's', name: 'Bala', divisionName: 'Open', players: 3 }] },
    divisions: [division({}), division({ id: 'e', name: 'Seniors', teams: 2, scheduled: false })],
  }), 'Christmas League')
  assert.deepEqual(items.map((item) => item.key), ['scores', 'schedule', 'rosters', 'venues'])
  assert.equal(items[0].title, '2 games need a final score')
  assert.equal(items[1].detail, 'Seniors')
  assert.equal(items[2].title, '1 team has fewer than 5 players')
  assert.equal(items[3].title, 'No venues for Christmas League')
})

test('a season with nothing to fix has no attention items', () => {
  assert.deepEqual(buildAttentionItems(overview(), 'League'), [])
})

test('divisions with fewer than two teams do not need a schedule', () => {
  assert.deepEqual(buildAttentionItems(overview({ divisions: [division({ teams: 1, scheduled: false })] }), 'League'), [])
})

test('setup steps follow what the draft season already has', () => {
  const empty = buildSetupSteps(overview({ totals: { divisions: 0, teams: 0, players: 0, venues: 0, games: 0, completedGames: 0 }, divisions: [] }), '2026-11-30', '2026-11-22')
  assert.deepEqual(empty.map((step) => step.done), [false, false, false, false, false])
  const ready = buildSetupSteps(overview(), '2026-11-30', '2026-12-01')
  assert.deepEqual(ready.map((step) => step.done), [true, true, true, true, false])
  assert.match(ready[4].detail, /start date has passed/)
  const unscheduled = buildSetupSteps(overview({ divisions: [division({ scheduled: false })] }), null, '2026-11-22')
  assert.equal(unscheduled[3].done, false)
})

test('games group under league-zone days with Today and Tomorrow labels', () => {
  const games = [
    { id: 'a', scheduled_at: '2026-11-22T01:00:00Z' },
    { id: 'b', scheduled_at: '2026-11-22T16:30:00Z' },
    { id: 'c', scheduled_at: '2026-11-23T17:00:00Z' },
    { id: 'd', scheduled_at: null },
  ]
  const groups = groupGamesByDay(games, 'Asia/Manila', '2026-11-22')
  assert.deepEqual(groups.map((group) => [group.label, group.games.map((game) => game.id)]), [
    ['Today', ['a']],
    ['Tomorrow', ['b']],
    [dayLabel('2026-11-24', '2026-11-22'), ['c']],
    ['Date not scheduled', ['d']],
  ])
})

test('season day counts inclusive calendar days inside the season dates', () => {
  assert.deepEqual(seasonDay('2026-11-30', '2026-12-31', '2026-12-04'), { day: 5, total: 32 })
  assert.equal(seasonDay('2026-11-30', '2026-12-31', '2026-11-29'), null)
  assert.equal(seasonDay(null, '2026-12-31', '2026-12-04'), null)
})

