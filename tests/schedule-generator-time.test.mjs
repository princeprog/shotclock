import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../components/schedule-generator.tsx', import.meta.url), 'utf8')
const file = ts.createSourceFile('schedule-generator.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const names = new Set(['formatInZone', 'resolveZonedTime', 'gameForSave', 'isOutsideSeason', 'formatWallTime', 'validateWindows'])
const helpers = file.statements.filter((statement) => ts.isFunctionDeclaration(statement) && statement.name && names.has(statement.name.text)).map((statement) => statement.getText(file)).join('\n')
const code = ts.transpileModule(`${helpers}\nglobalThis.helpers = { formatInZone, resolveZonedTime, gameForSave, isOutsideSeason, formatWallTime, validateWindows }`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
const context = vm.createContext({ Intl, Date, Set })
vm.runInContext(code, context)
const { formatInZone, resolveZonedTime, gameForSave, isOutsideSeason, formatWallTime, validateWindows } = context.helpers

test('preview summaries retain wall time across the browser daylight-saving transition', () => {
  const previous = process.env.TZ
  try {
    process.env.TZ = 'America/New_York'
    assert.equal(formatWallTime('2026-03-08T02:30'), 'Mar 8, 2026, 2:30 AM')
  } finally {
    if (previous === undefined) delete process.env.TZ
    else process.env.TZ = previous
  }
})

test('converts wall times in the selected zone, independently of the browser zone', () => {
  assert.equal(formatInZone('2026-01-01T12:30:00.000Z', 'Asia/Manila'), '2026-01-01T20:30')
  assert.equal(resolveZonedTime('2026-01-01T20:30', 'Asia/Manila'), '2026-01-01T12:30:00.000Z')
  assert.equal(resolveZonedTime('2026-07-01T12:30', 'America/New_York'), '2026-07-01T16:30:00.000Z')
  assert.equal(resolveZonedTime('2026-01-01T09:15', 'Asia/Kathmandu'), '2026-01-01T03:30:00.000Z')
})

test('saved games exclude display names and fit 992 games within the gateway limit', () => {
  const game = { homeTeamId: 'a'.repeat(36), awayTeamId: 'b'.repeat(36), homeName: 'A'.repeat(120), awayName: 'B'.repeat(120), round: 500, stage: 'preliminary', scheduledAt: '2026-01-01T12:30:00.000Z', venueId: 'c'.repeat(36), durationMinutes: 1440 }
  const saved = gameForSave(game, game.scheduledAt, game.venueId)
  assert.equal('homeName' in saved, false)
  assert.equal('awayName' in saved, false)
  const body = JSON.stringify({ availability: { startDate: '2026-01-01', endDate: '2027-12-31', windows: Array(20).fill({ weekdays: [0, 1, 2, 3, 4, 5, 6], startTime: '00:00', endTime: '23:59' }), timeZone: 'a'.repeat(100), venueIds: Array(100).fill(game.venueId), durationMinutes: 1440, restMinutes: 10080 }, format: 'double', playoffs: true, thirdPlace: true, games: Array(992).fill(saved) })
  assert.ok(Buffer.byteLength(body) <= 256 * 1024, `payload is ${Buffer.byteLength(body)} bytes`)
})

test('validates each recurring window and enforces the 20-window limit', () => {
  const good = { weekdays: [1, 3], startTime: '09:00', endTime: '17:00' }
  assert.equal(validateWindows([good, { ...good, weekdays: [6], startTime: '18:00', endTime: '22:00' }]), '')
  assert.notEqual(validateWindows([]), '')
  assert.notEqual(validateWindows(Array(21).fill(good)), '')
  assert.notEqual(validateWindows([{ ...good, weekdays: [] }]), '')
  assert.notEqual(validateWindows([{ ...good, startTime: '18:00', endTime: '17:00' }]), '')
  assert.notEqual(validateWindows([{ ...good, startTime: '25:00' }]), '')
})

test('rejects nonexistent and ambiguous daylight-saving wall times', () => {
  assert.equal(resolveZonedTime('2026-03-08T02:30', 'America/New_York'), null)
  assert.equal(resolveZonedTime('2026-11-01T01:30', 'America/New_York'), null)
  assert.equal(resolveZonedTime('2026-11-01T02:30', 'America/New_York'), '2026-11-01T07:30:00.000Z')
  assert.equal(resolveZonedTime('2026-10-04T02:15', 'Australia/Lord_Howe'), null)
  assert.equal(resolveZonedTime('2026-01-01T12:30', 'Not/A_Zone'), null)
})

test('outside-season warnings reflect edited local calendar dates and optional boundaries', () => {
  assert.equal(isOutsideSeason('2026-02-01T00:30', '2026-02-01', '2026-04-30'), false)
  assert.equal(isOutsideSeason('2026-01-31T23:30', '2026-02-01', '2026-04-30'), true)
  assert.equal(isOutsideSeason('2026-05-01T00:00', null, '2026-04-30'), true)
  assert.equal(isOutsideSeason('2026-03-01T09:00', null, null), false)
  assert.equal(isOutsideSeason('', '2026-02-01', '2026-04-30'), false)
})
