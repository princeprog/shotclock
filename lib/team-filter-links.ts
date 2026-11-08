export type TeamFilters = { search: string; leagueId: string; seasonId: string; all?: boolean }
type SearchParams = Record<string, string | string[] | undefined>
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function readTeamFilters(params: SearchParams): TeamFilters {
  const search = typeof params.search === 'string' && params.search.length <= 120 ? params.search : ''
  const leagueId = typeof params.leagueId === 'string' && uuid.test(params.leagueId) ? params.leagueId : ''
  const seasonId = typeof params.seasonId === 'string' && uuid.test(params.seasonId) ? params.seasonId : ''
  return { search, leagueId, seasonId, ...(params.scope === 'all' ? { all: true } : {}) }
}

export function teamListHref(filters: TeamFilters): string {
  const query = new URLSearchParams()
  if (filters.search) query.set('search', filters.search)
  if (filters.leagueId) query.set('leagueId', filters.leagueId)
  if (filters.seasonId) query.set('seasonId', filters.seasonId)
  if (filters.all) query.set('scope', 'all')
  const suffix = query.toString()
  return `/manage/teams${suffix ? `?${suffix}` : ''}`
}
