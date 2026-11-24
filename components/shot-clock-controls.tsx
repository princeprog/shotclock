'use client'

import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { EyeIcon, EyeOffIcon, PauseIcon, PlayIcon, Volume2Icon, VolumeXIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type ShotClockControlProps = {
  remainingMs: number
  running: boolean
  gameRunning: boolean
  visible: boolean
  fullSeconds: number
  shortSeconds: number
  disabled: boolean
  onChange: (change: { running: boolean; remainingMs: number; visible: boolean }) => void
}

export function ShotClockControls({ remainingMs, running, gameRunning, visible, fullSeconds, shortSeconds, disabled, onChange }: ShotClockControlProps) {
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

  return (
    <section aria-label="Shot clock controls" className="flex flex-col gap-4 rounded-xl bg-card p-4 text-card-foreground ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Shot clock</p>
          <p aria-live="off" className={`font-mono text-5xl font-semibold tabular-nums sm:text-6xl ${atZero ? 'text-destructive' : ''}`}>
            {Math.ceil(Math.max(0, remainingMs) / 1000)}
          </p>
          <p role="status" className="text-sm text-muted-foreground">{atZero ? 'Shot clock at zero' : running ? 'Running' : 'Stopped'}</p>
        </div>
        <Button type="button" variant="outline" disabled={disabled} aria-pressed={visible} onClick={() => onChange({ running, remainingMs, visible: !visible })}>
          {visible ? <EyeIcon data-icon="inline-start" /> : <EyeOffIcon data-icon="inline-start" />}
          {visible ? 'Visible' : 'Hidden'}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={disabled || (!running && (!gameRunning || atZero))} onClick={() => onChange({ running: !running, remainingMs, visible })}>
          {running ? <PauseIcon data-icon="inline-start" /> : <PlayIcon data-icon="inline-start" />}
          {running ? 'Stop' : 'Start'}
        </Button>
        <Button type="button" variant="outline" disabled={disabled} onClick={() => onChange({ running, remainingMs: fullSeconds * 1000, visible })}>Full reset ({fullSeconds}s)</Button>
        <Button type="button" variant="outline" disabled={disabled} onClick={() => onChange({ running, remainingMs: shortSeconds * 1000, visible })}>Short reset ({shortSeconds}s)</Button>
      </div>

      <form onSubmit={adjust} className="flex flex-wrap items-end gap-2">
        <div className="w-32 space-y-2">
          <Label htmlFor={inputId}>Adjust seconds</Label>
          <Input key={running ? 'running' : remainingMs} id={inputId} name="seconds" type="number" inputMode="numeric" min={0} max={120} step={1} required defaultValue={Math.ceil(Math.max(0, remainingMs) / 1000)} disabled={disabled || running} />
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
    </section>
  )
}
