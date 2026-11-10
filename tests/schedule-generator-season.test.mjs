import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const source = readFileSync(new URL('../components/schedule-generator.tsx', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
const game = (divisionId, divisionName, round, homeName) => ({ divisionId, divisionName, round, homeName, awayName: 'Away', homeTeamId: homeName, awayTeamId: 'away', stage: 'preliminary', scheduledAt: '2026-01-05T01:00:00.000Z', venueId: 'court', durationMinutes: 60 })
const response = { games: [game('b', 'Boys', 2, 'B2'), game('a', 'Adults', 1, 'A1'), game('b', 'Boys', 1, 'B1')], warnings: ['Check availability'], divisions: [{ id: 'b', name: 'Boys', teamCount: 4, playoffs: true }, { id: 'a', name: 'Adults', teamCount: 3, playoffs: false }, { id: 'c', name: 'Junior', teamCount: 1, reason: 'Not enough teams' }] }
function nodes(element) {
  if (element == null || typeof element === 'boolean') return []
  if (Array.isArray(element)) return element.flatMap(nodes)
  if (typeof element !== 'object') return [element]
  return [element, ...nodes(element.props?.children)]
}
function harness(mode = 'preliminary', result = response) {
  const state = []; let cursor = 0; const calls = []
  const context = { exports: {}, require(name) {
    if (name === 'react') return {
      useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], (value) => { state[i] = typeof value === 'function' ? value(state[i]) : value }] },
      useRef(initial) { const i = cursor++; return state[i] ??= { current: initial } },
      useEffect() {}, useSyncExternalStore() { return 'Asia/Manila' },
    }
    if (name === '@tanstack/react-query') return { useQueryClient: () => 'client', useMutation: (options) => ({ isPending: false, isError: false, reset() {}, async mutate(input) { try { const value = await options.mutationFn(input); options.onSuccess?.(value, input) } catch (error) { options.onError?.(error) } } }) }
    if (name === '@/lib/league-client') return { leagueRequest: async (...args) => { calls.push(args); return args[0].endsWith('/preview') ? result : {} } }
    if (name.startsWith('@/components/ui/')) return new Proxy({}, { get: (_target, key) => key })
    if (name === '@/lib/game-time') return { joinGameTime: () => '', splitGameTime: () => ({}) }
    return require(name)
  } }
  vm.runInNewContext(compiled, context)
  const props = { seasonId: 's1', seasonName: 'Summer', seasonStart: '2026-01-01', seasonEnd: '2026-02-01', venues: [{ id: 'court', name: 'Court' }, { id: 'court2', name: 'Court 2' }], mode, onClose() {}, onSaved() {} }
  const render = () => { cursor = 0; return nodes(context.exports.ScheduleGenerator(props)) }
  const setup = () => {
    let tree = render()
    tree.find((n) => n.type === 'ToggleGroup').props.onValueChange(['1'])
    tree = render()
    tree.find((n) => n.type === 'label' && nodes(n).includes('Court')).props.children[0].props.onCheckedChange(true)
  }
  const preview = async () => { await render().find((n) => n.type === 'form').props.onSubmit({ preventDefault() {} }); await new Promise(setImmediate) }
  return { render, setup, preview, calls, props }
}

test('season preview uses shared options and shows divisions, skipped reasons and grouped games', async () => {
  const h = harness(); h.setup()
  let tree = h.render()
  tree.find((n) => n.type === 'label' && nodes(n).includes('Include playoffs')).props.children[0].props.onCheckedChange(true)
  await h.preview(); tree = h.render()
  assert.equal(h.calls[0][0], 'seasons/s1/schedule/preview')
  assert.equal(h.calls[0][3].playoffs, true)
  const text = tree.filter((n) => typeof n === 'string' || typeof n === 'number').join(' ').replace(/\s+/g, ' ')
  for (const value of ['Boys', 'Adults', 'Junior', 'Not enough teams', 'Check availability', '3', 'Round 1', 'Round 2']) assert.ok(text.includes(value), value)
  const adults = tree.find((n) => n.type === 'section' && n.props['aria-labelledby'] === 'schedule-division-a')
  assert.match(nodes(adults).filter((n) => typeof n === 'string').join(' '), /four teams/i)
  assert.ok(text.indexOf('Boys') < text.indexOf('B1'))
  assert.ok(text.indexOf('B1') < text.indexOf('B2'))
  assert.ok(text.indexOf('B2') < text.indexOf('Adults'))
})

