import { zonedDate } from './league-time.ts'

// Data from GET /league/seasons/:id/dashboard, the season-wide summary behind the Overview page.
export type OverviewGame = {
  id: string
  division_id: string
  division_name: string
  home_name: string
  away_name: string
  home_season_team_id: string | null
  away_season_team_id: string | null
  scheduled_at: string | null
  venue_name: string | null
  status: 'scheduled' | 'live' | 'completed'
  stage: 'preliminary' | 'quarterfinal' | 'semifinal' | 'final' | 'third_place'
  home_score: number | null
  away_score: number | null
  forfeited_by_season_team_id: string | null
  live_home_score?: number | null
  live_away_score?: number | null
}
export type OverviewStanding = { id: string; name: string; wins: number; losses: number; pointDifference: number }
export type PlayoffStatus = { stage: 'waiting' | 'quarterfinals' | 'semifinals' | 'final' | 'complete'; nextGame: OverviewGame | null; champion: string | null }
export type OverviewDivision = {
  id: string
  name: string
  teams: number
  players: number
  games: number
  completedGames: number
  scheduled: boolean
  playoffs: PlayoffStatus | null
  standings: OverviewStanding[]
}
export type SeasonOverviewData = {
  totals: { divisions: number; teams: number; players: number; venues: number; games: number; completedGames: number }
  live: OverviewGame[]
  leaders?: { points: SeasonLeader[]; rebounds: SeasonLeader[]; assists: SeasonLeader[] }
  upcoming: OverviewGame[]
  awaitingResults: { count: number; games: OverviewGame[] }
  recent: OverviewGame[]
  shortRosters: { count: number; teams: { seasonTeamId: string; name: string; divisionName: string; players: number }[] }
  divisions: OverviewDivision[]
}

export type AttentionItem = { key: 'scores' | 'schedule' | 'rosters' | 'venues'; title: string; detail: string; href: string; action: string }
export type SeasonLeader = { rosterId: string; name: string; teamName: string; divisionName: string; games: number; perGame: number }
export type SetupStep = { key: 'divisions' | 'teams' | 'venues' | 'schedule' | 'activate'; title: string; detail: string; href: string; action: string; done: boolean }

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

// Divisions with at least two teams and no games yet; these are the ones Generate schedule can fill.
export function unscheduledDivisions(data: SeasonOverviewData) {
  return data.divisions.filter((division) => division.teams >= 2 && !division.scheduled)
}

// What an organizer should act on in a started season, most urgent first.
export function buildAttentionItems(data: SeasonOverviewData, leagueName: string): AttentionItem[] {
  const items: AttentionItem[] = []
  const { count: scores } = data.awaitingResults
  if (scores) items.push({ key: 'scores', title: `${plural(scores, 'game needs', 'games need')} a final score`, detail: 'These games have ended without a recorded result.', href: '/manage/games', action: 'Open games' })
  const unscheduled = unscheduledDivisions(data)
  if (unscheduled.length) items.push({ key: 'schedule', title: `${plural(unscheduled.length, 'division has', 'divisions have')} no schedule`, detail: unscheduled.map((division) => division.name).join(', '), href: '/manage/games/generate', action: 'Generate schedule' })
  const { count: shortRosters, teams } = data.shortRosters
  if (shortRosters) items.push({ key: 'rosters', title: `${plural(shortRosters, 'team has', 'teams have')} fewer than 5 players`, detail: teams.map((team) => `${team.name} (${team.divisionName})`).join(', ') + (shortRosters > teams.length ? ', and more' : ''), href: '/manage/teams', action: 'Manage rosters' })
  if (!data.totals.venues) items.push({ key: 'venues', title: `No venues for ${leagueName}`, detail: 'Games need a venue before they can be scheduled.', href: '/manage/venues', action: 'Add a venue' })
  return items
}

// The steps that take a draft season to its start. A step is done when the season already meets it.
export function buildSetupSteps(data: SeasonOverviewData, startDate: string | null, today: string): SetupStep[] {
  const { divisions, totals } = data
  const ready = divisions.filter((division) => division.teams >= 2)
  const started = !!startDate && startDate <= today
  return [
    { key: 'divisions', title: 'Add divisions', detail: totals.divisions ? plural(totals.divisions, 'division', 'divisions') : 'Group teams by age or level.', href: '/manage/divisions', action: 'Manage divisions', done: totals.divisions > 0 },
    { key: 'teams', title: 'Register teams and rosters', detail: totals.teams ? `${plural(totals.teams, 'team', 'teams')} · ${plural(totals.players, 'player', 'players')}` : 'Each division needs at least two teams.', href: '/manage/teams', action: 'Manage teams', done: divisions.length > 0 && divisions.every((division) => division.teams >= 2) && data.shortRosters.count === 0 },
    { key: 'venues', title: 'Add venues', detail: totals.venues ? plural(totals.venues, 'venue', 'venues') : 'Add the courts where games are played.', href: '/manage/venues', action: 'Manage venues', done: totals.venues > 0 },
    { key: 'schedule', title: 'Generate the schedule', detail: totals.games ? plural(totals.games, 'game', 'games') + ' scheduled' : 'Create each division’s round robin and playoffs.', href: '/manage/games/generate', action: 'Generate schedule', done: ready.length > 0 && ready.every((division) => division.scheduled) },
    { key: 'activate', title: 'Start the season', detail: started ? 'The start date has passed. Start the season to record scores.' : 'Start the season to begin recording scores.', href: '/manage/seasons', action: 'Open seasons', done: false },
  ]
}

const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
function nextDate(date: string) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
}

// Labels a league-zone calendar date as Today, Tomorrow, or a short date such as "Sat, Dec 6".
export function dayLabel(date: string, today: string) {
  if (date === today) return 'Today'
  if (date === nextDate(today)) return 'Tomorrow'
  return dayFormat.format(new Date(`${date}T12:00:00Z`))
}

// Groups games under their league-zone calendar day, keeping the given order.
export function groupGamesByDay<T extends { scheduled_at: string | null }>(games: T[], timeZone: string | null | undefined, today: string) {
  const groups: { key: string; label: string; games: T[] }[] = []
  for (const game of games) {
    const key = game.scheduled_at ? zonedDate(game.scheduled_at, timeZone) : 'unscheduled'
    let group = groups.find((item) => item.key === key)
    if (!group) {
      group = { key, label: key === 'unscheduled' ? 'Date not scheduled' : dayLabel(key, today), games: [] }
      groups.push(group)
    }
    group.games.push(game)
  }
  return groups
}

// "Day 5 of 32" while today falls within the season's dates.
export function seasonDay(startDate: string | null, endDate: string | null, today: string) {
  if (!startDate || !endDate || today < startDate || today > endDate) return null
  const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1
  return { day: days(startDate, today), total: days(startDate, endDate) }
}

export function stageLabel(stage: OverviewGame['stage']) {
  return { preliminary: null, quarterfinal: 'Quarterfinal', semifinal: 'Semifinal', final: 'Championship', third_place: 'Third place' }[stage]
}

