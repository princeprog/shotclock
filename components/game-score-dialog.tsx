'use client'

import { useRef, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { TrophyIcon } from 'lucide-react'
import { cn } from 'cn'
import { leagueRequest } from '@/lib/league-client'
import { Button } from '@/components/ui/button'
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

type ScoreGame = {
  id: string
  home_name: string
  away_name: string
  division_name: string
  scheduled_at: string | null
  venue_name: string | null
  status: string
  home_score: number | null
  away_score: number | null
  forfeited_by_season_team_id: string | null
}

const scoreValue = (value: string) => (/^\d{1,4}$/.test(value) ? Number(value) : null)

export function GameScoreDialog({ game, stage, onClose, onSaved, onPendingChange }: { game: ScoreGame; stage?: string | null; onClose: () => void; onSaved: () => void; onPendingChange?: (pending: boolean) => void }) {
  const client = useQueryClient()
  const [scores, setScores] = useState({ home: game.home_score?.toString() ?? '', away: game.away_score?.toString() ?? '' })
  const submitting = useRef(false)
  const mutation = useMutation({ mutationFn: (body: { homeScore: number; awayScore: number }) => leagueRequest(`games/${game.id}/score`, client, 'POST', body) })
  const home = scoreValue(scores.home)
  const away = scoreValue(scores.away)
  const tied = home !== null && home === away
  const winner = home === null || away === null || tied ? null : home > away ? 'home' : 'away'
  const correcting = game.status === 'completed'
  const unchanged = correcting && !game.forfeited_by_season_team_id && home === game.home_score && away === game.away_score
  const when = game.scheduled_at ? new Date(game.scheduled_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : null
  const details = [game.division_name, stage, when, game.venue_name].filter(Boolean).join(' · ')
  const change = (side: 'home' | 'away') => (event: { target: { value: string } }) => {
    const value = event.target.value.replace(/\D/g, '').slice(0, 4)
    setScores((current) => ({ ...current, [side]: value }))
    if (mutation.isError) mutation.reset()
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!winner || unchanged || submitting.current) return
    submitting.current = true
    onPendingChange?.(true)
    let saved = false
    try {
      await mutation.mutateAsync({ homeScore: home!, awayScore: away! })
      saved = true
    } catch {
      // The request error is shown below the scoreboard.
    } finally {
      submitting.current = false
      onPendingChange?.(false)
    }
    if (saved) onSaved()
  }

  const message = mutation.isError ? { tone: 'error', text: mutation.error.message } : tied ? { tone: 'error', text: 'Scores can’t be tied.' } : game.forfeited_by_season_team_id ? { tone: 'muted', text: 'Saving replaces the forfeit result.' } : null

  return <>
    <DialogHeader>
      <DialogTitle>{correcting ? 'Correct final score' : 'Record final score'}</DialogTitle>
      <DialogDescription>{details}</DialogDescription>
    </DialogHeader>
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <fieldset disabled={mutation.isPending} className="flex flex-col gap-3">
        <legend className="sr-only">Final score</legend>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2 sm:gap-3">
          <ScoreSide id="home-score" side="Home" name={game.home_name} value={scores.home} winner={winner === 'home'} invalid={tied} onChange={change('home')} autoFocus />
          <span aria-hidden="true" className="mb-4 flex h-16 items-center text-xl font-light text-muted-foreground">–</span>
          <ScoreSide id="away-score" side="Away" name={game.away_name} value={scores.away} winner={winner === 'away'} invalid={tied} onChange={change('away')} />
        </div>
        <p id="score-message" aria-live="polite" className={cn('min-h-5 text-sm', message?.tone === 'error' ? 'text-destructive' : 'text-muted-foreground')}>{message?.text}</p>
      </fieldset>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
        <Button type="submit" disabled={!winner || unchanged || mutation.isPending}>{mutation.isPending ? 'Saving…' : correcting ? 'Save correction' : 'Save score'}</Button>
      </DialogFooter>
    </form>
  </>
}

function ScoreSide({ id, side, name, value, winner, invalid, onChange, autoFocus }: { id: string; side: string; name: string; value: string; winner: boolean; invalid: boolean; onChange: (event: { target: { value: string } }) => void; autoFocus?: boolean }) {
  return <div className={cn('flex min-w-0 flex-col gap-2 rounded-xl border p-3 transition-colors duration-200 sm:p-4', winner ? 'border-emerald-600/40 bg-emerald-50 dark:bg-emerald-950/30' : 'bg-muted/30')}>
    <div className="flex h-5 items-center justify-between gap-2">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{side}</span>
      {winner && <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400"><TrophyIcon aria-hidden="true" className="size-3.5" />Winner</span>}
    </div>
    <label htmlFor={id} className="line-clamp-2 min-h-10 font-semibold leading-5 break-words">{name}<span className="sr-only"> score</span></label>
    <Input id={id} name={id} value={value} onChange={onChange} autoFocus={autoFocus} autoComplete="off" inputMode="numeric" pattern="[0-9]*" placeholder="–" aria-invalid={invalid || undefined} aria-describedby="score-message" className="h-16 bg-background text-center text-3xl font-semibold tabular-nums placeholder:font-light placeholder:text-muted-foreground/40 md:text-3xl" />
  </div>
}

