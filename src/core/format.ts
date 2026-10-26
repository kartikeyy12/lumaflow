/** mm:ss, or h:mm:ss when an hour or more. Rounds up so 0:00 only shows at zero. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = String(s).padStart(2, '0')
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`
  return `${String(m).padStart(2, '0')}:${ss}`
}

/** Count-up clock: rounds down, so it shows 00:00 until a full second has passed. */
export function formatElapsed(ms: number): string {
  return formatClock(Math.floor(Math.max(0, ms) / 1000) * 1000)
}

/** "1h 25m", "40m", "0m". */
export function formatDuration(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60_000))
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`
  return `${m}m`
}

export function formatTimeOfDay(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function formatDayLabel(ts: number, now: number): string {
  const d = new Date(ts)
  const today = new Date(now)
  const yesterday = new Date(now)
  yesterday.setDate(today.getDate() - 1)
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  if (same(d, today)) return 'Today'
  if (same(d, yesterday)) return 'Yesterday'
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })
}

export const MODE_LABEL = {
  focus: 'Focus',
  short: 'Short break',
  long: 'Long break',
} as const

/** "1 hour 5 minutes 3 seconds", for screen readers. */
export function spokenDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const sec = total % 60
  const parts: string[] = []
  if (h) parts.push(`${h} ${h === 1 ? 'hour' : 'hours'}`)
  if (m) parts.push(`${m} ${m === 1 ? 'minute' : 'minutes'}`)
  if (sec || parts.length === 0) parts.push(`${sec} ${sec === 1 ? 'second' : 'seconds'}`)
  return parts.join(' ')
}
