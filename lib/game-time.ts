export function splitGameTime(value: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return { hour: '', minute: '', period: '' }
  const [hours, minute] = value.split(':')
  const hour24 = Number(hours)
  return { hour: String(hour24 % 12 || 12).padStart(2, '0'), minute, period: hour24 < 12 ? 'AM' : 'PM' }
}

export function joinGameTime(hour: string, minute: string, period: string) {
  if (!/^(0[1-9]|1[0-2])$/.test(hour) || !/^[0-5]\d$/.test(minute) || !/^(AM|PM)$/.test(period)) return ''
  const hour24 = Number(hour) % 12 + (period === 'PM' ? 12 : 0)
  return `${String(hour24).padStart(2, '0')}:${minute}`
}
