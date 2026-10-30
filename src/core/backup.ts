import { dayKey } from './stats'
import { sanitizeLog, sanitizeSettings } from './storage'
import { MAX_TASKS, sanitizeTasks, type Task } from './tasks'
import type { LogEntry, Settings } from './types'

export const BACKUP_APP = 'lumaflow'
export const BACKUP_VERSION = 1
/** A real backup is a few hundred kilobytes at most. Anything bigger is not one. */
export const MAX_BACKUP_BYTES = 5_000_000
const LOG_CAP = 1000

export interface Backup {
  app: typeof BACKUP_APP
  version: number
  exportedAt: string
  settings: Settings
  tasks: Task[]
  log: LogEntry[]
}

export type ParsedBackup = { ok: true; backup: Backup } | { ok: false; error: string }

export function buildBackup(settings: Settings, tasks: Task[], log: LogEntry[], now: number): Backup {
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: new Date(now).toISOString(), settings, tasks, log }
}

export const backupFileName = (now: number) => `lumaflow-backup-${dayKey(now)}.json`
export const csvFileName = (now: number) => `lumaflow-sessions-${dayKey(now)}.csv`

/** Reads a backup file's text. Anything that is not clearly a LumaFlow backup is refused, and every field is re-checked. */
export function parseBackup(text: string): ParsedBackup {
  if (text.length > MAX_BACKUP_BYTES) return { ok: false, error: 'That file is too large to be a LumaFlow backup.' }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'That file is not a LumaFlow backup. It could not be read as JSON.' }
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw) || (raw as Record<string, unknown>).app !== BACKUP_APP) {
    return { ok: false, error: 'That file is not a LumaFlow backup.' }
  }
  const r = raw as Record<string, unknown>
  if (typeof r.version !== 'number' || !Number.isFinite(r.version) || r.version < 1) {
    return { ok: false, error: 'That backup has no valid version number.' }
  }
  if (r.version > BACKUP_VERSION) {
    return { ok: false, error: 'That backup was made by a newer version of LumaFlow. Update the app and try again.' }
  }
  return {
    ok: true,
    backup: {
      app: BACKUP_APP,
      version: r.version,
      exportedAt: typeof r.exportedAt === 'string' ? r.exportedAt.slice(0, 40) : '',
      settings: sanitizeSettings(r.settings),
      tasks: sanitizeTasks(r.tasks),
      log: sanitizeLog(r.log),
    },
  }
}

/** Union by id. What is already here wins, so notes you added since are never overwritten. Newest first. */
export function mergeLogs(current: LogEntry[], incoming: LogEntry[]): { log: LogEntry[]; added: number } {
  const have = new Set(current.map((e) => e.id))
  const fresh = incoming.filter((e) => !have.has(e.id))
  if (fresh.length === 0) return { log: current, added: 0 }
  const log = [...current, ...fresh].sort((a, b) => b.endedAt - a.endedAt).slice(0, LOG_CAP)
  const kept = new Set(log.map((e) => e.id))
  return { log, added: fresh.filter((e) => kept.has(e.id)).length }
}

/** Union by id, current items first. Stops at the list limit. */
export function mergeTasks(current: Task[], incoming: Task[]): { tasks: Task[]; added: number } {
  const have = new Set(current.map((t) => t.id))
  const room = Math.max(0, MAX_TASKS - current.length)
  const fresh = incoming.filter((t) => !have.has(t.id)).slice(0, room)
  if (fresh.length === 0) return { tasks: current, added: 0 }
  return { tasks: [...current, ...fresh], added: fresh.length }
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * One cell of a CSV. Cells that start with =, +, - or @ are prefixed so a spreadsheet
 * shows them as text instead of running them as a formula.
 */
export function csvCell(value: string | number): string {
  let s = String(value)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function resultLabel(e: LogEntry): string {
  if (e.stopwatch) return 'Stopwatch run'
  if (e.outcome === 'early') return 'Ended early'
  return e.away ? 'Finished while away' : 'Completed'
}

/** Sessions as a spreadsheet file, oldest first, in local time. Opens correctly in Excel and Sheets. */
export function sessionsToCsv(log: LogEntry[]): string {
  const rows = [['Date', 'Ended', 'Minutes', 'Planned minutes', 'Type', 'Result', 'Topic', 'Review next']]
  for (const e of [...log].sort((a, b) => a.endedAt - b.endedAt)) {
    const d = new Date(e.endedAt)
    rows.push([
      dayKey(e.endedAt),
      `${pad(d.getHours())}:${pad(d.getMinutes())}`,
      (e.durationMs / 60_000).toFixed(1),
      e.stopwatch ? '' : (e.plannedMs / 60_000).toFixed(1),
      e.stopwatch ? 'Stopwatch' : 'Focus timer',
      resultLabel(e),
      e.topic,
      e.reviewNext ?? '',
    ])
  }
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}
