'use client'

import { useWorkspace } from '@/components/workspace-context'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function WorkspaceSwitcher() {
  const { organization, leagues, league, seasons, season, changeLeague, changeSeason } = useWorkspace()
  if (!organization) return null
  return <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:ml-auto sm:w-auto" aria-label="Current workspace">
    <Select value={league?.id ?? null} onValueChange={(value) => { if (value) changeLeague(value) }} items={(leagues.data ?? []).map((item) => ({ value: item.id, label: item.name }))} disabled={!leagues.data?.length}>
      <SelectTrigger aria-label="Workspace league" className="min-w-0 flex-1 sm:w-44 sm:flex-none"><SelectValue placeholder={leagues.isLoading ? 'Loading leagues…' : leagues.data?.length ? 'Choose league' : 'No leagues'} /></SelectTrigger>
      <SelectContent alignItemWithTrigger={false}><SelectGroup>{leagues.data?.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent>
    </Select>
    <Select value={season?.id ?? null} onValueChange={(value) => { if (value) changeSeason(value) }} items={(seasons.data ?? []).map((item) => ({ value: item.id, label: item.name }))} disabled={!league || !seasons.data?.length}>
      <SelectTrigger aria-label="Workspace season" className="min-w-0 flex-1 sm:w-44 sm:flex-none"><SelectValue placeholder={!league ? 'Choose a league first' : seasons.isLoading ? 'Loading seasons…' : seasons.data?.length ? 'Choose season' : 'No seasons'} /></SelectTrigger>
      <SelectContent alignItemWithTrigger={false}><SelectGroup>{seasons.data?.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent>
    </Select>
  </div>
}
