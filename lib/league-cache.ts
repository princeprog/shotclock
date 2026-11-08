import type { Query, QueryClient } from '@tanstack/react-query'

type ChangeKind = 'organization' | 'league' | 'season' | 'team' | 'roster' | 'venue' | 'game' | 'unknown'
export type LeagueChange = { kind: ChangeKind; action: 'create' | 'edit' | 'register' | 'score'; organizationId?: string; leagueId?: string; seasonId?: string; seasonTeamId?: string; entityId?: string; seasonIds?: string[] }

const channelName = 'shotclock-cache-v1'
const senderId = Math.random().toString(36).slice(2)
const stringValue = (value: unknown) => typeof value === 'string' && value.length > 0 ? value : undefined
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

function organizationForLeague(client: QueryClient, leagueId?: string) {
  if (!leagueId) return undefined
  for (const [key, data] of client.getQueriesData({ queryKey: ['league'] })) {
    const match = typeof key[1] === 'string' ? /^organizations\/([^/]+)\/leagues$/.exec(key[1]) : null
    if (match && Array.isArray(data) && data.some((item: unknown) => record(item).id === leagueId)) return match[1]
  }
  return undefined
}

function seasonsForTeam(client: QueryClient, teamId?: string) {
  if (!teamId) return undefined
  for (const [key, data] of client.getQueriesData({ queryKey: ['league'] })) {
    const path = typeof key[1] === 'string' ? key[1].split('?')[0] : ''
    if (!/^organizations\/[^/]+\/teams$/.test(path) || !Array.isArray(data) || client.getQueryState(key)?.isInvalidated) continue
    const rows = data.filter((item: unknown) => record(item).id === teamId)
    if (rows.length) return [...new Set(rows.map((item: unknown) => stringValue(record(item).season_id)).filter((id): id is string => !!id))]
  }
  return undefined
}

function seasonsForLeague(client: QueryClient, leagueId?: string) {
  if (!leagueId) return undefined
  const key = ['league', `leagues/${leagueId}/seasons`]
  const state = client.getQueryState(key)
  if (!state || state.isInvalidated || !Array.isArray(state.data)) return undefined
  return state.data.map((item: unknown) => stringValue(record(item).id)).filter((id): id is string => !!id)
}

export function leagueChangeForMutation(client: QueryClient, path: string, method: string, body: unknown, result: unknown): LeagueChange {
  const parts = path.split('?')[0].split('/')
  const value = record(result)
  const input = record(body)
  const [resource, id, child] = parts
  let change: LeagueChange = { kind: 'unknown', action: method === 'POST' ? 'create' : 'edit' }
  if (resource === 'organizations' && !child) change = { kind: 'organization', action: id ? 'edit' : 'create', organizationId: id ?? stringValue(value.id) }
  else if (resource === 'organizations' && child === 'leagues') change = { kind: 'league', action: 'create', organizationId: id, leagueId: stringValue(value.id) }
  else if (resource === 'leagues' && !child) change = { kind: 'league', action: 'edit', leagueId: id, organizationId: stringValue(value.organization_id) }
  else if (resource === 'leagues' && child === 'seasons') change = { kind: 'season', action: 'create', leagueId: id, seasonId: stringValue(value.id) }
  else if (resource === 'seasons' && (!child || child === 'status')) change = { kind: 'season', action: 'edit', seasonId: id, leagueId: stringValue(value.league_id) }
  else if (resource === 'leagues' && child === 'teams') change = { kind: 'team', action: 'create', leagueId: id, seasonId: stringValue(input.seasonId), entityId: stringValue(value.id) }
  else if (resource === 'seasons' && child === 'teams') change = { kind: 'team', action: 'register', seasonId: id, leagueId: stringValue(value.league_id), entityId: stringValue(value.team_id) }
  else if (resource === 'teams' && !child) change = { kind: 'team', action: 'edit', entityId: id, leagueId: stringValue(value.league_id) }
  else if (resource === 'season-teams' && child === 'roster') change = { kind: 'roster', action: 'create', seasonTeamId: id }
  else if (resource === 'rosters' && !child) change = { kind: 'roster', action: 'edit', seasonTeamId: stringValue(value.season_team_id) }
  else if (resource === 'leagues' && child === 'venues') change = { kind: 'venue', action: 'create', leagueId: id, entityId: stringValue(value.id) }
  else if (resource === 'venues' && !child) change = { kind: 'venue', action: 'edit', leagueId: stringValue(value.league_id), entityId: id }
  else if (resource === 'seasons' && child === 'games') change = { kind: 'game', action: 'create', seasonId: id }
  else if (resource === 'games' && (!child || child === 'score')) change = { kind: 'game', action: child === 'score' ? 'score' : 'edit', seasonId: stringValue(value.season_id), entityId: id }
  if (!change.organizationId) change.organizationId = organizationForLeague(client, change.leagueId)
  if (change.kind === 'team' && change.action === 'edit') change.seasonIds = seasonsForTeam(client, change.entityId)
  if (change.kind === 'venue' && change.action === 'edit') change.seasonIds = seasonsForLeague(client, change.leagueId)
  return change
}

function contextMatches(query: Query, key: string, id?: string) {
  if (!id) return true
  const data = record(query.state.data)
  return !query.state.data || data[key] === id
}

