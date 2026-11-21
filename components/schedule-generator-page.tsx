'use client'

import { useCallback, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftIcon } from 'lucide-react'
import { toast } from 'sonner'
import { ScheduleGenerator } from '@/components/schedule-generator'
import { useWorkspace } from '@/components/workspace-context'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { leagueRequest } from '@/lib/league-client'
import { confirmDiscardSchedulePreview, installScheduleNavigationGuard } from '@/lib/schedule-navigation-guard'

type Venue = { id: string; name: string }

type Mode = 'preliminary' | 'playoffs'
const copy: Record<Mode, { title: string; description?: string; saved: string; loading: string; noSeason: string; closed: string }> = {
  preliminary: { title: 'Generate preliminary schedule', saved: 'Schedule saved.', loading: 'Loading schedule settings…', noSeason: 'Choose a league and season in the header to generate a schedule.', closed: 'Schedules cannot be generated for a completed season.' },
  playoffs: { title: 'Schedule playoffs', description: 'Choose dates after the season’s last elimination game. A division’s bracket can be previewed once all of its elimination games have final scores.', saved: 'Playoff games saved.', loading: 'Loading playoff settings…', noSeason: 'Choose a league and season in the header to schedule playoffs.', closed: 'Playoffs cannot be scheduled for a completed season.' },
}

// Full-page schedule generation for the regular season or the playoff bracket.
export function ScheduleGeneratorPage({ mode = 'preliminary' }: { mode?: Mode }) {
  const text = copy[mode]
  const { organizations, organization, leagues, league, seasons, season } = useWorkspace()
  const client = useQueryClient()
  const router = useRouter()
  const unsaved = useRef(false)
  const setUnsaved = useCallback((value: boolean) => { unsaved.current = value }, [])
  const venues = useQuery({ queryKey: ['league', `leagues/${league?.id ?? ''}/venues`], enabled: !!league, retry: false,
    queryFn: () => leagueRequest<Venue[]>(`leagues/${league!.id}/venues`, client) })

  useEffect(() => installScheduleNavigationGuard(() => unsaved.current), [])

  const leave = () => {
    if (unsaved.current && !confirmDiscardSchedulePreview()) return
    unsaved.current = false
    router.push('/manage/games')
  }
  const saved = () => {
    unsaved.current = false
    toast.success(text.saved)
    router.push('/manage/games')
  }

  const loading = organizations.isLoading || (!!organization && leagues.isLoading) || (!!league && seasons.isLoading) || (!!league && venues.isLoading)
  const failed = [organizations, leagues, seasons, venues].find((query) => query.isError)

  return <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 md:p-8">
    <div className="flex flex-col gap-3">
      <Button type="button" variant="ghost" size="sm" className="-ml-2 w-fit" onClick={leave}><ArrowLeftIcon data-icon="inline-start" />Back to games</Button>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{text.title}</h1>
        {league && season && <p className="text-sm text-muted-foreground">{league.name} · {season.name}</p>}
        {text.description && <p className="max-w-2xl text-sm text-muted-foreground">{text.description}</p>}
      </div>
    </div>
    {loading ? <p className="text-sm text-muted-foreground" role="status">{text.loading}</p> : failed ? <Alert variant="destructive"><AlertTitle>Couldn’t load schedule settings</AlertTitle><AlertDescription>{failed.error?.message} <Button type="button" variant="link" size="sm" onClick={() => void failed.refetch()}>Try again</Button></AlertDescription></Alert> : !organization || !league || !season ? <Alert><AlertTitle>Select a league and season</AlertTitle><AlertDescription>{text.noSeason}</AlertDescription></Alert> : season.status === 'completed' ? <Alert><AlertTitle>Season completed</AlertTitle><AlertDescription>{text.closed}</AlertDescription></Alert> : <ScheduleGenerator key={`${mode}-${season.id}`} presentation="page" seasonId={season.id} seasonName={season.name} seasonStart={season.start_date} seasonEnd={season.end_date} venues={venues.data ?? []} timeZone={league.time_zone} mode={mode} onClose={leave} onSaved={saved} onUnsavedChange={setUnsaved} />}
    {!loading && !failed && !organization && <Button variant="outline" nativeButton={false} render={<Link href="/organizations" />} className="w-fit">Choose organization</Button>}
  </main>
}

