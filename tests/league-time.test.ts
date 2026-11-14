import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatGameTime, zonedDate, zonedDayStart, zonedInput, zonedInstant } from '../lib/league-time.ts'

test('groups and labels games by the league zone, independently of the browser zone', () => {
  const tipOff = '2027-01-09T17:00:00.000Z'
  assert.equal(zonedDate(tipOff, 'Asia/Manila'), '2027-01-10')
  assert.equal(zonedDate(tipOff, 'America/New_York'), '2027-01-09')
  assert.equal(formatGameTime('2027-01-09T11:00:00.000Z', 'Asia/Manila').replace(/\s/g, ' '), '7:00 PM')
  assert.equal(zonedInput(tipOff, 'Asia/Manila'), '2027-01-10T01:00')
})

test('date filters start each day at midnight in the league zone', () => {
  assert.equal(zonedDayStart('2027-01-10', 'Asia/Manila'), '2027-01-09T16:00:00.000Z')
  assert.equal(zonedDayStart('2027-07-04', 'America/New_York'), '2027-07-04T04:00:00.000Z')
})

test('entered wall times convert in the league zone and skip daylight-saving gaps', () => {
  assert.equal(zonedInstant('2027-01-10T19:30', 'Asia/Manila'), '2027-01-10T11:30:00.000Z')
  assert.equal(zonedInstant('2026-03-08T02:30', 'America/New_York'), '2026-03-08T07:30:00.000Z')
})

