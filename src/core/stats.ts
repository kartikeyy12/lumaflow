import type { LogEntry } from './types'

/**
 * Local calendar day (YYYY-MM-DD) in the user's current time zone.
 * A session belongs to the day on which it ended.
 */
export function dayKey(ts: number): string {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export interface DayStats {
  /** Focus sessions that ran to the end. Early or interrupted ones are not counted here. */
  sessions: number
  /** All credited focus time that day, including early and interrupted sessions. */
  focusedMs: number
  entries: LogEntry[]
}

export function statsForDay(log: LogEntry[], now: number): DayStats {
  const key = dayKey(now)
  const entries = log.filter((e) => dayKey(e.endedAt) === key)
  return {
    sessions: entries.filter((e) => e.outcome === 'completed').length,
    focusedMs: entries.reduce((sum, e) => sum + e.durationMs, 0),
    entries,
  }
}

/** Adds an entry unless one with the same id exists. Newest first, capped. */
export function appendEntry(log: LogEntry[], entry: LogEntry, cap = 1000): LogEntry[] {
  if (log.some((e) => e.id === entry.id)) return log
  const next = [entry, ...log].sort((a, b) => b.endedAt - a.endedAt)
  return next.length > cap ? next.slice(0, cap) : next
}

export interface DayTotal {
  key: string
  /** Local noon of that day, safe to format as a weekday. */
  at: number
  focusedMs: number
}

/** Focus time for each of the last `days` local days, oldest first, ending with today. */
export function lastDays(log: LogEntry[], now: number, days = 7): DayTotal[] {
  const out: DayTotal[] = []
  for (let back = days - 1; back >= 0; back--) {
    const d = new Date(now)
    d.setHours(12, 0, 0, 0)
    d.setDate(d.getDate() - back)
    const key = dayKey(d.getTime())
    out.push({ key, at: d.getTime(), focusedMs: 0 })
  }
  const slot = new Map(out.map((d) => [d.key, d]))
  for (const e of log) {
    const hit = slot.get(dayKey(e.endedAt))
    if (hit) hit.focusedMs += e.durationMs
  }
  return out
}
