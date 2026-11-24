'use client'

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftIcon, CloudOffIcon, LoaderCircleIcon, PauseIcon, PencilIcon, PlayIcon, TimerIcon, TrophyIcon, Undo2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from 'cn'
import { FinalBoxScore } from '@/components/final-box-score'
import { LiveBoxScore } from '@/components/live-box-score'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { leagueRequest } from '@/lib/league-client'
import { clockRemaining, describePlay, deviceId, formatClock, nextBatch, periodLabel, readOutbox, saveOutbox, SCORER_MOVED, withPending, type LivePlay, type LiveState, type LiveTeam, type OutboxItem, type PlayKind } from '@/lib/live-scoring'

const noSubscription = () => () => {}
const subscribeOnline = (callback: () => void) => {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => { window.removeEventListener('online', callback); window.removeEventListener('offline', callback) }
}
type Selection = { teamId: string; rosterId: string } | null
const actions: { kind: PlayKind; points?: number; label: string; tone?: 'score' | 'foul' }[] = [
  { kind: 'points', points: 1, label: '+1', tone: 'score' }, { kind: 'points', points: 2, label: '+2', tone: 'score' }, { kind: 'points', points: 3, label: '+3', tone: 'score' },
  { kind: 'rebound', label: 'REB' }, { kind: 'assist', label: 'AST' }, { kind: 'steal', label: 'STL' }, { kind: 'block', label: 'BLK' }, { kind: 'turnover', label: 'TO' },
  { kind: 'foul', label: 'FOUL', tone: 'foul' },
]

// The browser keeps the device ID and the queue of unsent plays, so the console renders only after hydration.
export function ScorekeeperConsole({ gameId }: { gameId: string }) {
  const hydrated = useSyncExternalStore(noSubscription, () => true, () => false)
  return hydrated ? <Console gameId={gameId} /> : <ConsoleSkeleton />
}

function ConsoleSkeleton() {
  return <main role="status" aria-label="Loading the game" className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-44 w-full rounded-xl" /><div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-72 rounded-xl" /><Skeleton className="h-72 rounded-xl" /></div></main>
}

