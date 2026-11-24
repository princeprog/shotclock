'use client'

import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { EyeIcon, EyeOffIcon, MoreHorizontalIcon, PauseIcon, PlayIcon, Volume2Icon, VolumeXIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { Label } from '@/components/ui/label'

export type ShotClockControlProps = {
  inline?: boolean
  remainingMs: number
  running: boolean
  gameRunning: boolean
  visible: boolean
  fullSeconds: number
  shortSeconds: number
  disabled: boolean
  onChange: (change: { running: boolean; remainingMs: number; visible: boolean }) => void
}

export function ShotClockControls({ inline = false, remainingMs, running, gameRunning, visible, fullSeconds, shortSeconds, disabled, onChange }: ShotClockControlProps) {
  const inputId = useId()
  const audioRef = useRef<AudioContext | null>(null)
  const previousRef = useRef({ remainingMs, running })
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [soundError, setSoundError] = useState(false)
  const atZero = remainingMs <= 0

  useEffect(() => {
    const previous = previousRef.current
    previousRef.current = { remainingMs, running }
    const audio = audioRef.current
    if (previous.running && previous.remainingMs > 0 && remainingMs <= 0 && soundEnabled && audio?.state === 'running') {
      try {
        const oscillator = audio.createOscillator()
        const gain = audio.createGain()
        oscillator.type = 'square'
        oscillator.frequency.value = 440
        gain.gain.setValueAtTime(0.12, audio.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.7)
        oscillator.connect(gain)
        gain.connect(audio.destination)
        oscillator.start()
        oscillator.stop(audio.currentTime + 0.7)
      } catch {
        // The zero display remains available if the browser cannot play audio.
      }
    }
  }, [remainingMs, running, soundEnabled])

  useEffect(() => () => {
    const audio = audioRef.current
    audioRef.current = null
    if (audio && audio.state !== 'closed') void audio.close().catch(() => {})
  }, [])

  async function toggleSound() {
    if (soundEnabled) {
      setSoundEnabled(false)
      setSoundError(false)
      return
    }
    try {
      const audio = audioRef.current ?? new AudioContext()
      audioRef.current = audio
      await audio.resume()
      if (audio.state !== 'running') throw new Error('Audio unavailable')
      setSoundEnabled(true)
      setSoundError(false)
    } catch {
      setSoundError(true)
    }
  }

  function adjust(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (disabled || running) return
    const seconds = Number(new FormData(event.currentTarget).get('seconds'))
    if (Number.isSafeInteger(seconds) && seconds >= 0 && seconds <= 120) {
      onChange({ running, remainingMs: seconds * 1000, visible })
    }
  }

  const seconds = Math.ceil(Math.max(0, remainingMs) / 1000)
  const visibilityButton = <Button type="button" variant="outline" disabled={disabled} aria-pressed={visible} onClick={() => onChange({ running, remainingMs, visible: !visible })}>
    {visible ? <EyeIcon data-icon="inline-start" /> : <EyeOffIcon data-icon="inline-start" />}
    {visible ? 'Visible' : 'Hidden'}
  </Button>
  const settings = <>
    <form onSubmit={adjust} className="flex flex-wrap items-end gap-2">
      <div className="w-32 space-y-2">
        <Label htmlFor={inputId}>Adjust seconds</Label>
        <Input key={running ? 'running' : remainingMs} id={inputId} name="seconds" type="number" inputMode="numeric" min={0} max={120} step={1} required defaultValue={seconds} disabled={disabled || running} />
      </div>
      <Button type="submit" variant="outline" disabled={disabled || running}>Set time</Button>
      {running && <span className="text-sm text-muted-foreground">Stop the shot clock to adjust it.</span>}
    </form>

    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="ghost" size="sm" disabled={disabled} aria-pressed={soundEnabled} onClick={toggleSound}>
        {soundEnabled ? <Volume2Icon data-icon="inline-start" /> : <VolumeXIcon data-icon="inline-start" />}
        {soundEnabled ? 'Sound enabled' : 'Enable sound'}
      </Button>
      {soundError && <span role="alert" className="text-sm text-destructive">Sound unavailable. Watch the clock for zero.</span>}
    </div>
  </>
  const controls = <div className={inline ? 'flex flex-wrap items-center gap-2 [&>button]:h-11 sm:[&>button]:px-3 xl:gap-5 xl:[&>button]:h-[3.2rem] xl:[&>button]:min-w-[8rem] xl:[&>button]:px-7 xl:[&>button]:text-xl' : 'flex flex-wrap gap-2'}>
    <Button type="button" variant={inline ? 'outline' : 'default'} disabled={disabled || (!running && (!gameRunning || atZero))}
      aria-label={inline ? (running ? 'Pause shot clock' : 'Start shot clock') : undefined} onClick={() => onChange({ running: !running, remainingMs, visible })}>
      {!inline && (running ? <PauseIcon data-icon="inline-start" /> : <PlayIcon data-icon="inline-start" />)}
      {running ? (inline ? 'Pause' : 'Stop') : 'Start'}
    </Button>
    {([['Full', fullSeconds], ['Short', shortSeconds]] as const).map(([label, duration]) => <Button key={label} type="button" variant="outline" disabled={disabled}
      onClick={() => onChange({ running, remainingMs: duration * 1000, visible })}>{inline ? `Reset ${duration}s` : `${label} reset (${duration}s)`}</Button>)}
  </div>
  const status = atZero ? 'Shot clock at zero' : running ? 'Running' : 'Stopped'

  if (inline) return <section aria-label="Shot clock controls" className="min-w-0">
    <div className="flex items-center gap-2">
      <p className="font-medium text-muted-foreground xl:text-xl">Shot clock{!visible && ' · Hidden'}</p>
      <Popover><PopoverTrigger render={<Button variant="ghost" size="icon-xs" aria-label="Shot clock settings" />}><MoreHorizontalIcon /></PopoverTrigger>
        <PopoverContent><PopoverTitle>Shot clock settings</PopoverTitle>{visibilityButton}{settings}</PopoverContent>
      </Popover>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <strong aria-live="off" className={`text-4xl leading-tight font-bold tabular-nums xl:text-[3.5rem] ${atZero ? 'text-destructive' : ''}`}>{seconds}</strong>
      {controls}
    </div>
    <span role="status" className="sr-only">{status}</span>
  </section>

  return <section aria-label="Shot clock controls" className="flex flex-col gap-4 rounded-xl bg-card p-4 text-card-foreground ring-1 ring-foreground/10">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-sm font-medium text-muted-foreground">Shot clock</p>
        <p aria-live="off" className={`font-mono text-5xl font-semibold tabular-nums sm:text-6xl ${atZero ? 'text-destructive' : ''}`}>{seconds}</p>
        <p role="status" className="text-sm text-muted-foreground">{status}</p>
      </div>
      {visibilityButton}
    </div>
    {controls}
    {settings}
  </section>
}
