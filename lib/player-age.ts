function calendarDate(value: string | null | undefined): string | null {
  if (!value) return null
  const date = value.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const parsed = new Date(`${date}T00:00:00Z`)
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ? null : date
}

export function ageAtSeasonStart(birthDate: string | null | undefined, seasonStart: string | null | undefined): number | null {
  const birth = calendarDate(birthDate)
  const start = calendarDate(seasonStart)
  if (!birth || !start || birth > start) return null
  return Number(start.slice(0, 4)) - Number(birth.slice(0, 4)) - (start.slice(5) < birth.slice(5) ? 1 : 0)
}