function Console({ gameId }: { gameId: string }) {
  const client = useQueryClient()
  const path = `games/${gameId}/live`
  const key = ['league', path]
  const [device] = useState(() => deviceId())
  const [outbox, setOutbox] = useState<OutboxItem[]>(() => readOutbox(gameId))
  const [selected, setSelected] = useState<Selection>(null)
  const [dialog, setDialog] = useState<'period' | 'finish' | 'claim' | 'clock' | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [retry, setRetry] = useState(0)
  const [syncProblem, setSyncProblem] = useState('')
  const [lastPlayId, setLastPlayId] = useState<string | null>(null)
  const [lastUndone, setLastUndone] = useState(false)
  const [boxOpen, setBoxOpen] = useState(false)
  const [compact, setCompact] = useState(false)
  const scoreboardRef = useRef<HTMLElement>(null)
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true)
  const inFlight = useRef(0)
  const retryDelay = useRef(3000)
  // A poll that started before a play was saved must not replace the newer state the play returned.
  const live = useQuery({ queryKey: key, retry: false, refetchInterval: 5000, queryFn: async () => {
    const fresh = await leagueRequest<LiveState>(path, client)
    const previous = client.getQueryData<LiveState>(key)
    return previous && previous.status === fresh.status && fresh.version < previous.version ? previous : fresh
  } })
  const saved = live.data
  const view = saved ? withPending(saved, outbox) : null
  const isScorer = saved?.status === 'live' && saved.scorer?.deviceId === device
  const lastClock = [...outbox].reverse().find((item) => item.type === 'clock')
  const clockReadAt = lastClock?.type === 'clock' ? Date.parse(lastClock.at) : live.dataUpdatedAt
  const remaining = view ? clockRemaining(view.clock, clockReadAt, now) : 0
  const running = !!view?.clock?.running && remaining > 0
  const clockRef = useRef({ running, remaining })

  useEffect(() => {
    const node = scoreboardRef.current
    if (!node || saved?.status !== 'live') return
    const observer = new IntersectionObserver(([entry]) => setCompact(!entry.isIntersecting && entry.boundingClientRect.bottom <= 0))
    observer.observe(node)
    return () => observer.disconnect()
  }, [saved?.status])
  useEffect(() => { saveOutbox(gameId, outbox) }, [gameId, outbox])
  useEffect(() => { clockRef.current = { running, remaining } })

  // The clock ticks locally. When it reaches zero it stops itself, like a shot clock horn.
  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => {
      setNow(Date.now())
      if (clockRef.current.running && clockRef.current.remaining <= 100) {
        clockRef.current = { running: false, remaining: 0 }
        setOutbox((current) => [...current, { type: 'clock', running: false, remainingMs: 0, at: new Date().toISOString() }])
      }
    }, 100)
    return () => window.clearInterval(timer)
  }, [running])

  // Sends the queue in order. Network failures retry with a growing delay; a rejected play is dropped and reported.
  useEffect(() => {
    if (!isScorer || !online || !outbox.length || inFlight.current) return
    const batch = nextBatch(outbox)!
    inFlight.current = batch.items.length
    let timer = 0
    const send = async () => {
      const first = batch.items[0]
      try {
        const result = first.type === 'play'
          ? await leagueRequest<LiveState>(`${path}/events`, client, 'POST', { deviceId: device, events: batch.items.map((item) => item.type === 'play' ? item.play : null) })
          : first.type === 'void'
            ? await leagueRequest<LiveState>(`${path}/events/${first.eventId}/void`, client, 'POST', { deviceId: device })
            : await leagueRequest<LiveState>(`${path}/clock`, client, 'POST', { deviceId: device, running: first.running, remainingMs: first.remainingMs, at: first.at })
        client.setQueryData(['league', path], result)
        setOutbox((current) => current.slice(batch.items.length))
        setSyncProblem('')
        retryDelay.current = 3000
      } catch (error) {
        const message = error instanceof Error ? error.message : ''
        if (message === SCORER_MOVED) { void client.invalidateQueries({ queryKey: ['league', path] }); return }
        if (error instanceof TypeError || /unavailable|too many/i.test(message)) {
          setSyncProblem('Couldn’t reach Shotclock. Retrying…')
          timer = window.setTimeout(() => setRetry((value) => value + 1), retryDelay.current)
          retryDelay.current = Math.min(retryDelay.current * 2, 30000)
          return
        }
        setOutbox((current) => current.slice(batch.items.length))
        toast.error(`A change couldn’t be saved: ${message || 'please try again.'}`)
      } finally {
        inFlight.current = 0
      }
    }
    void send()
    return () => window.clearTimeout(timer)
  }, [outbox, online, isScorer, retry, client, device, path])

  const direct = useMutation({
    mutationFn: ({ action, body }: { action: 'start' | 'claim' | 'period' | 'finish'; body: object }) => leagueRequest<LiveState>(`${path}/${action}`, client, 'POST', { deviceId: device, ...body }),
    onSuccess: (result, { action }) => {
      client.setQueryData(key, result)
      setDialog(null)
      if (action === 'period') { setLastPlayId(null); setLastUndone(false) }
      if (action === 'finish') toast.success('Final score saved.')
      if (action === 'claim') toast.success('You’re scoring this game now.')
    },
    onError: (error) => toast.error(error.message),
  })

  function enqueue(item: OutboxItem) { setOutbox((current) => [...current, item]) }
  function record(kind: PlayKind, points?: number, teamId?: string) {
    if (!view) return
    const team = teamId ?? selected?.teamId
    if (!team) return
    const id = crypto.randomUUID()
    setLastPlayId(id)
    setLastUndone(false)
    enqueue({ type: 'play', play: { id, kind, ...(points ? { points } : {}), seasonTeamId: team, ...(kind !== 'timeout' && selected ? { rosterId: selected.rosterId } : {}), period: view.period, clockMs: Math.round(remaining), recordedAt: new Date().toISOString() } })
    if (kind !== 'timeout') setSelected(null)
  }
  // An unsent play is simply removed from the queue; a sent one is undone on the server.
  function undo(play: LivePlay) {
    if (play.id === lastPlayId) setLastUndone(true)
    const index = outbox.findIndex((item) => item.type === 'play' && item.play.id === play.id)
    if (index >= inFlight.current && index !== -1) setOutbox((current) => current.filter((item) => !(item.type === 'play' && item.play.id === play.id)))
    else enqueue({ type: 'void', eventId: play.id })
  }
  function setClock(nextRunning: boolean, remainingMs = Math.round(remaining)) {
    enqueue({ type: 'clock', running: nextRunning, remainingMs, at: new Date().toISOString() })
    setNow(Date.now())
  }

  useEffect(() => {
    if (!isScorer || boxOpen || dialog !== null) return
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || (event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'BUTTON'].includes(event.target.tagName))) return
      event.preventDefault()
      const current = clockRef.current
      setOutbox((items) => [...items, { type: 'clock', running: !current.running, remainingMs: Math.round(current.remaining), at: new Date().toISOString() }])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isScorer, boxOpen, dialog])

  if (live.isError && !saved) return <main className="mx-auto w-full max-w-3xl p-6"><Alert variant="destructive"><AlertTitle>Couldn’t load this game</AlertTitle><AlertDescription><p>{live.error.message}</p><div className="mt-3 flex gap-2"><Button variant="outline" size="sm" onClick={() => void live.refetch()}>Try again</Button><Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/scorekeeping" />}>Back to games</Button></div></AlertDescription></Alert></main>
  if (!view || !saved) return <ConsoleSkeleton />

  const label = periodLabel(view.period, view.format.periodCount)
  const regulationDone = view.period >= view.format.periodCount
  const tied = view.home.score === view.away.score
  const busy = direct.isPending || outbox.length > 0 || !online
  const syncLabel = !online ? `Offline · ${outbox.length} waiting` : outbox.length ? `Syncing ${outbox.length}` : 'Saved'

  return <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-3 pb-80 sm:p-6 sm:pb-52">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <Button variant="ghost" size="icon-sm" aria-label="Back to games" nativeButton={false} render={<Link href="/scorekeeping" />}><ArrowLeftIcon /></Button>
        <div className="flex min-w-0 flex-col"><span className="truncate text-sm font-medium">{view.home.name} vs {view.away.name}</span><span className="truncate text-xs text-muted-foreground">{[view.leagueName, view.divisionName, view.venueName].filter(Boolean).join(' · ')}</span></div>
      </div>
      {view.status === 'live' && isScorer && <span role="status" className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium', !online ? 'border-amber-600/30 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' : 'text-muted-foreground')}>
        {!online ? <CloudOffIcon aria-hidden="true" className="size-3.5" /> : outbox.length ? <LoaderCircleIcon aria-hidden="true" className="size-3.5 animate-spin" /> : null}{syncLabel}
      </span>}
    </header>
    {syncProblem && online && <p role="alert" className="text-sm text-amber-700 dark:text-amber-300">{syncProblem}</p>}

    {view.status === 'scheduled' && <StartGame view={view} pending={direct.isPending} onStart={(format) => direct.mutate({ action: 'start', body: format })} />}

    {view.status === 'live' && !isScorer && <Alert><TimerIcon /><AlertTitle>{view.scorer ? `${view.scorer.name ?? 'Someone'} is scoring this game on another device` : 'No device is scoring this game'}</AlertTitle><AlertDescription><p>Take over to record plays here. The other device will stop saving plays.{outbox.length ? ` ${outbox.length} unsaved ${outbox.length === 1 ? 'change' : 'changes'} on this device will be sent after you take over.` : ''}</p><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" onClick={() => setDialog('claim')}>Take over scoring</Button>{outbox.length > 0 && <Button size="sm" variant="ghost" onClick={() => setOutbox([])}>Discard unsaved changes</Button>}</div></AlertDescription></Alert>}

    {view.status === 'live' && compact && <div className="fixed inset-x-0 top-0 z-30 bg-zinc-950 px-3 py-2 text-white shadow-md" aria-label="Compact scoreboard">
      <div className="mx-auto flex max-w-6xl items-center gap-2 text-sm">
        <span className="flex min-w-0 flex-1 items-center gap-1"><span className="min-w-0 truncate" title={view.home.name}>{view.home.name}</span><strong className="tabular-nums">{view.home.score}</strong></span>
        <span className="shrink-0 font-mono tabular-nums">{label} {formatClock(remaining)}</span>
        <span className="flex min-w-0 flex-1 items-center justify-end gap-1"><strong className="tabular-nums">{view.away.score}</strong><span className="min-w-0 truncate" title={view.away.name}>{view.away.name}</span></span>
        {isScorer && <Button size="sm" onClick={() => setClock(!running)} disabled={remaining === 0 && !running}>{running ? 'Stop' : 'Start'}</Button>}
        <Button size="sm" variant="outline" onClick={() => setBoxOpen(true)}>Box score</Button>
      </div>
    </div>}
    {view.status === 'live' && <section ref={scoreboardRef} aria-label="Scoreboard" className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch gap-2 rounded-xl border bg-card p-3 sm:gap-4 sm:p-5">
      <TeamScore team={view.home} align="start" />
      <div className="flex flex-col items-center justify-center gap-2 px-1">
        <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</span>
        {view.status === 'live' && <>
          <span aria-live="off" className={cn('font-mono text-4xl font-semibold tabular-nums sm:text-5xl', remaining === 0 && 'text-destructive')}>{formatClock(remaining)}</span>
          {isScorer && <div className="flex gap-1.5">
            <Button size="sm" variant={running ? 'secondary' : 'default'} onClick={() => setClock(!running)} disabled={remaining === 0 && !running}>{running ? <><PauseIcon data-icon="inline-start" />Stop</> : <><PlayIcon data-icon="inline-start" />Start</>}</Button>
            <Button size="icon-sm" variant="outline" aria-label="Adjust clock" disabled={running} onClick={() => setDialog('clock')}><PencilIcon /></Button>
          </div>}
        </>}
      </div>
      <TeamScore team={view.away} align="end" />
      <div className="col-span-3 flex justify-center"><Button size="sm" variant="outline" onClick={() => setBoxOpen(true)}>Box score</Button></div>
      {view.status === 'live' && isScorer && <div className="col-span-3 flex flex-wrap items-center justify-center gap-2 border-t pt-3">
        {!regulationDone || tied
          ? <Button variant="outline" size="sm" disabled={running || busy} onClick={() => setDialog('period')}>{regulationDone ? 'Start overtime' : `End ${label}`}</Button>
          : <Button size="sm" disabled={running || busy} onClick={() => setDialog('finish')}><TrophyIcon data-icon="inline-start" />End game</Button>}
        {(running || busy) && <span className="text-xs text-muted-foreground">{running ? 'Stop the clock first.' : outbox.length ? 'Waiting for plays to sync.' : !online ? 'Reconnect to continue.' : ''}</span>}
      </div>}
    </section>}

    {view.status === 'live' && <div className="grid gap-4 md:grid-cols-2">
      <TeamPanel team={view.home} selected={selected} disabled={!isScorer} onSelect={setSelected} onTimeout={() => record('timeout', undefined, view.home.seasonTeamId!)} />
      <TeamPanel team={view.away} selected={selected} disabled={!isScorer} onSelect={setSelected} onTimeout={() => record('timeout', undefined, view.away.seasonTeamId!)} />
    </div>}

    {view.status === 'live' && <RecentPlays view={view} canUndo={isScorer} onUndo={undo} />}
    {view.status === 'completed' && <FinalBoxScore view={view} />}

    {view.status === 'live' && isScorer && <ActionPad selected={selected} view={view} lastPlay={view.plays.find((play) => play.id === lastPlayId) ?? null} lastUndone={lastUndone} onUndo={undo} onAction={(kind, points) => record(kind, points)} onClear={() => setSelected(null)} />}

    <LiveBoxScore view={view} open={boxOpen && view.status === 'live'} onOpenChange={setBoxOpen} />
    <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open && !direct.isPending) setDialog(null) }}>
      <DialogContent className="sm:max-w-md">
        {dialog === 'period' && <Confirm title={regulationDone ? 'Start overtime?' : `End ${label}?`} body={regulationDone ? `The score is tied, so the game goes to overtime with a ${view.format.overtimeMinutes}-minute clock.` : `The clock resets for ${periodLabel(view.period + 1, view.format.periodCount)} and team fouls start again.`} action={regulationDone ? 'Start overtime' : 'End period'} pending={direct.isPending} onConfirm={() => direct.mutate({ action: 'period', body: {} })} onCancel={() => setDialog(null)} />}
        {dialog === 'finish' && <Confirm title="End the game?" body={`Final score: ${view.home.name} ${view.home.score}, ${view.away.name} ${view.away.score}. The result and player stats are saved and standings update.`} action="End game" pending={direct.isPending} onConfirm={() => direct.mutate({ action: 'finish', body: {} })} onCancel={() => setDialog(null)} />}
        {dialog === 'claim' && <Confirm title="Take over scoring?" body="This device becomes the only one that can record plays. The other device stops saving plays immediately." action="Take over" pending={direct.isPending} onConfirm={() => direct.mutate({ action: 'claim', body: {} })} onCancel={() => setDialog(null)} />}
        {dialog === 'clock' && <ClockForm remaining={remaining} max={(view.period > view.format.periodCount ? view.format.overtimeMinutes : view.format.periodMinutes) * 60000} onSave={(ms) => { setClock(false, ms); setDialog(null) }} onCancel={() => setDialog(null)} />}
      </DialogContent>
    </Dialog>
  </main>
}

