import { notFound, redirect } from 'next/navigation'
import { AuthenticatedShell } from '@/components/authenticated-shell'
import { LeagueWorkspace, type Section } from '@/components/league-workspace'
import { readTeamFilters } from '@/lib/team-filter-links'

const titles: Record<string, string> = { leagues: 'Leagues', seasons: 'Seasons', divisions: 'Divisions', teams: 'Teams & rosters', venues: 'Venues', games: 'Games', standings: 'Standings' }

export default async function ManagePage({ params, searchParams }: { params: Promise<{ section: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { section } = await params
  if (section === 'organizations') redirect('/organizations')
  if (!Object.prototype.hasOwnProperty.call(titles, section)) notFound()
  return <AuthenticatedShell title={titles[section]}><LeagueWorkspace section={section as Section} initialTeamFilters={readTeamFilters(await searchParams)} /></AuthenticatedShell>
}
