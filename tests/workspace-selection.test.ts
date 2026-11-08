import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseWorkspaceSelection, readWorkspaceSelection, resolveWorkspaceLeague, resolveWorkspaceSeason, saveWorkspaceSelection } from '../lib/workspace-selection.ts'

test('workspace choices are isolated per organization and survive reloads', () => {
  const values = new Map<string, string>()
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
  saveWorkspaceSelection('o1', { leagueId: 'l1', seasons: { l1: 's1', l2: 's2' } }, storage)
  saveWorkspaceSelection('o2', { leagueId: 'l3', seasons: { l3: 's3' } }, storage)
  assert.deepEqual(parseWorkspaceSelection(readWorkspaceSelection('o1', storage)), { leagueId: 'l1', seasons: { l1: 's1', l2: 's2' } })
  assert.equal(parseWorkspaceSelection(readWorkspaceSelection('o2', storage)).leagueId, 'l3')
  assert.deepEqual(parseWorkspaceSelection('not-json'), { leagueId: '', seasons: {} })
})

test('only unambiguous or previously selected contexts are selected', () => {
  const leagues = [{ id: 'l1' }, { id: 'l2' }]
  assert.equal(resolveWorkspaceLeague(leagues, ''), undefined)
  assert.equal(resolveWorkspaceLeague(leagues, 'l2')?.id, 'l2')
  assert.equal(resolveWorkspaceLeague([leagues[0]], 'missing')?.id, 'l1')
  const seasons = [{ id: 's1', status: 'completed' }, { id: 's2', status: 'active' }, { id: 's3', status: 'draft' }]
  assert.equal(resolveWorkspaceSeason(seasons, '')?.id, 's2')
  assert.equal(resolveWorkspaceSeason(seasons, 's1')?.id, 's1')
  assert.equal(resolveWorkspaceSeason([...seasons, { id: 's4', status: 'active' }], ''), undefined)
  assert.equal(resolveWorkspaceSeason([{ id: 's3', status: 'draft' }], '')?.id, 's3')
})