function TeamScore({ team, align }: { team: LiveTeam; align: 'start' | 'end' }) {
  return <div className={cn('flex min-w-0 flex-col gap-1', align === 'end' && 'items-end text-right')}>
    <span className="truncate text-sm font-medium sm:text-base" title={team.name}>{team.name}</span>
    <span aria-live="polite" className="text-5xl font-semibold tabular-nums sm:text-6xl">{team.score}</span>
    <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <span>Fouls {team.teamFouls}</span><span aria-hidden="true">·</span><span>TOL used {team.timeouts}</span>
      {team.inBonus && <Badge variant="outline" className="border-amber-600/30 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">Bonus</Badge>}
    </span>
  </div>
}

function TeamPanel({ team, selected, disabled, onSelect, onTimeout }: { team: LiveTeam; selected: Selection; disabled: boolean; onSelect: (value: Selection) => void; onTimeout: () => void }) {
  return <Card className="gap-0 py-0">
    <CardHeader className="items-center border-b py-3 [.border-b]:pb-3">
      <CardTitle><h2 className="truncate text-base font-semibold">{team.name}</h2></CardTitle>
      <Button variant="outline" size="sm" className="col-start-2 row-start-1 self-center" disabled={disabled} onClick={onTimeout}><TimerIcon data-icon="inline-start" />Timeout</Button>
    </CardHeader>
    <CardContent className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-2">
      {team.players.length ? team.players.map((player) => {
        const active = selected?.rosterId === player.rosterId
        return <button key={player.rosterId} type="button" disabled={disabled} aria-pressed={active} onClick={() => onSelect(active ? null : { teamId: team.seasonTeamId!, rosterId: player.rosterId })}
          className={cn('flex min-h-14 min-w-0 items-center gap-2.5 rounded-lg border bg-background px-2.5 py-2 text-left transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-60',
            active && 'border-primary bg-primary/5 ring-2 ring-primary/30')}>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted font-mono text-sm font-semibold tabular-nums">{player.jersey ?? '–'}</span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">{player.name}</span>
            <span className={cn('text-xs tabular-nums text-muted-foreground', player.fouls >= 5 && 'font-medium text-destructive')}>{player.points} pts · {player.fouls >= 5 ? 'Fouled out' : `${player.fouls} F`}</span>
          </span>
        </button>
      }) : <p className="col-span-2 py-6 text-center text-sm text-muted-foreground">No players on this roster.</p>}
    </CardContent>
  </Card>
}

