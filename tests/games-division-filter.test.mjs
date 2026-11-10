import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const source = readFileSync(new URL('../components/league-workspace.tsx', import.meta.url), 'utf8') + '\nexports.GamesManager = GamesManager; exports.Editor = Editor;'
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
const divisionStatuses = [{ id: 'd1', name: 'Open', teamCount: 1, canGeneratePreliminary: false, hasSchedule: false, playoffs: false, thirdPlace: false, playoffStage: null }, { id: 'd2', name: 'Youth', teamCount: 2, canGeneratePreliminary: true, hasSchedule: true, playoffs: true, thirdPlace: false, playoffStage: 'final' }]
const game = { id: 'g1', division_id: 'd2', division_name: 'Youth', home_name: 'A', away_name: 'B', home_season_team_id: 'a', away_season_team_id: 'b', scheduled_at: null, venue_id: null, venue_name: null, duration_minutes: 60, forfeited_by_season_team_id: null, status: 'scheduled', home_score: null, away_score: null }
const registrations = [{ id: 'a', name: 'A', team_id: 'a1', division_id: 'd2' }, { id: 'b', name: 'B', team_id: 'b1', division_id: 'd2' }]
const season = { id: 's1', name: 'Season', status: 'active', start_date: null, end_date: null }
const divisions = divisionStatuses.map(({ id, name }) => ({ id, name, season_id: 's1', min_age: null, max_age: null }))

function harness(statuses = divisionStatuses) {
  const states = []
  let index = 0
  const paths = []
  const context = { exports: {}, URLSearchParams, require(name) {
    if (name === 'react') return { ...require('react'), useState(initial) { const i = index++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], (next) => { states[i] = typeof next === 'function' ? next(states[i]) : next }] } }
    if (name === '@tanstack/react-query') return { useQueryClient: () => ({}), useMutation: () => ({ reset() {} }), useQuery: ({ queryKey, enabled }) => { const path = queryKey[1]; if (enabled !== false) paths.push(path); if (path.includes('/schedule/status')) return { isSuccess: true, data: { divisions: statuses } }; if (path.includes('/teams?')) return { isSuccess: true, data: registrations }; return { isSuccess: true, data: { items: [game], total: 1, page: 1, pageSize: 10 } } } }
    if (name === '@/lib/league-client') return { leagueRequest() {} }
    if (name === '@/lib/pagination') return { requirePaginatedResult: (value) => value }
    if (name.startsWith('@/')) return new Proxy({}, { get: (_target, key) => key })
    if (name === 'next/link') return { __esModule: true, default: 'Link' }
    return require(name)
  } }
  vm.runInNewContext(compiled, context)
  return { render() { index = 0; paths.length = 0; return context.exports.GamesManager({ season, divisions, venues: [] }) }, paths, Editor: context.exports.Editor }
}

function nodes(element) {
  if (element == null || typeof element === 'boolean') return []
  if (Array.isArray(element)) return element.flatMap(nodes)
  if (typeof element !== 'object') return [element]
  return [element, ...nodes(element.props?.children)]
}
function find(tree, predicate) { return nodes(tree).find((node) => typeof node === 'object' && predicate(node)) }
function text(tree) { return nodes(tree).filter((node) => typeof node === 'string').join(' ') }

test('games default to season scope and the division filter resets pagination without changing controls', () => {
  const h = harness()
  let tree = h.render()
  assert.match(h.paths.find((path) => path.includes('/games?')), /scope=season/)
  assert.match(text(tree), /Youth/)
  const pagination = find(tree, (node) => node.type === 'DataPagination')
  pagination.props.onPageChange(3)
  tree = h.render()
  const filter = find(tree, (node) => node.type === 'Choice' || (typeof node.type === 'function' && node.type.name === 'Choice'))
  filter.props.onChange('d1')
  tree = h.render()
  const path = h.paths.find((value) => value.includes('/games?'))
  assert.match(path, /divisionId=d1/)
  assert.match(path, /page=1/)
  const generator = find(tree, (node) => node.props?.children?.includes?.('Generate schedule'))
  assert.equal(generator.props.disabled, false)
})

