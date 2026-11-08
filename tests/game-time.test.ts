import { test } from 'node:test'
import assert from 'node:assert/strict'
import { joinGameTime, splitGameTime } from '../lib/game-time.ts'

test('game times preserve midnight, noon and individual minutes', () => {
  for (const time of ['00:00', '00:59', '11:45', '12:00', '12:59', '23:59']) {
    const { hour, minute, period } = splitGameTime(time)
    assert.equal(joinGameTime(hour, minute, period), time)
  }
  assert.deepEqual(splitGameTime('00:00'), { hour: '12', minute: '00', period: 'AM' })
  assert.deepEqual(splitGameTime('12:00'), { hour: '12', minute: '00', period: 'PM' })
  assert.equal(joinGameTime('01', '', 'PM'), '')
  assert.equal(joinGameTime('13', '00', 'AM'), '')
})