function ActionPad({ selected, view, lastPlay, lastUndone, onUndo, onAction, onClear }: { selected: Selection; view: LiveState; lastPlay: LivePlay | null; lastUndone: boolean; onUndo: (play: LivePlay) => void; onAction: (kind: PlayKind, points?: number) => void; onClear: () => void }) {
  const player = selected ? [...view.home.players, ...view.away.players].find((item) => item.rosterId === selected.rosterId) : null
  const lastTeam = lastPlay?.seasonTeamId === view.home.seasonTeamId ? view.home : view.away
  const lastPlayer = lastTeam.players.find((item) => item.rosterId === lastPlay?.rosterId)
  return <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 p-3 sm:px-6">
      <div className="flex min-h-6 items-center justify-between gap-2 text-sm">
        <span className={cn('truncate', !player && 'text-muted-foreground')}>{player ? <>Recording for <span className="font-medium">#{player.jersey ?? '–'} {player.name}</span></> : 'Choose a player, then a play'}</span>
        {player && <Button variant="ghost" size="xs" onClick={onClear}>Clear</Button>}
      </div>
      {(lastPlay || lastUndone) && <div className="flex min-w-0 items-center justify-between gap-2 text-sm" aria-live="polite">
        <span className="min-w-0 truncate text-muted-foreground">{lastUndone ? 'Last play undone' : lastPlay && <>{lastTeam.name} · {lastPlayer?.jersey != null && `#${lastPlayer.jersey} `}{lastPlay.player ?? 'Team timeout'} · {describePlay({ ...lastPlay, player: null })}</>}</span>
        {lastPlay && !lastUndone && !lastPlay.voided && <Button variant="outline" size="sm" onClick={() => onUndo(lastPlay)}><Undo2Icon data-icon="inline-start" />Undo</Button>}
      </div>}
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-9">{actions.map((action) => <Button key={action.label} size="lg" variant={action.tone === 'score' ? 'default' : action.tone === 'foul' ? 'destructive' : 'outline'} disabled={!player} onClick={() => onAction(action.kind, action.points)} className="h-12 font-semibold tabular-nums">{action.label}</Button>)}</div>
    </div>
  </div>
}

function RecentPlays({ view, canUndo, onUndo }: { view: LiveState; canUndo: boolean; onUndo: (play: LivePlay) => void }) {
  const teamName = (id: string | null) => id === view.home.seasonTeamId ? view.home.name : id === view.away.seasonTeamId ? view.away.name : ''
  const plays = view.plays.slice(0, 12)
  return <Card className="gap-0 py-0">
    <CardHeader className="border-b py-3 [.border-b]:pb-3"><CardTitle><h2 className="text-base font-semibold">Recent plays</h2></CardTitle></CardHeader>
    {plays.length ? <ul className="divide-y">{plays.map((play) => <li key={play.id} className={cn('flex items-center gap-3 px-4 py-2.5 text-sm', play.voided && 'text-muted-foreground line-through')}>
      <span className="w-20 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{periodLabel(play.period, view.format.periodCount)} {play.clockMs !== null ? formatClock(play.clockMs) : ''}</span>
      <span className="min-w-0 flex-1 truncate">{play.kind === 'period_end' ? `End of ${periodLabel(play.period, view.format.periodCount)}` : <>{describePlay(play)} <span className="text-muted-foreground">· {teamName(play.seasonTeamId)}</span></>}</span>
      {play.pending && <span className="text-xs text-muted-foreground no-underline">Waiting</span>}
      {canUndo && !play.voided && play.kind !== 'period_end' && <Button variant="ghost" size="icon-xs" aria-label={`Undo ${describePlay(play)}`} onClick={() => onUndo(play)}><Undo2Icon /></Button>}
    </li>)}</ul> : <p className="px-4 py-6 text-center text-sm text-muted-foreground">Plays appear here as you record them.</p>}
  </Card>
}

function StartGame({ view, pending, onStart }: { view: LiveState; pending: boolean; onStart: (format: LiveState['format']) => void }) {
  const [format, setFormat] = useState(view.format)
  const teamsKnown = !!view.home.seasonTeamId && !!view.away.seasonTeamId
  const field = (name: keyof LiveState['format'], label: string, min: number, max: number, description?: string) => <Field className="gap-2">
    <FieldLabel htmlFor={`format-${name}`}>{label}</FieldLabel>
    <Input id={`format-${name}`} type="number" inputMode="numeric" min={min} max={max} value={format[name]} aria-describedby={description ? `format-${name}-description` : undefined} onChange={(event) => setFormat((current) => ({ ...current, [name]: Math.min(max, Math.max(min, Number(event.target.value) || min)) }))} className="h-11 bg-background tabular-nums" />
    {description && <FieldDescription id={`format-${name}-description`}>{description}</FieldDescription>}
  </Field>
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); onStart(format) }
  return <Card className="mx-auto w-full max-w-2xl gap-0 py-0">
    <div className="bg-zinc-950 px-5 py-6 text-white sm:px-8 sm:py-7 dark:bg-zinc-900">
      <h1 className="text-lg font-semibold">Game setup</h1>
      <p className="mt-1 text-sm text-zinc-300">Check the matchup and game format before starting.</p>
      <div className="mt-6 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:gap-6">
        <div className="min-w-0"><p className="text-xs font-medium text-zinc-300">Home</p><p className="mt-1 break-words text-lg font-semibold sm:text-xl">{view.home.name}</p></div>
        <span className="text-xs font-medium text-zinc-400">VS</span>
        <div className="min-w-0 text-right"><p className="text-xs font-medium text-zinc-300">Away</p><p className="mt-1 break-words text-lg font-semibold sm:text-xl">{view.away.name}</p></div>
      </div>
    </div>
    <CardContent className="px-5 py-6 sm:px-8 sm:py-7">
      <div className="grid gap-3 sm:grid-cols-2"><RosterCheck team={view.home} /><RosterCheck team={view.away} /></div>
      {view.seasonStatus !== 'active' ? <Alert><AlertTitle>The season hasn’t started</AlertTitle><AlertDescription>The league owner needs to start the season before games can be scored.</AlertDescription></Alert>
        : !teamsKnown ? <Alert><AlertTitle>Teams aren’t set yet</AlertTitle><AlertDescription>This playoff game gets its teams when the earlier results are recorded.</AlertDescription></Alert>
        : <form onSubmit={submit} className="flex flex-col gap-6">
          <div><h2 className="text-base font-semibold">Game format</h2><p className="mt-1 text-sm text-muted-foreground">Review the settings for this game.</p></div>
          <FieldGroup className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
            {field('periodCount', 'Periods', 1, 8, 'For example, 4 quarters or 2 halves.')}
            {field('periodMinutes', 'Minutes per period', 1, 30)}
            {field('overtimeMinutes', 'Overtime minutes', 1, 15)}
            {field('bonusFouls', 'Bonus after team fouls', 1, 10, 'A team is in the bonus once the other team reaches this many fouls in a period.')}
          </FieldGroup>
          <div className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><TimerIcon aria-hidden="true" className="size-4 shrink-0" />The clock starts stopped.</p>
            <Button type="submit" size="lg" disabled={pending} className="w-full sm:w-auto sm:min-w-36">{pending ? 'Starting…' : 'Start game'}</Button>
          </div>
        </form>}
    </CardContent>
  </Card>
}

