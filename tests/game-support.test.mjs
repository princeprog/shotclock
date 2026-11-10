import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'

const require = createRequire(import.meta.url)

function loadComponent(file, { selection = '', query = {}, request = async () => {} } = {}) {
  let queryOptions
  const source = readFileSync(new URL(`../components/${file}.tsx`, import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const context = { exports: {}, require(name) {
    if (name === 'react') return { useState: () => [selection, () => {}], useRef: () => ({ current: false }) }
    if (name === '@tanstack/react-query') return {
      useQueryClient: () => 'client',
      useQuery: (options) => { queryOptions = options; return query },
      useMutation: ({ mutationFn }) => ({ isPending: false, isError: false, mutateAsync: mutationFn }),
    }
    if (name === '@/lib/league-client') return { leagueRequest: request }
    if (name.startsWith('@/components/ui/')) return new Proxy({}, { get: (_target, key) => key })
    return require(name)
  } }
  vm.runInNewContext(compiled, context)
  return { ...context.exports, getQueryOptions: () => queryOptions }
}

function nodes(element) {
  if (element == null || typeof element === 'boolean') return []
  if (Array.isArray(element)) return element.flatMap(nodes)
  if (typeof element !== 'object') return [element]
  return [element, ...nodes(element.props?.children)]
}

test('forfeit form sends the absent registration and shows the opposite winner', async () => {
  const calls = []
  const pending = []
  let saved = false
  const { GameForfeitDialog } = loadComponent('game-forfeit-dialog', { selection: 'home-id', request: async (...args) => { calls.push(args) } })
  const tree = GameForfeitDialog({ game: { id: 'g1', home_name: 'Home', away_name: 'Away', home_season_team_id: 'home-id', away_season_team_id: 'away-id' }, onClose() {}, onSaved() { saved = true }, onPendingChange(value) { pending.push(value) } })
  const text = nodes(tree).filter((node) => typeof node === 'string').join(' ')
  assert.match(text, /Away.*20–0/)
  await nodes(tree).find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} })
  assert.equal(calls[0][0], 'games/g1/forfeit')
  assert.equal(calls[0][1], 'client')
  assert.equal(calls[0][2], 'POST')
  assert.equal(calls[0][3].forfeitingTeamId, 'home-id')
  assert.deepEqual(pending, [true, false])
  assert.equal(saved, true)
})

test('forfeit failure clears pending without reporting a save', async () => {
  const pending = []
  let saved = false
  const { GameForfeitDialog } = loadComponent('game-forfeit-dialog', { selection: 'away-id', request: async () => { throw new Error('Rejected') } })
  const tree = GameForfeitDialog({ game: { id: 'g1', home_name: 'Home', away_name: 'Away', home_season_team_id: 'home-id', away_season_team_id: 'away-id' }, onClose() {}, onSaved() { saved = true }, onPendingChange(value) { pending.push(value) } })
  assert.match(nodes(tree).filter((node) => typeof node === 'string').join(' '), /Home.*20–0/)
  await nodes(tree).find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} })
  assert.deepEqual(pending, [true, false])
  assert.equal(saved, false)
})

test('history queries the game and displays newest changes and changed durations', () => {
  const older = { id: 'old', changed_at: '2026-01-01T10:00:00Z', old_scheduled_at: '2026-01-01T09:00:00Z', new_scheduled_at: '2026-01-02T09:00:00Z', old_venue_name: 'Old court', new_venue_name: 'New court', old_duration_minutes: 60, new_duration_minutes: 90 }
  const newer = { ...older, id: 'new', changed_at: '2026-01-03T10:00:00Z', old_venue_name: 'Newest court', old_duration_minutes: 90 }
  const { GameScheduleHistory, getQueryOptions } = loadComponent('game-schedule-history', { query: { data: [older, newer] } })
  const tree = GameScheduleHistory({ gameId: 'g1' })
  assert.equal(getQueryOptions().queryKey[1], 'games/g1/schedule-history')
  const all = nodes(tree)
  const text = all.filter((node) => typeof node === 'string').join(' ')
  assert.ok(text.indexOf('Newest court') < text.indexOf('Old court'))
  assert.match(text, /60 min/)
  assert.match(text, /90 min/)
  assert.equal(all.filter((node) => node === 'Duration: ').length, 2)
})

test('history provides loading, empty, and error states', () => {
  for (const [query, expected] of [[{ isPending: true }, 'Loading schedule history'], [{ data: [] }, 'No schedule changes yet'], [{ isError: true, error: new Error('Unable to load') }, 'Unable to load']]) {
    const { GameScheduleHistory } = loadComponent('game-schedule-history', { query })
    const text = nodes(GameScheduleHistory({ gameId: 'g1' })).filter((node) => typeof node === 'string').join(' ')
    assert.ok(text.includes(expected), expected)
  }
})
