import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeStore } from '../lib/store.ts'
import { resetUi, selectLeague, selectOrganization, selectSeason, setSidebarOpen } from '../lib/ui-slice.ts'

test('sidebar state changes and resets without affecting another store', () => {
  const first = makeStore()
  const second = makeStore()
  first.dispatch(setSidebarOpen(false))
  assert.equal(first.getState().ui.sidebarOpen, false)
  assert.equal(second.getState().ui.sidebarOpen, true)
  first.dispatch(resetUi())
  assert.equal(first.getState().ui.sidebarOpen, true)
})

test('changing organization or league clears dependent selection', () => {
  const store = makeStore()
  store.dispatch(selectOrganization('org-a'))
  store.dispatch(selectLeague('league-a'))
  store.dispatch(selectSeason('season-a'))
  store.dispatch(selectLeague('league-b'))
  assert.equal(store.getState().ui.seasonId, '')
  store.dispatch(selectSeason('season-b'))
  store.dispatch(selectOrganization('org-b'))
  assert.equal(store.getState().ui.leagueId, '')
  assert.equal(store.getState().ui.seasonId, '')
})