test('manual scheduling selects a division and uses only its registrations', () => {
  const h = harness()
  let tree = h.render()
  find(tree, (node) => node.props?.children?.includes?.('Schedule game')).props.onClick()
  tree = h.render()
  const select = find(tree, (node) => node.props?.id === 'game-division')
  assert.ok(select)
  const choice = find(tree, (node) => node.type === 'Select' && node.props.onValueChange)
  choice.props.onValueChange('d2')
  tree = h.render()
  assert.ok(h.paths.includes('seasons/s1/teams?divisionId=d2'))
  const editor = find(tree, (node) => node.type === h.Editor)
  assert.equal(editor.props.fields[0].options.length, 2)
  const payload = editor.props.transform({ homeTeamId: 'a', awayTeamId: 'b', scheduledAt: '2026-11-10T12:00', venueId: '' })
  assert.equal(payload.homeTeamId, 'a')
  assert.equal(payload.awayTeamId, 'b')
  assert.equal('divisionId' in payload, false)
})

test('editing a game loads its own division regardless of the page filter', () => {
  const h = harness()
  let tree = h.render()
  find(tree, (node) => typeof node.type === 'function' && node.type.name === 'Choice').props.onChange('d1')
  tree = h.render()
  find(tree, (node) => node.props?.children?.includes?.('Edit schedule')).props.onClick()
  tree = h.render()
  assert.ok(h.paths.includes('seasons/s1/teams?divisionId=d2'))
  assert.equal(find(tree, (node) => node.type === h.Editor).props.fields[0].options.length, 2)
})

test('opening manual scheduling defaults to the filter and a later filter change keeps the dialog open', () => {
  const h = harness()
  let tree = h.render()
  find(tree, (node) => typeof node.type === 'function' && node.type.name === 'Choice').props.onChange('d2')
  tree = h.render()
  find(tree, (node) => node.props?.children?.includes?.('Schedule game')).props.onClick()
  tree = h.render()
  assert.equal(find(tree, (node) => node.type === 'Select' && node.props.onValueChange).props.value, 'd2')
  find(tree, (node) => typeof node.type === 'function' && node.type.name === 'Choice').props.onChange('d1')
  tree = h.render()
  assert.equal(find(tree, (node) => node.type === 'Select' && node.props.onValueChange).props.value, 'd2')
  assert.ok(find(tree, (node) => node.type === h.Editor))
})

test('unavailable season controls explain each division’s eligibility', () => {
  const statuses = [
    { ...divisionStatuses[0], preliminaryReason: 'Needs another team', playoffs: true, playoffReason: 'Finish semifinals' },
    { ...divisionStatuses[1], canGeneratePreliminary: false, preliminaryReason: 'Already scheduled', playoffStage: null, playoffReason: 'Finish preliminary games' },
  ]
  const tree = harness(statuses).render()
  assert.match(text(tree), /Needs another team/)
  assert.match(text(tree), /Already scheduled/)
  assert.match(text(tree), /Finish semifinals/)
  assert.match(text(tree), /Finish preliminary games/)
  assert.equal(find(tree, (node) => node.props?.children?.includes?.('Generate schedule')).props.disabled, true)
  assert.equal(find(tree, (node) => node.props?.children?.includes?.('Schedule playoffs')).props.disabled, true)
})

test('the division filter applies to final results and game actions remain available', () => {
  const h = harness()
  let tree = h.render()
  find(tree, (node) => typeof node.type === 'function' && node.type.name === 'Choice').props.onChange('d2')
  tree = h.render()
  find(tree, (node) => node.type === 'Tabs').props.onValueChange('completed')
  tree = h.render()
  const path = h.paths.find((value) => value.includes('/games?'))
  assert.match(path, /status=completed/)
  assert.match(path, /divisionId=d2/)
  assert.ok(find(tree, (node) => node.props?.children?.includes?.('Record final score')))
  assert.ok(find(tree, (node) => node.props?.children?.includes?.('Mark as forfeit')))
  assert.ok(find(tree, (node) => node.props?.children?.includes?.('Schedule history')))
})
