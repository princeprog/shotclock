'use client'

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftIcon, CloudOffIcon, LoaderCircleIcon, CheckIcon, ChevronDownIcon, ChevronRightIcon, ListOrderedIcon, PauseIcon, PencilIcon, PlayIcon, TimerIcon, Undo2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from 'cn'
import { FinalBoxScore } from '@/components/final-box-score'
import { ShotclockLogo } from '@/components/shotclock-logo'
import { LiveBoxScore } from '@/components/live-box-score'
import { deskClock, GameFlowBoard, ScoringWorkspace, type PlayerSelection } from '@/components/scoring-workspace'
import styles from './scorekeeper-console.module.css'
import { ShotClockControls } from '@/components/shot-clock-controls'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { leagueRequest } from '@/lib/league-client'
import { clockRemaining, clockServerOffset, clockServerTimestamp, describePlay, deviceId, formatClock, nextBatch, periodLabel, readOutbox, saveOutbox, SCORER_MOVED, withPending, type LivePlay, type LiveState, type LiveTeam, type OutboxItem, type PlayKind } from '@/lib/live-scoring'

const noSubscription = () => () => {}
const subscribeOnline = (callback: () => void) => {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => { window.removeEventListener('online', callback); window.removeEventListener('offline', callback) }
}
type StartFormat = LiveState['format'] & { shotClockEnabled: boolean; shotClockFullSeconds: number; shotClockShortSeconds: number }
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
  const [selected, setSelected] = useState<PlayerSelection>(null)
  const [freshPlayId, setFreshPlayId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<'period' | 'finish' | 'claim' | 'clock' | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [retry, setRetry] = useState(0)
  const [syncProblem, setSyncProblem] = useState('')
  const [boxOpen, setBoxOpen] = useState(false)
  const [compact, setCompact] = useState(false)
  const clockStripRef = useRef<HTMLDivElement>(null)
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true)
  const inFlight = useRef(0)
  const retryDelay = useRef(3000)
  // A poll that started before a play was saved must not replace the newer state the play returned.
  const live = useQuery({ queryKey: key, retry: false, refetchInterval: 5000, queryFn: async () => {
    const fresh = await leagueRequest<LiveState>(path, client)
    const previous = client.getQueryData<LiveState>(key)
    if (previous && previous.status === fresh.status && fresh.version < previous.version) throw new Error('Received an older game state')
    return fresh
  } })
  const saved = live.data
  const view = saved ? withPending(saved, outbox) : null
  const isScorer = saved?.status === 'live' && saved.scorer?.deviceId === device
  const queueBlocked = syncProblem.startsWith('Clock control changed')
  const serverOffset = clockServerOffset(saved?.clock ?? null, live.dataUpdatedAt)
  const lastClock = [...outbox].reverse().find((item) => item.type === 'clock')
  const clockReadAt = lastClock?.type === 'clock' ? Date.parse(lastClock.at) - serverOffset : live.dataUpdatedAt
  const remaining = view ? clockRemaining(view.clock, clockReadAt, now) : 0
  const running = !!view?.clock?.running && remaining > 0
  const clockRef = useRef({ running, remaining })
  const epochRef = useRef(saved?.shotClock?.scorerEpoch)
  const offsetRef = useRef(serverOffset)

  useEffect(() => {
    // The compact bar appears once the clock strip scrolls away, so both clocks stay in reach.
    const node = clockStripRef.current
    if (!node || saved?.status !== 'live') return
    const observer = new IntersectionObserver(([entry]) => setCompact(entry.intersectionRatio < 1 && entry.boundingClientRect.top < 0), { threshold: 1 })
    observer.observe(node)
    return () => observer.disconnect()
  }, [saved?.status])
  // The receipt's orange wash confirms a play this device just recorded, once.
  useEffect(() => {
    if (!freshPlayId) return
    const timer = window.setTimeout(() => setFreshPlayId(null), 1400)
    return () => window.clearTimeout(timer)
  }, [freshPlayId])
  useEffect(() => { saveOutbox(gameId, outbox) }, [gameId, outbox])
  useEffect(() => { clockRef.current = { running, remaining }; epochRef.current = saved?.shotClock?.scorerEpoch; offsetRef.current = serverOffset })

  useEffect(() => {
    if (!isScorer || !online || outbox.length || saved?.shotClock?.mode !== 'dual') return
    const epoch = saved.shotClock.epoch
    const send = () => { void leagueRequest(`${path}/shot-clock/heartbeat`, client, 'POST', { deviceId: device, epoch }).catch(() => {}) }
    send()
    const timer = window.setInterval(send, 5000)
    return () => window.clearInterval(timer)
  }, [isScorer, online, outbox.length, saved?.shotClock?.mode, saved?.shotClock?.epoch, path, client, device])

  // The clock ticks locally. When it reaches zero it stops itself, like a shot clock horn.
  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => {
      setNow(Date.now())
      if (isScorer && !queueBlocked && clockRef.current.running && clockRef.current.remaining <= 100) {
        clockRef.current = { running: false, remaining: 0 }
        setOutbox((current) => [...current, { type: 'clock', running: false, remainingMs: 0, at: clockServerTimestamp(offsetRef.current), epoch: epochRef.current }])
      }
    }, 100)
    return () => window.clearInterval(timer)
  }, [running, isScorer, queueBlocked])

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
          ? await leagueRequest<LiveState>(`${path}/events`, client, 'POST', { deviceId: device, epoch: first.epoch, events: batch.items.map((item) => item.type === 'play' ? item.play : null) })
          : first.type === 'void'
            ? await leagueRequest<LiveState>(`${path}/events/${first.eventId}/void`, client, 'POST', { deviceId: device, epoch: first.epoch })
            : first.type === 'shot-clock'
              ? await leagueRequest<LiveState>(`${path}/shot-clock`, client, 'POST', { deviceId: device, commandId: first.commandId, epoch: first.epoch, running: first.running, remainingMs: first.remainingMs, visible: first.visible, at: first.at })
            : await leagueRequest<LiveState>(`${path}/clock`, client, 'POST', { deviceId: device, epoch: first.epoch, running: first.running, remainingMs: first.remainingMs, at: first.at })
        client.setQueryData(['league', path], result)
        setOutbox((current) => current.slice(batch.items.length))
        setSyncProblem('')
        retryDelay.current = 3000
      } catch (error) {
        const message = error instanceof Error ? error.message : ''
        if (message === SCORER_MOVED) { void client.invalidateQueries({ queryKey: ['league', path] }); return }
        if (/shot-clock control changed/i.test(message)) { setSyncProblem('Clock control changed. These unsent changes need review before scoring can continue.'); void client.invalidateQueries({ queryKey: ['league', path] }); return }
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
    mutationFn: ({ action, body }: { action: 'start' | 'claim' | 'period' | 'finish'; body: object }) => leagueRequest<LiveState>(`${path}/${action}`, client, 'POST', { deviceId: device, epoch: saved?.shotClock?.scorerEpoch, ...body }),
    onSuccess: (result, { action }) => {
      client.setQueryData(key, result)
      setDialog(null)
      if (action === 'finish') toast.success('Final score saved.')
      if (action === 'claim') toast.success('You’re scoring this game now.')
    },
    onError: (error) => toast.error(error.message),
  })
  const clockMode = useMutation({
    mutationFn: (mode: 'single' | 'dual') => leagueRequest<LiveState>(`${path}/shot-clock/mode`, client, 'POST', { deviceId: device, mode, epoch: saved?.shotClock?.epoch }),
    onSuccess: (result) => client.setQueryData(key, result),
    onError: (error) => toast.error(error.message),
  })

  function enqueue(item: OutboxItem) { setOutbox((current) => [...current, { ...item, epoch: item.epoch ?? epochRef.current }]) }
  function record(kind: PlayKind, points?: number, teamId?: string) {
    if (!view) return
    const team = teamId ?? selected?.teamId
    if (!team) return
    const id = crypto.randomUUID()
    setFreshPlayId(id)
    enqueue({ type: 'play', play: { id, kind, ...(points ? { points } : {}), seasonTeamId: team, ...(kind !== 'timeout' && selected ? { rosterId: selected.rosterId } : {}), period: view.period, clockMs: Math.round(remaining), recordedAt: new Date().toISOString() } })
  }
  // An unsent play is simply removed from the queue; a sent one is undone on the server.
  function undo(play: LivePlay) {
    const index = outbox.findIndex((item) => item.type === 'play' && item.play.id === play.id)
    if (index >= inFlight.current && index !== -1) setOutbox((current) => current.filter((item) => !(item.type === 'play' && item.play.id === play.id)))
    else enqueue({ type: 'void', eventId: play.id })
  }
  function setClock(nextRunning: boolean, remainingMs = Math.round(remaining)) {
    const at = clockServerTimestamp(serverOffset)
    enqueue({ type: 'clock', running: nextRunning, remainingMs, at })
    setNow(Date.parse(at) - serverOffset)
  }

  useEffect(() => {
    if (!isScorer || queueBlocked || boxOpen || dialog !== null) return
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || (event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'BUTTON', 'A', 'SUMMARY'].includes(event.target.tagName))) return
      event.preventDefault()
      const current = clockRef.current
      setOutbox((items) => [...items, { type: 'clock', running: !current.running, remainingMs: Math.round(current.remaining), at: clockServerTimestamp(offsetRef.current), epoch: epochRef.current }])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isScorer, queueBlocked, boxOpen, dialog])

  if (live.isError && !saved) return <main className="mx-auto w-full max-w-3xl p-6"><Alert variant="destructive"><AlertTitle>Couldn’t load this game</AlertTitle><AlertDescription><p>{live.error.message}</p><div className="mt-3 flex gap-2"><Button variant="outline" size="sm" onClick={() => void live.refetch()}>Try again</Button><Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/scorekeeping" />}>Back to games</Button></div></AlertDescription></Alert></main>
  if (!view || !saved) return <ConsoleSkeleton />

  const label = periodLabel(view.period, view.format.periodCount)
  const regulationDone = view.period >= view.format.periodCount
  const tied = view.home.score === view.away.score
  const busy = direct.isPending || outbox.length > 0 || !online
  const isLive = view.status === 'live'
  const canRecord = isScorer && !queueBlocked
  const syncLabel = !online ? `Offline · ${outbox.length} waiting` : syncProblem ? 'Sync interrupted' : outbox.length ? `Syncing ${outbox.length}` : 'Synced'
  const context = [view.leagueName, view.divisionName, view.venueName].filter(Boolean).join(' · ')
  const shot = view.shotClock
  const shotMs = shot ? clockRemaining(shot, Date.parse(shot.serverTime) - serverOffset, now) : 0
  const changeShot = (change: { running: boolean; remainingMs: number; visible: boolean }) => {
    if (shot) enqueue({ type: 'shot-clock', commandId: crypto.randomUUID(), epoch: shot.epoch, ...change, at: clockServerTimestamp(serverOffset) })
  }
  const periodName = view.period <= view.format.periodCount && [2, 4].includes(view.format.periodCount)
    ? `${['1st', '2nd', '3rd', '4th'][view.period - 1]} ${view.format.periodCount === 2 ? 'half' : 'quarter'}`
    : label

  return <main className={isLive ? styles.desk : 'mx-auto w-full max-w-6xl p-3 sm:p-6'}>
    {isLive && <header className="border-b bg-card">
      <div className="mx-auto flex min-h-16 max-w-[88rem] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 sm:px-6 lg:px-8">
        <nav aria-label="Scorekeeping navigation" className="flex items-center gap-2.5">
          <ShotclockLogo /><ChevronRightIcon aria-hidden="true" className="size-4 text-muted-foreground" />
          <Link href="/scorekeeping" className="inline-flex min-h-11 items-center text-sm font-medium text-muted-foreground hover:text-foreground">Games</Link>
          <ChevronRightIcon aria-hidden="true" className="size-4 text-muted-foreground" />
        </nav>
        <div className="min-w-0 flex-1">
          <h1 className="text-base leading-tight font-semibold tracking-tight break-words">{view.home.name} vs {view.away.name}</h1>
          <p className="hidden text-sm text-muted-foreground md:block">{context}</p>
        </div>
        {isScorer && <span role="status" className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', online && !outbox.length && !syncProblem ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' : 'bg-muted text-muted-foreground')}>
          {!online ? <CloudOffIcon aria-hidden="true" className="size-3.5" /> : outbox.length && !syncProblem ? <LoaderCircleIcon aria-hidden="true" className="size-3.5 animate-spin" /> : !syncProblem && <CheckIcon aria-hidden="true" className="size-3.5" />}{syncLabel}
        </span>}
        <Button variant="outline" className="min-h-11 px-3" onClick={() => setBoxOpen(true)}><ListOrderedIcon aria-hidden="true" data-icon="inline-start" />Box score</Button>
      </div>
    </header>}
    <div className={isLive ? 'mx-auto flex w-full max-w-[88rem] flex-col gap-4 px-3 py-4 sm:px-6 lg:gap-5 lg:px-8 lg:py-5' : 'flex flex-col gap-4'}>
    {!isLive && <header className="flex items-center gap-2">
      <Button variant="ghost" size="icon-sm" aria-label="Back to games" nativeButton={false} render={<Link href="/scorekeeping" />}><ArrowLeftIcon /></Button>
      <div className="flex min-w-0 flex-col"><span className="truncate text-sm font-medium">{view.home.name} vs {view.away.name}</span><span className="truncate text-xs text-muted-foreground">{context}</span></div>
    </header>}
    {syncProblem && online && <div role="alert" className="text-sm text-amber-700 dark:text-amber-300"><p>{syncProblem}</p>{queueBlocked && <><p>{outbox.length} unsent changes are still on this device. Review the game before continuing.</p><div className="mt-2 flex flex-wrap gap-2">{isScorer && saved.shotClock?.scorerEpoch && outbox.some((item) => item.type === 'play') && <Button variant="outline" size="sm" onClick={() => { setOutbox((items) => items.filter((item) => item.type === 'play').map((item) => ({ ...item, epoch: saved.shotClock!.scorerEpoch }))); setSyncProblem('') }}>Resend unsent plays; discard clock and undo changes</Button>}<Button variant="outline" size="sm" onClick={() => { setOutbox([]); setSyncProblem(''); void live.refetch() }}>Discard all unsent changes</Button></div></>}</div>}

    {view.status === 'scheduled' && <StartGame view={view} pending={direct.isPending} onStart={(format) => direct.mutate({ action: 'start', body: format })} />}

    {view.status === 'live' && !isScorer && <Alert><TimerIcon /><AlertTitle>{view.scorer ? `${view.scorer.name ?? 'Someone'} is scoring this game on another device` : 'No device is scoring this game'}</AlertTitle><AlertDescription><p>Take over to record plays here. The other device will stop saving plays.{outbox.length ? ` ${outbox.length} unsaved ${outbox.length === 1 ? 'change' : 'changes'} on this device ${view.shotClock ? 'will need review after you take over.' : 'will be sent after you take over.'}` : ''}</p><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" onClick={() => setDialog('claim')}>Take over scoring</Button>{outbox.length > 0 && <Button size="sm" variant="ghost" onClick={() => setOutbox([])}>Discard unsaved changes</Button>}</div></AlertDescription></Alert>}

    {isLive && compact && <div className="fixed inset-x-0 top-0 z-30 border-b bg-card px-3 py-1.5 text-card-foreground shadow-sm sm:px-6 lg:px-8" aria-label="Compact scoreboard">
      <div className="mx-auto flex max-w-[88rem] flex-wrap items-center gap-x-3 gap-y-1 sm:gap-x-4">
        <p className="flex min-w-0 items-center gap-2 font-semibold tabular-nums">
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-(--home)" /><span className="truncate">{view.home.name}</span><span className="text-xl">{view.home.score}</span>
          <span className="text-muted-foreground">–</span>
          <span className="text-xl">{view.away.score}</span><span className="truncate">{view.away.name}</span><span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-(--away)" />
        </p>
        <p className="font-semibold tabular-nums"><span className="font-normal text-muted-foreground">{label}</span> {deskClock(remaining)}</p>
        {isScorer && <Button className="min-h-11" onClick={() => setClock(!running)} disabled={queueBlocked || (!running && remaining === 0)}>{running ? <PauseIcon data-icon="inline-start" /> : <PlayIcon data-icon="inline-start" />}<span className="sr-only sm:not-sr-only">{running ? 'Pause game clock' : 'Start game clock'}</span></Button>}
        {shot?.mode === 'single' && <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold tabular-nums"><span className="font-normal text-muted-foreground">Shot<span className="hidden sm:inline"> clock</span></span> {Math.ceil(shotMs / 1000)}</p>
          {isScorer && <>
            <Button variant="outline" className="min-h-11" disabled={!canRecord || (!shot.running && (!running || shotMs <= 0))} onClick={() => changeShot({ running: !shot.running, remainingMs: shotMs, visible: shot.visible })}>{shot.running ? 'Pause' : 'Start'}</Button>
            <Button variant="outline" className="min-h-11" disabled={!canRecord} onClick={() => changeShot({ running: shot.running, remainingMs: shot.fullSeconds * 1000, visible: shot.visible })}>Reset {shot.fullSeconds}s</Button>
            <Button variant="outline" className="min-h-11" disabled={!canRecord} onClick={() => changeShot({ running: shot.running, remainingMs: shot.shortSeconds * 1000, visible: shot.visible })}>Reset {shot.shortSeconds}s</Button>
          </>}
        </div>}
        <Button variant="outline" className="hidden min-h-11 sm:inline-flex lg:ml-auto" onClick={() => setBoxOpen(true)}>Box score</Button>
      </div>
    </div>}
    {isLive && <>
      <section aria-label="Scoreboard">
        <GameFlowBoard view={view}>
          <div ref={clockStripRef} className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t bg-muted/40 px-4 py-3 sm:px-6 lg:px-8">
            <section aria-label="Game clock controls" className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div>
                <p className="flex min-h-6 items-center gap-1 text-sm text-muted-foreground">Game clock · {periodName}
                  {isScorer && <Button variant="ghost" size="icon-xs" aria-label="Adjust game clock" disabled={running || queueBlocked} onClick={() => setDialog('clock')}><PencilIcon /></Button>}
                </p>
                <strong className={cn('text-3xl leading-tight font-bold tracking-tight tabular-nums lg:text-4xl', remaining === 0 && 'text-destructive')}>{deskClock(remaining)}</strong>
              </div>
              {isScorer && <Button className="min-h-11 px-4 font-semibold" onClick={() => setClock(!running)} disabled={queueBlocked || (!running && remaining === 0)}>{running ? <PauseIcon data-icon="inline-start" /> : <PlayIcon data-icon="inline-start" />}{running ? 'Pause game clock' : 'Start game clock'}</Button>}
            </section>
            {shot && <Separator orientation="vertical" className="hidden lg:block" />}
            {shot?.mode === 'single' && <ShotClockControls inline remainingMs={shotMs} running={shot.running} gameRunning={running} visible={shot.visible}
              fullSeconds={shot.fullSeconds} shortSeconds={shot.shortSeconds} disabled={!canRecord} onChange={changeShot} />}
            {shot?.mode === 'dual' && <section aria-label="Shot clock" className="min-w-0">
              <p className="min-h-6 text-sm text-muted-foreground">Shot clock · {shot.operator?.name ?? 'No operator yet'}</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <strong className="text-3xl leading-tight font-bold tracking-tight tabular-nums lg:text-4xl">{shot.visible ? Math.ceil(shotMs / 1000) : 'Hidden'}</strong>
                <Link className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4" href={`/scorekeeping/games/${gameId}/shot-clock`}>Open shot-clock screen</Link>
              </div>
            </section>}
            {isScorer && <div className="flex flex-col items-start gap-1 lg:ml-auto lg:items-end">
              {!regulationDone || tied
                ? <Button variant="outline" className="min-h-11" disabled={running || busy} onClick={() => setDialog('period')}>{regulationDone ? 'Start overtime' : `End ${label}`}</Button>
                : <Button variant="outline" className="min-h-11" disabled={running || busy} onClick={() => setDialog('finish')}>End game</Button>}
              {(running || busy) && <span className="text-xs text-muted-foreground">{running ? 'Pause the clock first' : !online ? 'Reconnect first' : 'Saving changes…'}</span>}
            </div>}
          </div>
        </GameFlowBoard>
      </section>
      <ScoringWorkspace view={view} selected={selected} disabled={!canRecord} readOnly={!isScorer} canUndo={canRecord} freshPlayId={freshPlayId} onSelect={setSelected} onPlay={record} onUndo={undo}
        onTimeout={isScorer ? (teamId) => record('timeout', undefined, teamId) : undefined} />
      <Collapsible className="rounded-xl border bg-card">
        <CollapsibleTrigger render={<Button variant="ghost" className="group/history min-h-12 w-full justify-between rounded-xl px-4 text-base font-medium" />}>
          Play history and settings<ChevronDownIcon data-icon="inline-end" className="transition-transform group-data-[panel-open]/history:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="grid gap-4 border-t p-4">
          {isScorer && shot && <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted-foreground">{shot.mode === 'single' ? 'This device runs the shot clock.' : 'A second device runs the shot clock.'}</p>
            <Button variant="outline" disabled={busy || clockMode.isPending} onClick={() => clockMode.mutate(shot.mode === 'single' ? 'dual' : 'single')}>{shot.mode === 'single' ? 'Use a second operator' : 'Control on this device'}</Button>
          </div>}
          <RecentPlays view={view} canUndo={canRecord} onUndo={undo} />
        </CollapsibleContent>
      </Collapsible>
    </>}
    {view.status === 'completed' && <FinalBoxScore view={view} />}
    </div>

    <LiveBoxScore view={view} clock={deskClock(remaining)} open={boxOpen && view.status === 'live'} onOpenChange={setBoxOpen} />
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

function StartGame({ view, pending, onStart }: { view: LiveState; pending: boolean; onStart: (format: StartFormat) => void }) {
  const [format, setFormat] = useState(view.format)
  const [shotClockEnabled, setShotClockEnabled] = useState(false)
  const [shotClockFullSeconds, setShotClockFullSeconds] = useState(24)
  const [shotClockShortSeconds, setShotClockShortSeconds] = useState(14)
  const teamsKnown = !!view.home.seasonTeamId && !!view.away.seasonTeamId
  const field = (name: keyof LiveState['format'], label: string, min: number, max: number, description?: string) => <Field className="gap-2">
    <FieldLabel htmlFor={`format-${name}`}>{label}</FieldLabel>
    <Input id={`format-${name}`} type="number" inputMode="numeric" min={min} max={max} value={format[name]} aria-describedby={description ? `format-${name}-description` : undefined} onChange={(event) => setFormat((current) => ({ ...current, [name]: Math.min(max, Math.max(min, Number(event.target.value) || min)) }))} className="h-11 bg-background tabular-nums" />
    {description && <FieldDescription id={`format-${name}-description`}>{description}</FieldDescription>}
  </Field>
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); onStart({ ...format, shotClockEnabled, shotClockFullSeconds, shotClockShortSeconds }) }
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
          <div className="space-y-3 border-t pt-5">
            <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={shotClockEnabled} onChange={(event) => setShotClockEnabled(event.target.checked)} /> Use shot clock</label>
            {shotClockEnabled && <div className="grid gap-4 sm:grid-cols-2">
              <Field><FieldLabel htmlFor="shot-full">Full reset (seconds)</FieldLabel><Input id="shot-full" type="number" min={1} max={120} value={shotClockFullSeconds} onChange={(event) => setShotClockFullSeconds(Math.min(120, Math.max(1, Number(event.target.value) || 1)))} /></Field>
              <Field><FieldLabel htmlFor="shot-short">Short reset (seconds)</FieldLabel><Input id="shot-short" type="number" min={1} max={120} value={shotClockShortSeconds} onChange={(event) => setShotClockShortSeconds(Math.min(120, Math.max(1, Number(event.target.value) || 1)))} /></Field>
            </div>}
          </div>
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


