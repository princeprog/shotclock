import { notFound } from 'next/navigation'
import { AuthenticatedShell } from '@/components/authenticated-shell'
import { RosterWorkspace } from '@/components/roster-workspace'
import { readTeamFilters, teamListHref } from '@/lib/team-filter-links'

export default async function RosterPage({ params, searchParams }: { params: Promise<{ seasonTeamId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { seasonTeamId } = await params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seasonTeamId)) notFound()
  const backHref = teamListHref(readTeamFilters(await searchParams))
  return <AuthenticatedShell title="Team roster"><RosterWorkspace seasonTeamId={seasonTeamId} backHref={backHref} /></AuthenticatedShell>
}