test('save keeps preview order, exact included divisions and edits, without display names', async () => {
  const h = harness(); h.setup()
  h.render().find((n) => n.type === 'label' && nodes(n).includes('Court 2')).props.children[0].props.onCheckedChange(true)
  await h.preview()
  let tree = h.render()
  const date = tree.find((n) => n.type?.name === 'ScheduleDate' && n.props.id === 'schedule-game-date-0')
  date.props.onChange('2026-01-06')
  tree = h.render()
  tree.find((n) => n.type === 'Select' && n.props.value === 'court' && nodes(n).some((child) => child.props?.id === 'schedule-game-venue-0')).props.onValueChange('court2')
  tree = h.render()
  tree.find((n) => n.type === 'Button' && nodes(n).includes('Save schedule')).props.onClick()
  await new Promise(setImmediate)
  const [path, , , body] = h.calls[1]
  assert.equal(path, 'seasons/s1/schedule')
  assert.equal(JSON.stringify(body.availability), JSON.stringify(h.calls[0][3].availability))
  assert.deepEqual(Array.from(body.divisionIds), ['b', 'a'])
  assert.deepEqual(Array.from(body.games, (g) => g.homeTeamId), ['B2', 'A1', 'B1'])
  assert.equal(body.games[0].divisionId, 'b')
  assert.equal(body.games[0].venueId, 'court2')
  assert.equal(body.games[0].scheduledAt, '2026-01-06T01:00:00.000Z')
  for (const g of body.games) for (const key of ['divisionName', 'homeName', 'awayName']) assert.equal(key in g, false)
})

test('playoffs uses season endpoint and input changes invalidate the preview', async () => {
  const h = harness('playoffs'); h.setup(); await h.preview()
  assert.equal(h.calls[0][0], 'seasons/s1/playoffs/preview')
  assert.deepEqual(Object.keys(h.calls[0][3]), ['availability'])
  let tree = h.render()
  tree.find((n) => n.type === 'Input' && n.props.id === 'schedule-duration').props.onChange({ target: { value: '90' } })
  tree = h.render()
  assert.equal(tree.some((n) => n.type === 'Button' && nodes(n).includes('Save schedule')), false)
})


test('playoff save uses the included divisions and the playoff season route', async () => {
  const h = harness('playoffs'); h.setup(); await h.preview()
  h.render().find((n) => n.type === 'Button' && nodes(n).includes('Save schedule')).props.onClick()
  await new Promise(setImmediate)
  assert.equal(h.calls[1][0], 'seasons/s1/playoffs')
  assert.deepEqual(Object.keys(h.calls[1][3]).sort(), ['availability', 'divisionIds', 'games'])
  assert.deepEqual(Array.from(h.calls[1][3].divisionIds), ['b', 'a'])
})

test('preview cannot be saved after switching seasons', async () => {
  const h = harness(); h.setup(); await h.preview()
  h.props.seasonId = 's2'
  const tree = h.render()
  assert.equal(tree.some((n) => n.type === 'Button' && nodes(n).includes('Save schedule')), false)
})

test('rejects a preview that assigns a game to a skipped division', async () => {
  const bad = { ...response, games: [game('c', 'Junior', 1, 'A')] }
  const h = harness('preliminary', bad); h.setup(); await h.preview()
  const tree = h.render()
  assert.ok(tree.includes('The preview contained incomplete game details. Please try again.'))
  assert.equal(tree.some((n) => n.type === 'Button' && nodes(n).includes('Save schedule')), false)
})