function RosterCheck({ team }: { team: LiveTeam }) {
  if (!team.seasonTeamId) return <p className="text-sm text-muted-foreground">Team pending</p>
  const missing = team.players.filter((player) => player.jersey === null).length
  return <details className="rounded-lg border p-3 text-sm">
    <summary className="cursor-pointer font-medium">{team.name} · {team.players.length} {team.players.length === 1 ? 'player' : 'players'}{team.players.length === 0 && <span className="block text-amber-700 dark:text-amber-400">No players on this roster</span>}{missing > 0 && <span className="block text-amber-700 dark:text-amber-400">{missing} missing jersey {missing === 1 ? 'number' : 'numbers'}</span>}</summary>
    {!team.players.length ? <p className="mt-2 text-amber-700 dark:text-amber-400">No players on this roster.</p> : <>
      <ul className="mt-2 space-y-1 text-muted-foreground">{team.players.map((player) => <li key={player.rosterId}>#{player.jersey ?? '–'} {player.name}</li>)}</ul>
    </>}
  </details>
}

function Confirm({ title, body, action, pending, onConfirm, onCancel }: { title: string; body: string; action: string; pending: boolean; onConfirm: () => void; onCancel: () => void }) {
  return <>
    <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{body}</DialogDescription></DialogHeader>
    <DialogFooter><Button variant="outline" disabled={pending} onClick={onCancel}>Cancel</Button><Button disabled={pending} onClick={onConfirm}>{pending ? 'Saving…' : action}</Button></DialogFooter>
  </>
}

function ClockForm({ remaining, max, onSave, onCancel }: { remaining: number; max: number; onSave: (ms: number) => void; onCancel: () => void }) {
  const [minutes, setMinutes] = useState(String(Math.floor(remaining / 60000)))
  const [seconds, setSeconds] = useState(String(Math.floor((remaining % 60000) / 1000)))
  const total = (Number(minutes) || 0) * 60000 + (Number(seconds) || 0) * 1000
  const invalid = total > max || Number(seconds) > 59
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!invalid) onSave(total) }
  return <form onSubmit={submit} className="flex flex-col gap-4">
    <DialogHeader><DialogTitle>Adjust the clock</DialogTitle><DialogDescription>Match the official clock. The period is {formatClock(max)} long.</DialogDescription></DialogHeader>
    <div className="grid grid-cols-2 gap-3">
      <Field><FieldLabel htmlFor="clock-minutes">Minutes</FieldLabel><Input id="clock-minutes" type="number" inputMode="numeric" min={0} max={30} value={minutes} onChange={(event) => setMinutes(event.target.value)} autoFocus /></Field>
      <Field><FieldLabel htmlFor="clock-seconds">Seconds</FieldLabel><Input id="clock-seconds" type="number" inputMode="numeric" min={0} max={59} value={seconds} onChange={(event) => setSeconds(event.target.value)} /></Field>
    </div>
    {invalid && <p role="alert" className="text-sm text-destructive">Enter a time up to {formatClock(max)}.</p>}
    <DialogFooter><Button type="button" variant="outline" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={invalid}>Set clock</Button></DialogFooter>
  </form>
}


