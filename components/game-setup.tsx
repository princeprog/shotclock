'use client'

import { useState, type FormEvent } from 'react'
import { CheckIcon, ChevronDownIcon, MinusIcon, PlayIcon, PlusIcon, TriangleAlertIcon } from 'lucide-react'
import { cn } from 'cn'
import { sideColor, type Side } from '@/components/scoring-workspace'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupText } from '@/components/ui/input-group'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { formatGameDateTime } from '@/lib/league-time'
import type { LiveState, LiveTeam } from '@/lib/live-scoring'
import { stageLabel } from '@/lib/season-overview'

export type StartFormat = LiveState['format'] & { shotClockEnabled: boolean; shotClockFullSeconds: number; shotClockShortSeconds: number }
const sides = ['home', 'away'] as const
const panelClass = 'gap-0 rounded-xl border py-0 shadow-xs ring-0'

function Dot({ side, className }: { side: Side; className?: string }) {
  return <span aria-hidden="true" className={cn('size-3 shrink-0 rounded-full', sideColor[side], className)} />
}

function periodUnit(count: number) {
  if (count === 4) return 'quarters'
  if (count === 2) return 'halves'
  return count === 1 ? 'period' : 'periods'
}

// Before a scheduled game: the matchup, each roster's readiness, and the format the scorekeeper confirms before starting.
export function GameSetup({ view, pending, onStart }: { view: LiveState; pending: boolean; onStart: (format: StartFormat) => void }) {
  const teamsKnown = !!view.home.seasonTeamId && !!view.away.seasonTeamId
  return <div className="flex flex-col gap-4 lg:gap-5">
    <Matchup view={view} />
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-5">
      <Rosters view={view} />
      {view.seasonStatus !== 'active'
        ? <Alert><AlertTitle>The season hasn’t started</AlertTitle><AlertDescription>The league owner needs to start the season before games can be scored.</AlertDescription></Alert>
        : !teamsKnown
          ? <Alert><AlertTitle>Teams aren’t set yet</AlertTitle><AlertDescription>This playoff game gets its teams when the earlier results are recorded.</AlertDescription></Alert>
          : <GameFormat view={view} pending={pending} onStart={onStart} />}
    </div>
  </div>
}

