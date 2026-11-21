import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readGamesView, saveGamesView } from '../lib/games-view.ts'

const memory = () => { const values = new Map<string, string>(); return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } } }

test('the games view defaults to the list and remembers week, month or bracket', () => {
  const storage = memory()
  assert.equal(readGamesView(storage), 'list')
  saveGamesView('month', storage)
  assert.equal(readGamesView(storage), 'month')
  saveGamesView('bracket', storage)
  assert.equal(readGamesView(storage), 'bracket')
  storage.setItem('shotclock:games-view', 'year')
  assert.equal(readGamesView(storage), 'list')
})