export function isAffectedLeagueQuery(query: Query, change: LeagueChange, client?: QueryClient) {
  const [root, raw] = query.queryKey
  if (root !== 'league' || typeof raw !== 'string') return false
  const path = raw.split('?')[0]
  const org = /^organizations\/([^/]+)\/(leagues|seasons|teams|team-seasons|venues)$/.exec(path)
  const league = /^leagues\/([^/]+)\/(seasons|teams|venues)$/.exec(path)
  const season = /^seasons\/([^/]+)(?:\/(teams|games|standings|dashboard))?$/.exec(path)
  const roster = /^season-teams\/([^/]+)(\/roster)?$/.exec(path)
  const inOrg = !!org && (!change.organizationId || org[1] === change.organizationId)
  const inLeague = !!league && (!change.leagueId || league[1] === change.leagueId)
  const inSeason = !!season && (!change.seasonId || season[1] === change.seasonId)
  const relatedSeasonIds = change.seasonIds ?? (change.kind === 'venue' && client ? seasonsForLeague(client, change.leagueId) : undefined)
  const relatedSeason = !!season && (!relatedSeasonIds || relatedSeasonIds.includes(season[1]))
  switch (change.kind) {
    case 'organization': return path === 'organizations' || (!!change.organizationId && path === `organizations/${change.organizationId}`)
    case 'league': return (inOrg && (org[2] === 'leagues' || (change.action === 'edit' && ['seasons', 'teams', 'team-seasons', 'venues'].includes(org[2])))) || (!!change.leagueId && path === `leagues/${change.leagueId}`) || (change.action === 'edit' && !!roster && !roster[2] && contextMatches(query, 'league_id', change.leagueId))
    case 'season': return (inLeague && league[2] === 'seasons') || (inOrg && (['seasons', 'team-seasons'].includes(org[2]) || (change.action === 'edit' && org[2] === 'teams'))) || (change.action === 'edit' && inSeason && !season[2]) || (change.action === 'edit' && !!roster && !roster[2] && contextMatches(query, 'season_id', change.seasonId))
    case 'team': return (inOrg && org[2] === 'teams') || (inLeague && league[2] === 'teams') || (change.action === 'edit' && !!change.entityId && path === `teams/${change.entityId}`) || (!!season && (change.action === 'edit' ? relatedSeason : inSeason) && ['teams', 'standings', 'dashboard', ...(change.action === 'edit' ? ['games'] : [])].includes(season[2] ?? '')) || (change.action === 'edit' && !!roster && !roster[2] && contextMatches(query, 'team_id', change.entityId))
    case 'roster': return !!roster && !!roster[2] && (!change.seasonTeamId || roster[1] === change.seasonTeamId)
    case 'venue': return (inOrg && org[2] === 'venues') || (inLeague && league[2] === 'venues') || (change.action === 'edit' && relatedSeason && !!season && ['games', 'dashboard'].includes(season[2] ?? ''))
    case 'game': return !!season && inSeason && ['games', 'dashboard', ...(change.action === 'score' ? ['standings'] : [])].includes(season[2] ?? '')
    case 'unknown': return true
  }
}

export function invalidateLeagueChange(client: QueryClient, change: LeagueChange) {
  return client.invalidateQueries({ predicate: (query) => isAffectedLeagueQuery(query, change, client) })
}

type CacheMessage = { type: 'league-change'; change: LeagueChange } | { type: 'session-change' }
function publish(message: CacheMessage) {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return
  try { const channel = new BroadcastChannel(channelName); channel.postMessage({ ...message, senderId }); channel.close() } catch { /* The local cache remains usable when cross-tab messaging is unavailable. */ }
}
export function publishSessionChange() { publish({ type: 'session-change' }) }
export async function applyLeagueMutation(client: QueryClient, path: string, method: string, body: unknown, result: unknown) {
  const change = leagueChangeForMutation(client, path, method, body, result)
  publish({ type: 'league-change', change })
  await invalidateLeagueChange(client, change)
}

export function subscribeToCacheChanges(client: QueryClient, onSessionChange: () => void) {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return () => {}
  try {
    const channel = new BroadcastChannel(channelName)
    channel.onmessage = (event: MessageEvent<unknown>) => {
      const message = record(event.data)
      if (message.senderId === senderId) return
      if (message.type === 'session-change') { client.clear(); onSessionChange(); return }
      if (message.type !== 'league-change') return
      const value = record(message.change)
      if (!['organization', 'league', 'season', 'team', 'roster', 'venue', 'game', 'unknown'].includes(String(value.kind)) || !['create', 'edit', 'register', 'score'].includes(String(value.action))) return
      const seasonIds = Array.isArray(value.seasonIds) && value.seasonIds.every((id: unknown) => typeof id === 'string') ? value.seasonIds : undefined
      const change: LeagueChange = { kind: value.kind as ChangeKind, action: value.action as LeagueChange['action'], organizationId: stringValue(value.organizationId), leagueId: stringValue(value.leagueId), seasonId: stringValue(value.seasonId), seasonTeamId: stringValue(value.seasonTeamId), entityId: stringValue(value.entityId), seasonIds }
      void invalidateLeagueChange(client, change)
    }
    return () => channel.close()
  } catch { return () => {} }
}
