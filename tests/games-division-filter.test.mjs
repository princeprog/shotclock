import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const source = readFileSync(new URL('../components/league-workspace.tsx', import.meta.url), 'utf8') + '\nexports.GamesManager = GamesManager; exports.Editor = Editor; exports.ScheduleGameForm = ScheduleGameForm;'
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
const divisionStatuses = [{ id: 'd1', name: 'Open', teamCount: 1, canGeneratePreliminary: false, hasSchedule: false, playoffs: false, thirdPlace: false, playoffStage: null }, { id: 'd2', name: 'Youth', teamCount: 2, canGeneratePreliminary: true, hasSchedule: true, playoffs: true, thirdPlace: false, playoffStage: 'final' }]
const game = { id: 'g1', division_id: 'd2', division_name: 'Youth', home_name: 'A', away_name: 'B', home_season_team_id: 'a', away_season_team_id: 'b', scheduled_at: null, venue_id: null, venue_name: null, duration_minutes: 60, forfeited_by_season_team_id: null, status: 'scheduled', home_score: null, away_score: null }
const registrations = [{ id: 'a', name: 'A', team_id: 'a1', division_id: 'd2' }, { id: 'b', name: 'B', team_id: 'b1', division_id: 'd2' }]
const season = { id: 's1', name: 'Season', status: 'active', start_date: null, end_date: null }
const divisions = divisionStatuses.map(({ id, name }) => ({ id, name, season_id: 's1', min_age: null, max_age: null }))

function harness(statuses = divisionStatuses) {
  const states = []
  const formStates = []
  let activeStates = states
  let index = 0
  const paths = []
  const submissions = []
  const context = { exports: {}, URLSearchParams, FormData: class { constructor(form) { this.form = form } get(key) { return this.form[key] ?? null } }, document: { getElementById() { return null } }, require(name) {
    if (name === 'react') return { ...require('react'), useState(initial) { const target = activeStates; const i = index++; if (!(i in target)) target[i] = typeof initial === 'function' ? initial() : initial; return [target[i], (next) => { target[i] = typeof next === 'function' ? next(target[i]) : next }] } }
    if (name === '@tanstack/react-query') return { useQueryClient: () => ({}), useMutation: () => ({ reset() {}, async mutateAsync(body) { submissions.push(body) } }), useQuery: ({ queryKey, enabled }) => { const path = queryKey[1]; if (enabled !== false) paths.push(path); if (path.includes('/schedule/status')) return { isSuccess: true, data: { divisions: statuses } }; if (path.includes('/teams?')) return { isSuccess: true, data: registrations }; return { isSuccess: true, data: { items: [game], total: 1, page: 1, pageSize: 10 } } } }
    if (name === '@/lib/league-client') return { leagueRequest() {} }
    if (name === '@/lib/pagination') return { requirePaginatedResult: (value) => value }
    if (name.startsWith('@/')) return new Proxy({}, { get: (_target, key) => key })
    if (name === 'next/link') return { __esModule: true, default: 'Link' }
    return require(name)
  } }
  vm.runInNewContext(compiled, context)
  return { render() { activeStates = states; index = 0; paths.length = 0; return context.exports.GamesManager({ season, divisions, venues: [] }) }, renderForm(props) { activeStates = formStates; index = 0; return context.exports.ScheduleGameForm(props) }, paths, submissions, Editor: context.exports.Editor, ScheduleGameForm: context.exports.ScheduleGameForm }
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
  assert.equal(generator.props.render.props.href, '/manage/games/generate')
})

test('manual scheduling selects a division and uses only its registrations', () => {
  const h = harness()
  let tree = h.render()
  find(tree, (node) => node.props?.children?.includes?.('Schedule game')).props.onClick()
  tree = h.render()
  const form = find(tree, (node) => node.type === h.ScheduleGameForm)
  assert.ok(form, 'the full scheduling form is visible before selecting a division')
  assert.equal(form.props.divisionId, '')
  form.props.onDivisionChange('d2')
  tree = h.render()
  assert.ok(h.paths.includes('seasons/s1/teams?divisionId=d2'))
  assert.equal(find(tree, (node) => node.type === h.ScheduleGameForm).props.teams.length, 2)
})

test('the scheduling form shows all fields before a division is selected', () => {
  const h = harness(); const props = { seasonId: 's1', divisions, divisionId: '', onDivisionChange() {}, teams: [], teamsLoading: false, teamsError: null, onRetryTeams() {}, venues: [], onClose() {}, onSaved() {}, onPendingChange() {} }
  const tree = h.renderForm(props)
  for (const id of ['game-division', 'schedule-game-home', 'schedule-game-away', 'schedule-game-venue']) assert.ok(find(tree, (node) => node.props?.id === id), id)
  assert.ok(find(tree, (node) => node.props?.id === 'schedule-game-date'))
  assert.ok(find(tree, (node) => node.props?.id === 'schedule-game-time'))
  assert.match(text(tree), /Select a division to choose its teams/)
})

