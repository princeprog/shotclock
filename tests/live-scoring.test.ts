import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clockRemaining, deviceId, formatClock, nextBatch, periodLabel, readOutbox, saveOutbox, withPending, type LiveState, type OutboxItem } from '../lib/live-scoring.ts'

function memoryStorage() {
  const values = new Map<string, string>()
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
}
const player = (rosterId: string, name: string) => ({ rosterId, name, jersey: 1, points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, turnovers: 0, fouls: 0 })
const state: LiveState = {
  gameId: 'g', status: 'live', version: 3, stage: 'preliminary', scheduledAt: null, leagueName: 'L', seasonName: 'S', divisionName: 'D', venueName: null, timeZone: null, seasonStatus: 'active',
  format: { periodCount: 4, periodMinutes: 10, overtimeMinutes: 5, bonusFouls: 2 }, period: 2, clock: { remainingMs: 300000, running: false, serverTime: '2026-11-22T00:00:00.000Z' },
  home: { seasonTeamId: 'h', name: 'Home', score: 10, teamFouls: 1, timeouts: 0, inBonus: false, players: [player('h1', 'Ana Cruz')] },
  away: { seasonTeamId: 'a', name: 'Away', score: 8, teamFouls: 0, timeouts: 0, inBonus: false, players: [player('a1', 'Ben Lim')] },
  periodScores: [], finalScore: null, bestPlayer: null, plays: [{ id: 'p1', sequence: 5, kind: 'points', points: 3, seasonTeamId: 'h', rosterId: 'h1', player: 'Ana Cruz', period: 2, clockMs: 310000, voided: false }], scorer: null, live: true,
}
const play = (id: string, kind: 'points' | 'foul' | 'timeout', team: string, rosterId?: string, points?: number): OutboxItem => ({ type: 'play', play: { id, kind, ...(points ? { points } : {}), seasonTeamId: team, ...(rosterId ? { rosterId } : {}), period: 2, clockMs: 290000, recordedAt: '2026-11-22T00:00:01.000Z' } })

test('queued plays update the score, fouls, bonus and recent plays', () => {
  const view = withPending(state, [play('q1', 'points', 'a', 'a1', 2), play('q2', 'foul', 'h', 'h1'), play('q3', 'timeout', 'a')])
  assert.equal(view.away.score, 10)
  assert.equal(view.away.players[0].points, 2)
  assert.equal(view.home.teamFouls, 2)
  assert.equal(view.home.players[0].fouls, 1)
  assert.equal(view.away.inBonus, true)
  assert.equal(view.away.timeouts, 1)
  assert.deepEqual(view.plays.slice(0, 3).map((item) => [item.id, item.pending]), [['q3', true], ['q2', true], ['q1', true]])
})

test('a queued undo reverses a saved play once', () => {
  const view = withPending(state, [{ type: 'void', eventId: 'p1' }, { type: 'void', eventId: 'p1' }])
  assert.equal(view.home.score, 7)
  assert.equal(view.home.players[0].points, -3)
  assert.equal(view.plays[0].voided, true)
})

test('the latest queued clock change wins', () => {
  const view = withPending(state, [{ type: 'clock', running: true, remainingMs: 280000, at: '2026-11-22T00:00:05.000Z' }])
  assert.deepEqual(view.clock, { remainingMs: 280000, running: true, serverTime: '2026-11-22T00:00:05.000Z' })
  assert.equal(clockRemaining(view.clock, 1000, 3500), 277500)
  assert.equal(clockRemaining({ remainingMs: 1000, running: true, serverTime: '' }, 0, 5000), 0)
  assert.equal(clockRemaining(state.clock, 0, 99999), 300000)
})

test('plays are sent together until an undo or clock change', () => {
  const items: OutboxItem[] = [play('1', 'foul', 'h', 'h1'), play('2', 'foul', 'h', 'h1'), { type: 'void', eventId: '1' }, play('3', 'foul', 'h', 'h1')]
  assert.deepEqual(nextBatch(items)?.items.map((item) => item.type), ['play', 'play'])
  assert.deepEqual(nextBatch(items.slice(2))?.items.map((item) => item.type), ['void'])
  assert.equal(nextBatch([]), null)
  assert.equal(nextBatch(Array.from({ length: 150 }, (_, index) => play(String(index), 'foul', 'h', 'h1')))?.items.length, 100)
})

test('the queue and device ID survive a reload', () => {
  const storage = memoryStorage()
  const items = [play('1', 'foul', 'h', 'h1')]
  saveOutbox('g', items, storage)
  assert.deepEqual(readOutbox('g', storage), items)
  saveOutbox('g', [], storage)
  assert.deepEqual(readOutbox('g', storage), [])
  const id = deviceId(storage, () => '11111111-1111-4111-8111-111111111111')
  assert.equal(deviceId(storage, () => 'other'), id)
})

test('clock and period labels read like a scoreboard', () => {
  assert.equal(formatClock(600000), '10:00')
  assert.equal(formatClock(61001), '1:02')
  assert.equal(formatClock(59999), '59.9')
  assert.equal(formatClock(0), '0.0')
  assert.equal(periodLabel(2, 4), 'Q2')
  assert.equal(periodLabel(1, 2), 'H1')
  assert.equal(periodLabel(5, 4), 'OT')
  assert.equal(periodLabel(6, 4), 'OT2')
})

