// Game times are stored as instants and shown in the league's time zone, so everyone sees the same local time.

export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

export function isTimeZone(value: string): boolean {
  if (!value.trim()) return false
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }).format(); return true } catch { return false }
}

export function timeZoneOptions(): string[] {
  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
  return zones.includes('UTC') ? zones : ['UTC', ...zones]
}

const zoneOrBrowser = (timeZone?: string | null) => timeZone && isTimeZone(timeZone) ? timeZone : browserTimeZone()

// A datetime-local value is a wall time, not an instant in the browser's zone.
export function formatInZone(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const part = (name: string) => parts.find((item) => item.type === name)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`
}

// Find all possible offsets around the date. Reject skipped or repeated wall times.
export function resolveZonedTime(value: string, timeZone: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null
  const guess = Date.parse(`${value}:00Z`)
  if (!Number.isFinite(guess)) return null
  const offsets = new Set<number>()
  try {
    for (let hours = -48; hours <= 48; hours += 3) {
      const sample = guess + hours * 60 * 60 * 1000
      const wall = formatInZone(new Date(sample).toISOString(), timeZone)
      offsets.add(Date.parse(`${wall}:00Z`) - sample)
    }
    const candidates = [...offsets]
      .map((offset) => guess - offset)
      .filter((instant) => formatInZone(new Date(instant).toISOString(), timeZone) === value)
    return candidates.length === 1 ? new Date(candidates[0]).toISOString() : null
  } catch {
    return null
  }
}

// The value for a datetime-local input showing this instant in the league zone.
export function zonedInput(iso: string | null | undefined, timeZone?: string | null): string {
  return iso ? formatInZone(iso, zoneOrBrowser(timeZone)) : ''
}

// The instant for a wall time entered in the league zone. A wall time skipped by daylight saving falls back to the next valid reading.
export function zonedInstant(wallTime: string, timeZone?: string | null): string {
  const zone = zoneOrBrowser(timeZone)
  return resolveZonedTime(wallTime, zone) ?? resolveZonedTime(formatInZone(new Date(Date.parse(`${wallTime}:00Z`) + 60 * 60 * 1000).toISOString(), 'UTC'), zone) ?? new Date(`${wallTime}:00Z`).toISOString()
}

// The league-zone calendar date (YYYY-MM-DD) of an instant.
export function zonedDate(iso: string, timeZone?: string | null): string {
  return formatInZone(iso, zoneOrBrowser(timeZone)).slice(0, 10)
}

// The first instant of a calendar date in the league zone, for date filters.
export function zonedDayStart(date: string, timeZone?: string | null): string {
  return zonedInstant(`${date}T00:00`, timeZone)
}

export function formatGameTime(iso: string, timeZone?: string | null): string {
  return new Intl.DateTimeFormat(undefined, { timeZone: zoneOrBrowser(timeZone), hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
}

export function formatGameDateTime(iso: string | null | undefined, timeZone?: string | null, options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }): string {
  if (!iso) return 'Date not scheduled'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : new Intl.DateTimeFormat(undefined, { ...options, timeZone: zoneOrBrowser(timeZone) }).format(date)
}

