import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calendarDays, defaultAnchor, groupGamesByDay, isInMonth, periodLabel, shiftAnchor } from '../lib/games-calendar.ts'

const game = (id: string, scheduled_at: string) => ({ id, scheduled_at, status: 'scheduled', home_name: 'A', away_name: 'B', home_score: null, away_score: null, division_name: 'Open', venue_name: null, forfeited_by_season_team_id: null })

test('weeks run Sunday to Saturday, including across month and year boundaries', () => {
  assert.deepEqual(calendarDays('week', '2026-11-19'), ['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21'])
  const yearEnd = calendarDays('week', '2026-12-31')
  assert.equal(yearEnd[0], '2026-12-27')
  assert.equal(yearEnd[6], '2027-01-02')
})

test('month grids cover the full weeks that contain the month', () => {
  const november = calendarDays('month', '2026-11-19')
  assert.equal(november.length, 35)
  assert.equal(november[0], '2026-11-01')
  assert.equal(november.at(-1), '2026-12-05')
  assert.equal(calendarDays('month', '2026-08-10').length, 42)
  assert.equal(isInMonth('2026-12-05', '2026-11-19'), false)
  assert.equal(isInMonth('2026-11-30', '2026-11-19'), true)
})

test('moving by week or month keeps valid dates', () => {
  assert.equal(shiftAnchor('week', '2026-11-19', 1), '2026-11-26')
  assert.equal(shiftAnchor('week', '2026-11-19', -1), '2026-11-12')
  assert.equal(shiftAnchor('month', '2026-01-31', 1), '2026-02-28')
  assert.equal(shiftAnchor('month', '2026-01-15', -1), '2025-12-15')
})

test('period labels stay short and name both months or years when a week spans them', () => {
  assert.equal(periodLabel('week', '2026-11-19'), 'Nov 15 – 21, 2026')
  assert.equal(periodLabel('week', '2026-12-01'), 'Nov 29 – Dec 5, 2026')
  assert.equal(periodLabel('week', '2026-12-31'), 'Dec 27, 2026 – Jan 2, 2027')
  assert.equal(periodLabel('month', '2026-11-19'), 'November 2026')
})

test('games group by their day in the league time zone, in time order', () => {
  const groups = groupGamesByDay([game('late', '2026-11-19T15:30:00Z'), game('early', '2026-11-19T10:46:00Z'), game('none', null as unknown as string)], 'Asia/Manila')
  assert.deepEqual([...groups.keys()], ['2026-11-19'])
  assert.deepEqual(groups.get('2026-11-19')?.map((item) => item.id), ['early', 'late'])
  const nextDay = groupGamesByDay([game('midnight', '2026-11-19T16:30:00Z')], 'Asia/Manila')
  assert.deepEqual([...nextDay.keys()], ['2026-11-20'])
})

test('the calendar opens on today within the season, otherwise on the nearest season edge', () => {
  const season = { start_date: '2026-10-17', end_date: '2026-12-26' }
  assert.equal(defaultAnchor(season, '2026-11-17'), '2026-11-17')
  assert.equal(defaultAnchor(season, '2026-09-01'), '2026-10-17')
  assert.equal(defaultAnchor(season, '2027-02-01'), '2026-12-26')
  assert.equal(defaultAnchor({ start_date: null, end_date: null }, '2026-11-17'), '2026-11-17')
})
