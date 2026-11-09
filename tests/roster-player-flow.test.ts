import { test } from 'node:test'
import assert from 'node:assert/strict'
import { QueryClient } from '@tanstack/react-query'
import { isAffectedLeagueQuery } from '../lib/league-cache.ts'
import { addRosterPlayer, correctionTeamsQueryKey, loadSeasonRegistrations, playerCorrections, updateOwnedPlayer, type PlayerUpdate } from '../lib/roster-player-flow.ts'

test('registers a selected player without creating a new player', async () => {
  const calls: unknown[] = []
  await addRosterPlayer({ playerId: 'existing', jerseyNumber: 7 }, {
    create: async () => { throw new Error('unexpected creation') },
    update: async () => { throw new Error('unexpected update') },
    register: async (body) => { calls.push(body) },
    onCreated: () => { throw new Error('unexpected creation') },
    onUpdated: () => { throw new Error('unexpected update') },
  })
  assert.deepEqual(calls, [{ playerId: 'existing', jerseyNumber: 7 }])
})

test('loads registrations from every division for roster corrections', async () => {
  const rows = await loadSeasonRegistrations(
    async () => [{ id: 'open' }, { id: 'youth' }],
    async (division) => division === 'open' ? [{ id: 'team-a' }] : [{ id: 'team-b' }],
  )
  assert.deepEqual(rows, [{ id: 'team-a' }, { id: 'team-b' }])
})

test('retains a newly created player if registration fails so it can be retried', async () => {
  let createdId = ''
  let creations = 0
  const actions = {
    create: async () => { creations++; return { id: 'new-player' } },
    update: async () => { throw new Error('unexpected update') },
    register: async () => { throw new Error('jersey in use') },
    onCreated: (id: string) => { createdId = id },
    onUpdated: () => { throw new Error('unexpected update') },
  }
  await assert.rejects(addRosterPlayer({ player: { firstName: 'A', lastName: 'B', dateOfBirth: '2000-01-02' }, jerseyNumber: null }, actions), /jersey in use/)
  assert.equal(createdId, 'new-player')
  await assert.rejects(addRosterPlayer({ playerId: createdId, jerseyNumber: null }, actions), /jersey in use/)
  assert.equal(creations, 1)
})

test('updates a legacy player before registration and retains the update if registration fails', async () => {
  const calls: unknown[] = []
  let updated = false
  const player = { dateOfBirth: '2003-02-01' }
  const actions = {
    create: async () => { throw new Error('unexpected creation') },
    update: async (id: string, details: PlayerUpdate) => { calls.push(['update', id, details]) },
    register: async (body: { playerId: string; jerseyNumber: number | null }) => { calls.push(['register', body]); throw new Error('jersey in use') },
    onCreated: () => { throw new Error('unexpected creation') },
    onUpdated: () => { updated = true },
  }
  await assert.rejects(addRosterPlayer({ playerId: 'legacy', playerUpdate: player, jerseyNumber: 9 }, actions), /jersey in use/)
  assert.equal(updated, true)
  assert.deepEqual(calls, [['update', 'legacy', player], ['register', { playerId: 'legacy', jerseyNumber: 9 }]])
  await assert.rejects(addRosterPlayer({ playerId: 'legacy', playerUpdate: { dateOfBirth: '2006-02-01' }, jerseyNumber: 10 }, actions), /jersey in use/)
  assert.deepEqual(calls.slice(2), [['update', 'legacy', { dateOfBirth: '2006-02-01' }], ['register', { playerId: 'legacy', jerseyNumber: 10 }]])
})

test('does not register a legacy player when their date of birth update fails', async () => {
  let registered = false
  await assert.rejects(addRosterPlayer({ playerId: 'legacy', playerUpdate: { dateOfBirth: '2003-02-01' }, jerseyNumber: null }, {
    create: async () => { throw new Error('unexpected creation') },
    update: async () => { throw new Error('date rejected') },
    register: async () => { registered = true },
    onCreated: () => {},
    onUpdated: () => {},
  }), /date rejected/)
  assert.equal(registered, false)
})

