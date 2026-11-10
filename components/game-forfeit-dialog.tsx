'use client'

import { useRef, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { leagueRequest } from '@/lib/league-client'
import { Button } from '@/components/ui/button'
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type Game = {
  id: string
  home_name: string
  away_name: string
  home_season_team_id: string
  away_season_team_id: string
  forfeited_by_season_team_id?: string | null
}

export function GameForfeitDialog({ game, onClose, onSaved, onPendingChange }: { game: Game; onClose: () => void; onSaved: () => void; onPendingChange?: (pending: boolean) => void }) {
  const client = useQueryClient()
  const [teamId, setTeamId] = useState(game.forfeited_by_season_team_id ?? '')
  const submitting = useRef(false)
  const mutation = useMutation({
    mutationFn: (forfeitingTeamId: string) => leagueRequest(`games/${game.id}/forfeit`, client, 'POST', { forfeitingTeamId }),
  })
  const winner = teamId === game.home_season_team_id ? game.away_name : teamId === game.away_season_team_id ? game.home_name : null

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!winner || submitting.current) return
    submitting.current = true
    onPendingChange?.(true)
    let saved = false
    try {
      await mutation.mutateAsync(teamId)
      saved = true
    } catch {
      // The request error is displayed in the form.
    } finally {
      submitting.current = false
      onPendingChange?.(false)
    }
    if (saved) onSaved()
  }

  return <>
    <DialogHeader>
      <DialogTitle>{game.forfeited_by_season_team_id ? 'Correct forfeit' : 'Mark game as forfeit'}</DialogTitle>
      <DialogDescription>Choose the team that did not play. The other team will be awarded the win.</DialogDescription>
    </DialogHeader>
    <form onSubmit={submit} className="flex flex-col gap-5">
      <Field>
        <FieldLabel htmlFor="forfeiting-team" required>Absent team</FieldLabel>
        <Select value={teamId || null} onValueChange={(value) => setTeamId(value ?? '')} disabled={mutation.isPending} items={[{ value: null, label: 'Select a team' }, { value: game.home_season_team_id, label: game.home_name }, { value: game.away_season_team_id, label: game.away_name }]}>
          <SelectTrigger id="forfeiting-team" aria-required="true" className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent alignItemWithTrigger={false}><SelectGroup>
            <SelectItem value={game.home_season_team_id}>{game.home_name}</SelectItem>
            <SelectItem value={game.away_season_team_id}>{game.away_name}</SelectItem>
          </SelectGroup></SelectContent>
        </Select>
      </Field>
      {winner && <p className="rounded-md border bg-muted/40 p-3 text-sm"><span className="font-medium">{winner}</span> will win by forfeit, <span className="font-medium">20–0</span>.</p>}
      {mutation.isError && <p role="alert" className="text-sm text-destructive">{mutation.error.message}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
        <Button type="submit" disabled={!winner || mutation.isPending}>{mutation.isPending ? 'Saving…' : 'Confirm forfeit'}</Button>
      </DialogFooter>
    </form>
  </>
}
