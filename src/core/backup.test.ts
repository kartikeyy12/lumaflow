import { describe, expect, it } from 'vitest'
import {
  BACKUP_VERSION,
  MAX_BACKUP_BYTES,
  backupFileName,
  buildBackup,
  csvCell,
  csvFileName,
  mergeLogs,
  mergeTasks,
  parseBackup,
  sessionsToCsv,
} from './backup'
import { MAX_TASKS, type Task } from './tasks'
import { DEFAULT_SETTINGS } from './timer'
import type { LogEntry } from './types'

const NOW = new Date(2026, 9, 30, 10, 5, 0).getTime()
const entry = (id: string, endedAt: number, extra: Partial<LogEntry> = {}): LogEntry => ({
  id,
  endedAt,
  durationMs: 25 * 60_000,
  plannedMs: 25 * 60_000,
  outcome: 'completed',
  topic: '',
  ...extra,
})
const task = (id: string, text = id, done = false): Task => ({ id, text, done, createdAt: 1, doneAt: done ? 2 : null })

describe('backup file', () => {
  it('round trips settings, tasks and sessions', () => {
    const settings = { ...DEFAULT_SETTINGS, scene: 'drift' as const, focusMin: 50 }
    const log = [entry('a', NOW, { topic: 'Filters', reviewNext: 'Q4' }), entry('b', NOW - 1000, { stopwatch: true })]
    const tasks = [task('t1', 'Read', true), task('t2')]
    const text = JSON.stringify(buildBackup(settings, tasks, log, NOW))
    const res = parseBackup(text)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.backup.settings).toEqual(settings)
    expect(res.backup.tasks).toEqual(tasks)
    expect(res.backup.log).toEqual(log)
    expect(res.backup.exportedAt).toBe(new Date(NOW).toISOString())
  })

  it('names files by local date', () => {
    expect(backupFileName(NOW)).toBe('lumaflow-backup-2026-10-30.json')
    expect(csvFileName(NOW)).toBe('lumaflow-sessions-2026-10-30.csv')
  })

  it.each([
    ['not json', 'hello {'],
    ['an array', '[]'],
    ['null', 'null'],
    ['another app', JSON.stringify({ app: 'other', version: 1 })],
    ['no app', JSON.stringify({ version: 1, log: [] })],
    ['no version', JSON.stringify({ app: 'lumaflow' })],
    ['a zero version', JSON.stringify({ app: 'lumaflow', version: 0 })],
    ['a string version', JSON.stringify({ app: 'lumaflow', version: '1' })],
  ])('refuses %s', (_name, text) => {
    const res = parseBackup(text)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.length).toBeGreaterThan(10)
  })

  it('refuses a newer format and an oversized file', () => {
    const newer = parseBackup(JSON.stringify({ app: 'lumaflow', version: BACKUP_VERSION + 1 }))
    expect(newer.ok === false && newer.error).toMatch(/newer version/)
    expect(parseBackup('x'.repeat(MAX_BACKUP_BYTES + 1)).ok).toBe(false)
  })

  it('re-checks every field instead of trusting the file', () => {
    const res = parseBackup(
      JSON.stringify({
        app: 'lumaflow',
        version: 1,
        settings: { focusMin: 99999, scene: 'lava', ambient: 'x', noiseVolume: 5, __proto__: { polluted: true } },
        tasks: [{ id: 'a', text: '  ok  ' }, { id: 'a', text: 'dup' }, { id: 'b' }, 'junk'],
        log: [{ id: 'l1', endedAt: 5, durationMs: 60_000, outcome: 'completed' }, { id: 'l2', outcome: 'weird' }, 7],
      }),
    )
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.backup.settings.focusMin).toBe(180)
    expect(res.backup.settings.scene).toBe('ribbon')
    expect(res.backup.settings.noiseVolume).toBe(1)
    expect(res.backup.tasks.map((t) => t.text)).toEqual(['ok'])
    expect(res.backup.log.map((e) => e.id)).toEqual(['l1'])
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('accepts a backup with missing sections as empty ones', () => {
    const res = parseBackup(JSON.stringify({ app: 'lumaflow', version: 1 }))
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.backup.log).toEqual([])
      expect(res.backup.tasks).toEqual([])
      expect(res.backup.settings).toEqual(DEFAULT_SETTINGS)
    }
  })
})