test('corrects the saved player after a failed registration without creating a duplicate', async () => {
  const calls: unknown[] = []
  const saved = { firstName: 'Alex', lastName: 'Reyes', dateOfBirth: '2000-02-01', position: 'center' }
  const corrected = { ...saved, firstName: 'Alexa', dateOfBirth: '2006-02-01', position: null }
  let playerId = ''
  let attempt = 0
  const actions = {
    create: async () => { calls.push('create'); return { id: 'new-player' } },
    update: async (id: string, body: object) => { calls.push(['update', id, body]) },
    register: async (body: object) => { calls.push(['register', body]); if (attempt++ === 0) throw new Error('ineligible age') },
    onCreated: (id: string) => { playerId = id },
    onUpdated: () => {},
  }
  await assert.rejects(addRosterPlayer({ player: saved, jerseyNumber: null }, actions), /ineligible age/)
  await addRosterPlayer({ playerId, playerUpdate: playerCorrections(saved, corrected), jerseyNumber: null }, actions)
  assert.deepEqual(calls, ['create', ['register', { playerId: 'new-player', jerseyNumber: null }], ['update', 'new-player', { firstName: 'Alexa', dateOfBirth: '2006-02-01', position: null }], ['register', { playerId: 'new-player', jerseyNumber: null }]])
  assert.equal(playerCorrections(corrected, corrected), undefined)
})

test('correction registrations are invalidated after team registration and edits', () => {
  const client = new QueryClient()
  const key = correctionTeamsQueryKey('season-a')
  client.setQueryData(key, [])
  const query = client.getQueryCache().find({ queryKey: key })!
  assert.equal(isAffectedLeagueQuery(query, { kind: 'team', action: 'register', seasonId: 'season-a' }, client), true)
  assert.equal(isAffectedLeagueQuery(query, { kind: 'team', action: 'edit' }, client), true)
  assert.equal(isAffectedLeagueQuery(query, { kind: 'team', action: 'register', seasonId: 'season-b' }, client), false)
})

test('forks a shared player before updating and retains the new identity after an update failure', async () => {
  const calls: unknown[] = []
  let player = { id: 'shared', requires_fork: true }
  let first = true
  const actions = {
    fork: async (id: string) => { calls.push(['fork', id]); return { id: 'copy', requires_fork: false } },
    onForked: (copy: typeof player) => { player = copy },
    update: async (id: string, body: PlayerUpdate) => { calls.push(['update', id, body]); if (first) { first = false; throw new Error('update failed') } },
  }
  await assert.rejects(updateOwnedPlayer(player.id, player.requires_fork, { dateOfBirth: '2005-01-01' }, actions), /update failed/)
  assert.deepEqual(player, { id: 'copy', requires_fork: false })
  await updateOwnedPlayer(player.id, player.requires_fork, { dateOfBirth: '2005-01-01' }, actions)
  assert.deepEqual(calls, [['fork', 'shared'], ['update', 'copy', { dateOfBirth: '2005-01-01' }], ['update', 'copy', { dateOfBirth: '2005-01-01' }]])
})

test('registers the forked player and preserves their identity when registration fails', async () => {
  let player = { id: 'shared', requires_fork: true }
  const calls: unknown[] = []
  const actions = {
    create: async () => { throw new Error('unexpected creation') },
    fork: async (id: string) => { calls.push(['fork', id]); return { id: 'copy', requires_fork: false } },
    onForked: (copy: typeof player) => { player = copy },
    update: async (id: string, body: PlayerUpdate) => { calls.push(['update', id, body]) },
    register: async (body: { playerId: string; jerseyNumber: number | null }) => { calls.push(['register', body]); throw new Error('ineligible') },
    onCreated: () => {}, onUpdated: () => {},
  }
  await assert.rejects(addRosterPlayer({ playerId: player.id, requiresFork: player.requires_fork, playerUpdate: { dateOfBirth: '2005-01-01' }, jerseyNumber: null }, actions), /ineligible/)
  await assert.rejects(addRosterPlayer({ playerId: player.id, requiresFork: player.requires_fork, jerseyNumber: null }, actions), /ineligible/)
  assert.deepEqual(calls, [['fork', 'shared'], ['update', 'copy', { dateOfBirth: '2005-01-01' }], ['register', { playerId: 'copy', jerseyNumber: null }], ['register', { playerId: 'copy', jerseyNumber: null }]])
})

test('registers a shared player without forking when their details are unchanged', async () => {
  const calls: unknown[] = []
  await addRosterPlayer({ playerId: 'shared', requiresFork: true, jerseyNumber: null }, {
    create: async () => { throw new Error('unexpected creation') },
    fork: async () => { throw new Error('unexpected fork') },
    onForked: () => { throw new Error('unexpected fork') },
    update: async () => { throw new Error('unexpected update') },
    register: async (body) => { calls.push(body) },
    onCreated: () => {}, onUpdated: () => {},
  })
  assert.deepEqual(calls, [{ playerId: 'shared', jerseyNumber: null }])
})

test('stops before editing when the fork fails', async () => {
  let updated = false
  await assert.rejects(updateOwnedPlayer('shared', true, { firstName: 'Sam' }, {
    fork: async () => { throw new Error('fork failed') },
    onForked: () => {},
    update: async () => { updated = true },
  }), /fork failed/)
  assert.equal(updated, false)
})