function Matchup({ view }: { view: LiveState }) {
  const when = view.scheduledAt && formatGameDateTime(view.scheduledAt, view.timeZone, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  const stage = stageLabel(view.stage)
  return <Card className={panelClass}>
    <section aria-label="Matchup" className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 px-5 py-5 sm:px-8 sm:py-6">
      {sides.map((side) => {
        const away = side === 'away'
        return <div key={side} className={cn('min-w-0', away && 'col-start-3 text-right')}>
          <h2 className={cn('flex items-center gap-2.5 text-2xl leading-tight font-semibold tracking-tight sm:text-3xl', away && 'flex-row-reverse')}><Dot side={side} /><span className="break-words">{view[side].name}</span></h2>
          <p className={cn('mt-1 text-sm text-muted-foreground sm:text-base', away ? 'pr-5.5' : 'pl-5.5')}>{away ? 'Away' : 'Home'}</p>
        </div>
      })}
      <div className="col-start-2 row-start-1 text-center">
        <p className="text-sm text-muted-foreground">vs</p>
        {when && <p className="mt-1 hidden font-medium tabular-nums sm:block">{when}</p>}
        {stage && <p className="mt-1 text-sm text-muted-foreground">{stage}</p>}
      </div>
    </section>
    <p className="border-t px-5 py-3 text-center text-sm text-muted-foreground">{when && <span className="font-medium text-foreground tabular-nums sm:hidden">{when} · </span>}Scheduled · The clock starts stopped.</p>
  </Card>
}

function Rosters({ view }: { view: LiveState }) {
  return <Card className={panelClass}>
    <CardHeader className="border-b py-4 [.border-b]:pb-4"><CardTitle><h2 className="text-lg leading-tight font-semibold">Rosters</h2></CardTitle></CardHeader>
    <div className="divide-y">{sides.map((side) => <RosterGroup key={side} team={view[side]} side={side} />)}</div>
  </Card>
}

// A roster with a problem opens on its own, so a missing jersey number is seen before the game starts.
function RosterGroup({ team, side }: { team: LiveTeam; side: Side }) {
  if (!team.seasonTeamId) return <div className="flex items-center gap-3 px-5 py-4"><Dot side={side} /><p className="font-semibold">{team.name}</p><p className="text-sm text-muted-foreground">Team pending</p></div>
  const missing = team.players.filter((player) => player.jersey === null).length
  const issue = !team.players.length ? 'No players on this roster' : missing ? `${missing} missing jersey ${missing === 1 ? 'number' : 'numbers'}` : null
  return <Collapsible defaultOpen={issue !== null}>
    <CollapsibleTrigger render={<Button variant="ghost" className="group/roster h-auto min-h-16 w-full justify-between gap-3 rounded-none px-5 py-3 text-left font-normal whitespace-normal" />}>
      <span className="flex min-w-0 items-start gap-3">
        <Dot side={side} className="mt-1.5" />
        <span className="min-w-0">
          <span className="block text-base font-semibold">{team.name}</span>
          <span className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {team.players.length} {team.players.length === 1 ? 'player' : 'players'}
            {issue
              ? <Badge className="bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"><TriangleAlertIcon data-icon="inline-start" />{issue}</Badge>
              : <Badge className="bg-emerald-50 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"><CheckIcon data-icon="inline-start" />Ready</Badge>}
          </span>
        </span>
      </span>
      <ChevronDownIcon data-icon="inline-end" className="transition-transform group-data-[panel-open]/roster:rotate-180" />
    </CollapsibleTrigger>
    <CollapsibleContent>
      {team.players.length > 0 && <ul className="mx-5 mb-3 divide-y border-t">{team.players.map((player) => <li key={player.rosterId} className="flex min-h-11 items-center gap-4 text-sm">
        <span className={cn('w-7 text-right tabular-nums', player.jersey === null ? 'font-semibold text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>
          {player.jersey ?? '–'}{player.jersey === null && <span className="sr-only">No jersey number</span>}
        </span>
        <span>{player.name}</span>
      </li>)}</ul>}
    </CollapsibleContent>
  </Collapsible>
}

function GameFormat({ view, pending, onStart }: { view: LiveState; pending: boolean; onStart: (format: StartFormat) => void }) {
  const [format, setFormat] = useState(view.format)
  const [shotClock, setShotClock] = useState({ enabled: false, full: 24, short: 14 })
  const unit = periodUnit(format.periodCount)
  const summary = [
    `${format.periodCount} × ${format.periodMinutes} min ${unit}`,
    `${format.overtimeMinutes} min overtime`,
    `Bonus at ${format.bonusFouls}`,
    shotClock.enabled && `Shot clock ${shotClock.full}/${shotClock.short}`,
  ].filter(Boolean).join(' · ')
  const setFormatValue = (name: keyof LiveState['format']) => (value: number) => setFormat((current) => ({ ...current, [name]: value }))
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onStart({ ...format, shotClockEnabled: shotClock.enabled, shotClockFullSeconds: shotClock.full, shotClockShortSeconds: shotClock.short })
  }
  return <Card className={panelClass}>
    <form onSubmit={submit}>
      <CardHeader className="pt-5">
        <CardTitle><h2 className="text-lg leading-tight font-semibold">Game format</h2></CardTitle>
        <CardDescription>Defaults from the league. Changes apply to this game only.</CardDescription>
      </CardHeader>
      <CardContent className="gap-5 py-5">
        <FieldGroup className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
          <Stepper id="format-periods" label="Periods" value={format.periodCount} min={1} max={8} description={`${format.periodCount} ${unit}`} onChange={setFormatValue('periodCount')} />
          <Stepper id="format-minutes" label="Minutes per period" value={format.periodMinutes} min={1} max={30} onChange={setFormatValue('periodMinutes')} />
          <Stepper id="format-overtime" label="Overtime minutes" value={format.overtimeMinutes} min={1} max={15} onChange={setFormatValue('overtimeMinutes')} />
          <Stepper id="format-bonus" label="Bonus after team fouls" value={format.bonusFouls} min={1} max={10} description="Team fouls per period" onChange={setFormatValue('bonusFouls')} />
        </FieldGroup>
        <Separator />
        <div className="grid items-end gap-x-6 gap-y-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <Field orientation="horizontal" className="min-h-11 self-center">
            <Switch id="format-shot-clock" checked={shotClock.enabled} onCheckedChange={(enabled) => setShotClock((current) => ({ ...current, enabled }))} />
            <FieldContent>
              <FieldLabel htmlFor="format-shot-clock">Shot clock</FieldLabel>
              <FieldDescription>Run a shot clock beside the game clock.</FieldDescription>
            </FieldContent>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Stepper id="format-shot-full" label="Full reset" unit="s" value={shotClock.full} min={1} max={120} disabled={!shotClock.enabled} onChange={(full) => setShotClock((current) => ({ ...current, full }))} />
            <Stepper id="format-shot-short" label="Short reset" unit="s" value={shotClock.short} min={1} max={120} disabled={!shotClock.enabled} onChange={(short) => setShotClock((current) => ({ ...current, short }))} />
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-3 border-t py-4 sm:flex-row sm:items-center sm:justify-between [.border-t]:pt-4">
        <p className="text-sm text-muted-foreground tabular-nums">{summary}</p>
        <Button type="submit" size="lg" disabled={pending} className="min-h-12 shrink-0 px-5 text-base">
          {pending ? <Spinner data-icon="inline-start" /> : <PlayIcon data-icon="inline-start" />}{pending ? 'Starting…' : 'Start game'}
        </Button>
      </CardFooter>
    </form>
  </Card>
}

// A number field with − and + buttons that keeps its value between min and max.
function Stepper({ id, label, value, min, max, unit, description, disabled = false, onChange }: {
  id: string; label: string; value: number; min: number; max: number; unit?: string; description?: string; disabled?: boolean; onChange: (value: number) => void
}) {
  const set = (next: number) => onChange(Math.min(max, Math.max(min, next)))
  return <Field data-disabled={disabled || undefined} className="gap-2">
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <InputGroup className="h-11 bg-background">
      <InputGroupAddon>
        <InputGroupButton size="icon-sm" aria-label={`Decrease ${label.toLowerCase()}`} disabled={disabled || value <= min} onClick={() => set(value - 1)}><MinusIcon /></InputGroupButton>
      </InputGroupAddon>
      <InputGroupInput id={id} type="number" inputMode="numeric" min={min} max={max} value={value} disabled={disabled}
        aria-describedby={description ? `${id}-description` : undefined} onChange={(event) => set(Number(event.target.value) || min)}
        className="text-center text-base font-medium tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
      <InputGroupAddon align="inline-end">
        {unit && <InputGroupText>{unit}</InputGroupText>}
        <InputGroupButton size="icon-sm" aria-label={`Increase ${label.toLowerCase()}`} disabled={disabled || value >= max} onClick={() => set(value + 1)}><PlusIcon /></InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
    {description && <FieldDescription id={`${id}-description`}>{description}</FieldDescription>}
  </Field>
}
