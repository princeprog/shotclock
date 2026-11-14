import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const source = readFileSync(new URL('../components/league-workspace.tsx', import.meta.url), 'utf8') + '\nexports.RegisterTeamForm = RegisterTeamForm;'
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
const row = { id: 't1', name: 'Lions', abbreviation: null, league_id: 'l1', league_name: 'League', season_team_id: 'st1', season_id: 's1', season_name: 'Season', division_id: 'd1', division_name: 'Open' }
const success = (data) => ({ data, isSuccess: true, isLoading: false, isFetching: false, isError: false })
function harness() {
  const states = [], effects = [], timers = new Map(), paths = [], queries = []
  let index = 0, timerId = 0, view = 'table', total = 31
  const workspace = { organizations: success([]), organization: { id: 'o1' }, leagues: success([{ id: 'l1', name: 'League' }]), league: { id: 'l1' }, seasons: success([]), season: { id: 's1', name: 'Season', status: 'draft' }, divisions: success([{ id: 'd1', name: 'Open' }, { id: 'd2', name: 'Youth' }]), changeWorkspace() {}, changeDivision() {} }
  const context = { exports: {}, URLSearchParams, window: { setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id }, clearTimeout(id) { timers.delete(id) }, history: { state: null, replaceState() {} } }, require(name) {
    if (name === 'react') return { ...require('react'), useState(initial) { const i = index++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], (next) => { states[i] = typeof next === 'function' ? next(states[i]) : next }] }, useEffect(fn, deps) { const i = index++; if (!effects[i] || deps.some((value, j) => !Object.is(value, effects[i].deps[j]))) { effects[i]?.cleanup?.(); effects[i] = { deps, pending: fn } } }, useRef(initial) { const i = index++; if (!(i in states)) states[i] = { current: initial }; return states[i] }, useSyncExternalStore: () => view }
    if (name === '@tanstack/react-query') return { useQueryClient: () => ({ getQueryData: () => undefined }), useMutation: () => ({ reset() {} }), useQuery: ({ queryKey, enabled, queryFn }) => { const path = queryKey[1]; if (enabled !== false) { paths.push(path); queries.push({ path, queryFn }) } if (path.startsWith('organizations/') && path.includes('/teams?')) { const q = new URLSearchParams(path.split('?')[1]); if (!q.has('page')) return success([]); const pageSize = Number(q.get('pageSize') || 10); const page = Math.min(Number(q.get('page') || 1), Math.max(1, Math.ceil(total / pageSize))); return { ...success({ items: total ? [row] : [], page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) }), queryFn } } return success([]) } }
    if (name === '@/components/workspace-context') return { useWorkspace: () => workspace }
    if (name === '@/lib/team-view') return { readTeamView: () => view, saveTeamView: (next) => { view = next }, subscribeTeamView() {}, availableTeamDivisions: () => [], selectSeasonTeamRegistrations: (value) => value.items ?? value }
    if (name === '@/lib/team-filter-links') return { teamListHref: ({ search, divisionId }) => '/manage/teams?' + new URLSearchParams({ search, divisionId }) }
    if (name === '@/lib/league-client') return { leagueRequest: async () => ({ items: [], page: 1, pageSize: 10, total: 0, totalPages: 1 }) }
    if (name === '@/lib/pagination') return { requirePaginatedResult: (value) => { if (!Array.isArray(value.items)) throw Error('invalid page'); return value } }
    if (name.startsWith('@/')) return new Proxy({}, { get: (_target, key) => key })
    if (name === 'next/link') return { __esModule: true, default: 'Link' }
    return require(name)
  } }
  vm.runInNewContext(compiled, context)
  return { workspace, paths, queries, renderRegistration() { index = 0; paths.length = 0; return context.exports.RegisterTeamForm({ team: row, organizationId: 'o1', seasonId: 's1', onClose() {} }) }, setTotal(value) { total = value }, flushTimers() { const pending = [...timers.values()]; timers.clear(); pending.forEach((fn) => fn()) }, render() { index = 0; paths.length = 0; const tree = context.exports.LeagueWorkspace({ section: 'teams' }); for (const effect of effects) if (effect?.pending) { effect.cleanup = effect.pending(); delete effect.pending } return tree }, RegisterTeamForm: context.exports.RegisterTeamForm }
}
function nodes(element) { if (element == null || typeof element === 'boolean') return []; if (Array.isArray(element)) return element.flatMap(nodes); if (typeof element !== 'object') return [element]; return [element, ...nodes(element.props?.children)] }
function find(tree, predicate) { return nodes(tree).find((node) => typeof node === 'object' && predicate(node)) }
function pagination(tree) { return find(tree, (node) => node.type === 'DataPagination') }
function params(h) { const path = h.paths.find((value) => /^organizations\/[^/]+\/teams\?/.test(value)); assert.ok(path); return new URLSearchParams(path.split('?')[1]) }

