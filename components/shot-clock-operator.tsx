'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ShotClockControls } from '@/components/shot-clock-controls'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { leagueRequest } from '@/lib/league-client'
import { clockRemaining, clockServerOffset, clockServerTimestamp, deviceId, formatClock, periodLabel, type LiveState } from '@/lib/live-scoring'

const subscribe = (callback: () => void) => {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => { window.removeEventListener('online', callback); window.removeEventListener('offline', callback) }
}

const noSubscription = () => () => {}

export function ShotClockOperator({ gameId }: { gameId: string }) {
  const hydrated = useSyncExternalStore(noSubscription, () => true, () => false)
  return hydrated ? <Operator gameId={gameId} /> : <main className="p-6">Loading game…</main>
}

function Operator({ gameId }: { gameId: string }) {
  const client = useQueryClient()
  const path = `games/${gameId}/live`
  const key = ['league', path]
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => false)
  const [device] = useState(() => deviceId())
  const [now, setNow] = useState(() => Date.now())
  const [confirmedVersion, setConfirmedVersion] = useState<number | null>(null)
  const query = useQuery({ queryKey: key, queryFn: async () => {
    const fresh = await leagueRequest<LiveState>(path, client)
    const previous = client.getQueryData<LiveState>(key)
    if (previous && previous.status === fresh.status && fresh.version < previous.version) throw new Error('Received an older game state')
    return fresh
  }, retry: false, refetchInterval: 1000 })
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 100); return () => window.clearInterval(timer) }, [])
  const live = query.data
  const shot = live?.shotClock
  const serverOffset = clockServerOffset(live?.clock ?? null, query.dataUpdatedAt)
  const connected = online && !query.isError && !!live && now - query.dataUpdatedAt < 5000
  useEffect(() => {
    if (!connected || shot?.mode !== 'dual' || shot.operator?.deviceId !== device) return
    const epoch = shot.epoch
    const send = () => { void leagueRequest(`${path}/shot-clock/heartbeat`, client, 'POST', { deviceId: device, epoch }).catch(() => setConfirmedVersion(null)) }
    send()
    const timer = window.setInterval(send, 5000)
    return () => window.clearInterval(timer)
  }, [connected, shot?.mode, shot?.operator?.deviceId, shot?.epoch, device, path, client])
  const command = useMutation({
    mutationFn: ({ endpoint, body }: { endpoint: string; body: object }) => leagueRequest<LiveState>(`${path}/shot-clock/${endpoint}`, client, 'POST', { deviceId: device, epoch: shot?.epoch, ...body }),
    onSuccess: (result) => client.setQueryData(key, result),
    onError: (error) => toast.error(error.message),
  })
  const change = useMutation({
    mutationFn: (body: { running: boolean; remainingMs: number; visible: boolean }) => leagueRequest<LiveState>(`${path}/shot-clock`, client, 'POST', { ...body, deviceId: device, commandId: crypto.randomUUID(), epoch: shot?.epoch, at: clockServerTimestamp(serverOffset) }),
    onSuccess: (result) => client.setQueryData(key, result),
    onError: (error) => { setConfirmedVersion(null); toast.error(error.message) },
  })
  useEffect(() => {
    if (connected && shot?.connectivity?.scorerConnected && shot.connectivity.operatorConnected) return
    const timer = window.setTimeout(() => setConfirmedVersion(null), 0)
    return () => window.clearTimeout(timer)
  }, [connected, shot?.connectivity?.scorerConnected, shot?.connectivity?.operatorConnected])
  if (!live) return <main className="p-6">{query.isError ? 'Could not load the game. Check your connection and try again.' : 'Loading game…'}</main>
  if (live.status !== 'live' || !shot || shot.mode !== 'dual') return <main className="p-6"><Alert><AlertTitle>Shot-clock operation unavailable</AlertTitle><AlertDescription>The scoring device must enable two-operator mode for a live game.</AlertDescription></Alert><Button className="mt-4" variant="outline" nativeButton={false} render={<Link href={`/scorekeeping/games/${gameId}`} />}>Back to game</Button></main>
  const assigned = shot.operator?.deviceId === device
  const bothConnected = !!shot.connectivity?.scorerConnected && !!shot.connectivity?.operatorConnected
  const ready = connected && bothConnected && assigned && confirmedVersion === shot.epoch && !command.isPending && !change.isPending
  const gameRemaining = clockRemaining(live.clock, query.dataUpdatedAt, now)
  const shotRemaining = clockRemaining(shot, Date.parse(shot.serverTime) - serverOffset, now)
  return <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4 sm:p-6">
    <Button variant="ghost" className="self-start" nativeButton={false} render={<Link href="/scorekeeping" />}>Back to games</Button>
    <div className="rounded-xl bg-zinc-950 p-5 text-white">
      <p className="text-sm text-zinc-300">{live.leagueName} · {live.divisionName}</p>
      <h1 className="mt-2 text-xl font-semibold">{live.home.name} {live.home.score} – {live.away.score} {live.away.name}</h1>
      <p className="mt-2 font-mono text-lg">{periodLabel(live.period, live.format.periodCount)} · {formatClock(gameRemaining)}</p>
    </div>
    {!connected && <Alert><AlertTitle>Connection unavailable</AlertTitle><AlertDescription>Clock information may be out of date. Reconnect and confirm the clock before continuing.</AlertDescription></Alert>}
    {connected && assigned && !bothConnected && <Alert><AlertTitle>Waiting for both devices</AlertTitle><AlertDescription>The scoring and shot-clock devices must both be connected.</AlertDescription></Alert>}
    {connected && !assigned && <Alert><AlertTitle>{shot.operator ? `${shot.operator.name ?? 'Another device'} controls the shot clock` : 'No shot-clock operator assigned'}</AlertTitle><AlertDescription><Button className="mt-2" onClick={() => command.mutate({ endpoint: 'claim', body: {} })} disabled={command.isPending}>Take over shot clock</Button></AlertDescription></Alert>}
    {connected && assigned && bothConnected && confirmedVersion !== shot.epoch && <Alert><AlertTitle>Confirm the shot clock</AlertTitle><AlertDescription>Check the displayed time against the venue clock before continuing.<div><Button className="mt-2" onClick={() => setConfirmedVersion(shot.epoch)}>Confirm and continue</Button></div></AlertDescription></Alert>}
    <ShotClockControls remainingMs={shotRemaining} running={shot.running} gameRunning={!!live.clock?.running && gameRemaining > 0} visible={shot.visible} fullSeconds={shot.fullSeconds} shortSeconds={shot.shortSeconds} disabled={!ready} onChange={(value) => change.mutate(value)} />
  </main>
}