describe('merging a restore', () => {
  it('adds only sessions that are not here, newest first', () => {
    const current = [entry('a', 3000), entry('c', 1000)]
    const out = mergeLogs(current, [entry('a', 3000), entry('b', 2000), entry('d', 500)])
    expect(out.log.map((e) => e.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(out.added).toBe(2)
  })

  it('keeps what you already have when ids match', () => {
    const mine = entry('a', 3000, { reviewNext: 'my note' })
    const out = mergeLogs([mine], [entry('a', 3000, { reviewNext: 'old note' }), entry('b', 1)])
    expect(out.log.find((e) => e.id === 'a')?.reviewNext).toBe('my note')
  })

  it('returns the same array when nothing is new', () => {
    const current = [entry('a', 1)]
    expect(mergeLogs(current, [entry('a', 1)]).log).toBe(current)
    expect(mergeLogs(current, []).added).toBe(0)
  })

  it('never goes past the history limit', () => {
    const many = Array.from({ length: 1000 }, (_, i) => entry(`old${i}`, i + 1))
    const out = mergeLogs(many, [entry('new', 5_000_000), entry('ancient', 0)])
    expect(out.log).toHaveLength(1000)
    expect(out.log[0].id).toBe('new')
    expect(out.added).toBe(1)
  })

  it('merges to-do items by id and respects the list limit', () => {
    const out = mergeTasks([task('a'), task('b')], [task('b', 'changed'), task('c')])
    expect(out.tasks.map((t) => t.id)).toEqual(['a', 'b', 'c'])
    expect(out.tasks[1].text).toBe('b')
    expect(out.added).toBe(1)
    const full = Array.from({ length: MAX_TASKS - 1 }, (_, i) => task(`t${i}`))
    const capped = mergeTasks(full, [task('x1'), task('x2'), task('x3')])
    expect(capped.tasks).toHaveLength(MAX_TASKS)
    expect(capped.added).toBe(1)
  })
})

describe('CSV export', () => {
  it('quotes commas, quotes and line breaks', () => {
    expect(csvCell('plain')).toBe('plain')
    expect(csvCell('a, b')).toBe('"a, b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('two\nlines')).toBe('"two\nlines"')
    expect(csvCell(4.5)).toBe('4.5')
  })

  it('neutralises spreadsheet formulas', () => {
    for (const bad of ['=SUM(A1:A9)', '+1', '-2+3', '@cmd', '\tx']) {
      expect(csvCell(bad).replace(/^"/, '').startsWith("'")).toBe(true)
    }
    expect(csvCell('5V rail')).toBe('5V rail')
  })

  it('writes one row per session, oldest first, with a header and a BOM', () => {
    const log = [
      entry('b', new Date(2026, 9, 30, 14, 30).getTime(), { topic: 'Filters, active', reviewNext: 'Q4' }),
      entry('a', new Date(2026, 9, 29, 9, 5).getTime(), { outcome: 'early', durationMs: 10 * 60_000 }),
      entry('c', new Date(2026, 9, 30, 16, 0).getTime(), { stopwatch: true, durationMs: 90 * 60_000, plannedMs: 90 * 60_000 }),
    ]
    const csv = sessionsToCsv(log)
    expect(csv.startsWith('﻿Date,Ended,Minutes,Planned minutes,Type,Result,Topic,Review next\r\n')).toBe(true)
    const lines = csv.trim().split('\r\n').slice(1)
    expect(lines).toEqual([
      '2026-10-29,09:05,10.0,25.0,Focus timer,Ended early,,',
      '2026-10-30,14:30,25.0,25.0,Focus timer,Completed,"Filters, active",Q4',
      '2026-10-30,16:00,90.0,,Stopwatch,Stopwatch run,,',
    ])
  })

  it('is just the header for an empty history', () => {
    expect(sessionsToCsv([]).trim().split('\r\n')).toHaveLength(1)
  })
})
