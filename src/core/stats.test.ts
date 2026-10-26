import { describe, expect, it } from 'vitest'
import { appendEntry, dayKey, statsForDay } from './stats'
import type { LogEntry } from './types'

const entry = (id: string, endedAt: number, over: Partial<LogEntry> = {}): LogEntry => ({
  id,
  endedAt,
  durationMs: 25 * 60_000,
  plannedMs: 25 * 60_000,
  outcome: 'completed',
  topic: '',
  ...over,
})

// Built from local-time components so the tests hold in any time zone.
const at = (y: number, mo: number, d: number, h = 12, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime()

describe('dayKey', () => {
  it('uses the local calendar date', () => {
    expect(dayKey(at(2026, 3, 9, 0, 5))).toBe('2026-03-09')
    expect(dayKey(at(2026, 3, 9, 23, 59))).toBe('2026-03-09')
    expect(dayKey(at(2026, 12, 31, 23, 59))).toBe('2026-12-31')
  })
})

describe('statsForDay', () => {
  const now = at(2026, 5, 10, 15)

  it('counts only entries that ended today', () => {
    const log = [
      entry('a', at(2026, 5, 10, 9)),
      entry('b', at(2026, 5, 10, 11)),
      entry('c', at(2026, 5, 9, 23, 59)),
      entry('d', at(2026, 5, 11, 0, 1)),
    ]
    const s = statsForDay(log, now)
    expect(s.sessions).toBe(2)
    expect(s.focusedMs).toBe(50 * 60_000)
  })

  it('midnight rolls the day over', () => {
    const log = [entry('a', at(2026, 5, 10, 23, 50))]
    expect(statsForDay(log, at(2026, 5, 10, 23, 59)).sessions).toBe(1)
    expect(statsForDay(log, at(2026, 5, 11, 0, 0)).sessions).toBe(0)
  })

  it('early sessions add time but are not counted as completed', () => {
    const log = [
      entry('a', at(2026, 5, 10, 9)),
      entry('b', at(2026, 5, 10, 10), { outcome: 'early', durationMs: 10 * 60_000 }),
    ]
    const s = statsForDay(log, now)
    expect(s.sessions).toBe(1)
    expect(s.focusedMs).toBe(35 * 60_000)
  })

  it('is empty for an empty log', () => {
    expect(statsForDay([], now)).toMatchObject({ sessions: 0, focusedMs: 0 })
  })
})

describe('appendEntry', () => {
  it('rejects duplicate ids', () => {
    const e = entry('a', 1000)
    const once = appendEntry([], e)
    expect(appendEntry(once, { ...e })).toBe(once)
    expect(once).toHaveLength(1)
  })

  it('keeps newest first', () => {
    const log = appendEntry(appendEntry([], entry('a', 1000)), entry('b', 2000))
    expect(log.map((e) => e.id)).toEqual(['b', 'a'])
  })

  it('caps the log length', () => {
    let log: LogEntry[] = []
    for (let i = 0; i < 12; i++) log = appendEntry(log, entry(`e${i}`, i * 1000), 10)
    expect(log).toHaveLength(10)
    expect(log[0].id).toBe('e11')
  })
})