test('filters and page size reset the server request to page one, with search debounced', () => {
  const h = harness(); let tree = h.render(); let q = params(h)
  assert.equal(q.get('page'), '1'); assert.equal(q.get('pageSize'), '10'); assert.equal(q.get('leagueId'), 'l1'); assert.equal(q.get('seasonId'), 's1')
  pagination(tree).props.onPageChange(3); h.flushTimers(); tree = h.render(); assert.equal(params(h).get('page'), '3')
  find(tree, (node) => typeof node.type === 'function' && node.type.name === 'Choice' && node.props.label === 'Division').props.onChange('d2')
  tree = h.render(); q = params(h); assert.equal(q.get('page'), '1'); assert.equal(q.get('divisionId'), 'd2')
  pagination(tree).props.onPageChange(2); h.flushTimers(); tree = h.render()
  find(tree, (node) => node.props?.id === 'team-search').props.onChange({ target: { value: ' Lions ' } })
  tree = h.render(); assert.equal(h.paths.some((path) => path.includes('/teams?')), false)
  h.flushTimers(); tree = h.render(); q = params(h); assert.equal(q.get('page'), '1'); assert.equal(q.get('search'), 'Lions'); assert.equal(q.get('divisionId'), 'd2')
  pagination(tree).props.onPageChange(2); h.flushTimers(); tree = h.render(); pagination(tree).props.onPageSizeChange(20); tree = h.render(); q = params(h); assert.equal(q.get('page'), '1'); assert.equal(q.get('pageSize'), '20')
})

test('table and card views share pagination and preserve roster filters and actions', () => {
  const h = harness(); let tree = h.render(); assert.ok(pagination(tree)); assert.ok(find(tree, (n) => n.type === 'Table'))
  find(tree, (n) => n.props?.['aria-label'] === 'Card view').props.onClick(); tree = h.render()
  assert.ok(pagination(tree)); assert.ok(find(tree, (n) => n.type === 'ul' && n.props['aria-label'] === 'Teams and their season registrations'))
  find(tree, (n) => typeof n.type === 'function' && n.type.name === 'Choice' && n.props.label === 'Division').props.onChange('d2'); tree = h.render()
  find(tree, (n) => n.props?.id === 'team-search').props.onChange({ target: { value: 'Lions' } }); h.render(); h.flushTimers(); tree = h.render()
  assert.ok(find(tree, (n) => n.type === 'h4' && n.props.children === 'Lions'), 'server rows are not filtered again in the browser')
  pagination(tree).props.onPageChange(2); h.flushTimers(); tree = h.render(); assert.equal(params(h).get('page'), '2')
  const action = find(tree, (n) => typeof n.type === 'function' && n.type.name === 'TeamActions'); assert.match(action.props.roster.href, /divisionId=d2/); assert.match(action.props.roster.href, /search=Lions/); assert.equal(typeof action.props.onEdit, 'function'); assert.equal(typeof action.props.onRemove, 'function')
})

test('workspace changes start on page one and server clamping updates canonical page state', () => {
  const h = harness(); let tree = h.render(); pagination(tree).props.onPageChange(4); h.flushTimers(); tree = h.render()
  h.setTotal(21); tree = h.render(); assert.equal(pagination(tree).props.meta.page, 3)
  tree = h.render(); assert.equal(params(h).get('page'), '3')
  h.setTotal(40); tree = h.render(); assert.equal(params(h).get('page'), '3')
  for (const change of [() => { h.workspace.season = { ...h.workspace.season, id: 's2' } }, () => { h.workspace.league = { id: 'l2' } }, () => { h.workspace.organization = { id: 'o2' } }]) {
    pagination(tree).props.onPageChange(2); h.flushTimers(); tree = h.render(); change(); tree = h.render(); assert.equal(params(h).get('page'), '1'); tree = h.render(); assert.equal(params(h).get('page'), '1')
  }
})



test('the list validates pagination while registration keeps its independent unpaginated query', async () => {
  const h = harness(); h.render()
  const list = h.queries.find(({ path }) => path.includes('/teams?') && path.includes('page='))
  assert.ok(list); assert.equal((await list.queryFn()).page, 1)
  const registration = harness(); registration.renderRegistration()
  const path = registration.paths.find((value) => value.includes('/teams?'))
  assert.equal(path, 'organizations/o1/teams?seasonId=s1')
  assert.equal(new URLSearchParams(path.split('?')[1]).has('page'), false)
})

test('rapid page clicks update the pager at once, show a skeleton and fetch only the final page', () => {
  const h = harness(); let tree = h.render()
  pagination(tree).props.onPageChange(2); tree = h.render()
  pagination(tree).props.onPageChange(3); tree = h.render()
  assert.equal(params(h).get('page'), '1'); assert.equal(pagination(tree).props.meta.page, 3)
  assert.ok(find(tree, (n) => typeof n.type === 'function' && n.type.name === 'TeamsSkeleton'))
  h.flushTimers(); tree = h.render()
  assert.equal(params(h).get('page'), '3'); assert.equal(find(tree, (n) => typeof n.type === 'function' && n.type.name === 'TeamsSkeleton'), undefined)
})
