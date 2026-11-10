'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { leagueRequest } from '@/lib/league-client'
import { Button } from '@/components/ui/button'
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

type ScheduleChange = {
  id: string
  changed_at: string
  old_scheduled_at: string | null
  new_scheduled_at: string | null
  old_venue_name: string | null
  new_venue_name: string | null
  old_duration_minutes: number | null
  new_duration_minutes: number | null
}

function localDate(value: string | null) {
  if (!value) return 'Not scheduled'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function duration(value: number | null) {
  return value == null ? 'Not specified' : `${value} min`
}

export function GameScheduleHistory({ gameId }: { gameId: string }) {
  const client = useQueryClient()
  const path = `games/${gameId}/schedule-history`
  const history = useQuery({ queryKey: ['league', path], queryFn: () => leagueRequest<ScheduleChange[]>(path, client), retry: false })
  const changes = history.data ? [...history.data].sort((a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime()) : []

  return <>
    <DialogHeader>
      <DialogTitle>Schedule history</DialogTitle>
      <DialogDescription>Previous changes to this game’s date, time, venue, and duration.</DialogDescription>
    </DialogHeader>
    {history.isPending ? <p role="status" className="text-sm text-muted-foreground">Loading schedule history…</p>
      : history.isError ? <div role="alert" className="flex flex-col gap-3 text-sm"><p className="text-destructive">{history.error.message}</p><Button type="button" variant="outline" onClick={() => void history.refetch()}>Try again</Button></div>
      : changes.length === 0 ? <p className="text-sm text-muted-foreground">No schedule changes yet.</p>
      : <ol className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
        {changes.map((change) => <li key={change.id} className="flex flex-col gap-3 rounded-md border p-4 text-sm">
          <p className="text-xs text-muted-foreground">Changed {localDate(change.changed_at)}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><p className="font-medium">Previous</p><p>{localDate(change.old_scheduled_at)}</p><p className="text-muted-foreground">{change.old_venue_name || 'No venue'}</p>{change.old_duration_minutes !== change.new_duration_minutes && <p className="text-muted-foreground">Duration: {duration(change.old_duration_minutes)}</p>}</div>
            <div><p className="font-medium">Updated</p><p>{localDate(change.new_scheduled_at)}</p><p className="text-muted-foreground">{change.new_venue_name || 'No venue'}</p>{change.old_duration_minutes !== change.new_duration_minutes && <p className="text-muted-foreground">Duration: {duration(change.new_duration_minutes)}</p>}</div>
          </div>
        </li>)}
      </ol>}
  </>
}