test('changing division clears teams and retains the selected venue', () => {
  const h = harness(); const props = { seasonId: 's1', divisions, divisionId: 'd2', onDivisionChange(id) { props.divisionId = id }, teams: registrations, teamsLoading: false, teamsError: null, onRetryTeams() {}, venues: [{ id: 'v1', name: 'Gym' }], onClose() {}, onSaved() {}, onPendingChange() {} }
  const selectFor = (tree, id) => find(tree, (node) => node.type === 'Select' && nodes(node).some((child) => child.props?.id === id))
  let tree = h.renderForm(props)
  selectFor(tree, 'schedule-game-home').props.onValueChange('a')
  selectFor(tree, 'schedule-game-away').props.onValueChange('b')
  selectFor(tree, 'schedule-game-venue').props.onValueChange('v1')
  tree = h.renderForm(props)
  selectFor(tree, 'game-division').props.onValueChange('d1')
  tree = h.renderForm(props)
  assert.equal(selectFor(tree, 'schedule-game-home').props.value, null)
  assert.equal(selectFor(tree, 'schedule-game-away').props.value, null)
  assert.equal(selectFor(tree, 'schedule-game-venue').props.value, 'v1')
})

test('team loading and failures leave the other fields available', () => {
  const h = harness(); const props = { seasonId: 's1', divisions, divisionId: 'd2', onDivisionChange() {}, teams: [], teamsLoading: true, teamsError: null, onRetryTeams() {}, venues: [], onClose() {}, onSaved() {}, onPendingChange() {} }
  let tree = h.renderForm(props)
  const selectFor = (id) => find(tree, (node) => node.type === 'Select' && nodes(node).some((child) => child.props?.id === id))
  assert.equal(selectFor('schedule-game-home').props.disabled, true)
  assert.ok(find(tree, (node) => node.props?.id === 'schedule-game-date'))
  assert.ok(find(tree, (node) => node.props?.id === 'schedule-game-venue'))
  props.teamsLoading = false; props.teamsError = 'Unable to load teams.'
  tree = h.renderForm(props)
  assert.match(text(tree), /Unable to load teams/)
  assert.ok(find(tree, (node) => node.type === 'Button' && nodes(node).includes('Try again')))
})

test('scheduling submits the selected division registrations and chosen time', async () => {
  const h = harness(); const props = { seasonId: 's1', divisions, divisionId: 'd2', onDivisionChange() {}, teams: registrations, teamsLoading: false, teamsError: null, onRetryTeams() {}, venues: [{ id: 'v1', name: 'Gym' }], onClose() {}, onSaved() {}, onPendingChange() {} }
  const selectFor = (tree, id) => find(tree, (node) => node.type === 'Select' && nodes(node).some((child) => child.props?.id === id))
  let tree = h.renderForm(props)
  selectFor(tree, 'schedule-game-home').props.onValueChange('a')
  selectFor(tree, 'schedule-game-away').props.onValueChange('b')
  selectFor(tree, 'schedule-game-venue').props.onValueChange('v1')
  tree = h.renderForm(props)
  await tree.props.onSubmit({ preventDefault() {}, currentTarget: { gameDate: '2026-11-10', gameTime: '12:00' } })
  assert.equal(h.submissions.length, 1)
  assert.deepEqual(JSON.parse(JSON.stringify(h.submissions[0])), { homeTeamId: 'a', awayTeamId: 'b', scheduledAt: new Date('2026-11-10T12:00').toISOString(), venueId: 'v1' })
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
  assert.equal(find(tree, (node) => node.type === h.ScheduleGameForm).props.divisionId, 'd2')
  find(tree, (node) => typeof node.type === 'function' && node.type.name === 'Choice').props.onChange('d1')
  tree = h.render()
  assert.equal(find(tree, (node) => node.type === h.ScheduleGameForm).props.divisionId, 'd2')
  assert.ok(find(tree, (node) => node.type === h.ScheduleGameForm))
})

test('unavailable schedule generation explains each division in a tooltip, without a playoffs message', () => {
  const statuses = [
    { ...divisionStatuses[0], preliminaryReason: 'Needs another team', playoffs: true, playoffReason: 'Finish semifinals' },
    { ...divisionStatuses[1], canGeneratePreliminary: false, preliminaryReason: 'Already scheduled', playoffStage: null, playoffReason: 'Finish preliminary games' },
  ]
  const tree = harness(statuses).render()
  assert.match(text(tree), /Needs another team/)
  assert.match(text(tree), /Already scheduled/)
  assert.ok(find(tree, (node) => node.type === 'TooltipContent'))
  assert.doesNotMatch(text(tree), /Finish semifinals|Finish preliminary games|Playoffs not ready/)
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
