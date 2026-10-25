import { DEFAULT_SETTINGS, LIMITS, clamp } from './timer'
import type { LogEntry, Mode, Outcome, Settings, Status, TimerState } from './types'

export const KEYS = {
  settings: 'lumaflow.v1.settings',
  timer: 'lumaflow.v1.timer',
  log: 'lumaflow.v1.log',
} as const

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function getBrowserStorage(): StorageLike {
  try {
    const s = window.localStorage
    const probe = '__lumaflow_probe__'
    s.setItem(probe, '1')
    s.removeItem(probe)
    return s
  } catch {
    return memoryStorage()
  }
}

export function memoryStorage(): StorageLike {
  const map = new Map<string, string>()
  return {
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  }
}

function readJson(storage: StorageLike, key: string): unknown {
  try {
    const raw = storage.getItem(key)
    return raw === null ? null : JSON.parse(raw)
  } catch {
    return null
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)
const str = (v: unknown, fallback: string, max = 300) => (typeof v === 'string' ? v.slice(0, max) : fallback)

export function sanitizeSettings(raw: unknown): Settings {
  const d = DEFAULT_SETTINGS
  const r = isObj(raw) ? raw : {}
  return {
    focusMin: Math.round(clamp(num(r.focusMin, d.focusMin), ...LIMITS.focusMin)),
    shortMin: Math.round(clamp(num(r.shortMin, d.shortMin), ...LIMITS.shortMin)),
    longMin: Math.round(clamp(num(r.longMin, d.longMin), ...LIMITS.longMin)),
    longBreakEvery: Math.round(clamp(num(r.longBreakEvery, d.longBreakEvery), ...LIMITS.longBreakEvery)),
    autoAdvance: bool(r.autoAdvance, d.autoAdvance),
    sound: bool(r.sound, d.sound),
    volume: clamp(num(r.volume, d.volume), 0, 1),
    notifications: bool(r.notifications, d.notifications),
    dailyGoalMin: Math.round(clamp(num(r.dailyGoalMin, d.dailyGoalMin), ...LIMITS.dailyGoalMin)),
  }
}

const MODES: Mode[] = ['focus', 'short', 'long']
const STATUSES: Status[] = ['idle', 'running', 'paused', 'completed']

export function sanitizeTimer(raw: unknown): TimerState | null {
  if (!isObj(raw)) return null
  if (!MODES.includes(raw.mode as Mode) || !STATUSES.includes(raw.status as Status)) return null
  const durationMs = num(raw.durationMs, NaN)
  if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 12 * 3600_000) return null
  const status = raw.status as Status
  const targetAt = typeof raw.targetAt === 'number' && Number.isFinite(raw.targetAt) ? raw.targetAt : null
  if (status === 'running' && targetAt === null) return null
  if (typeof raw.phaseId !== 'string' || raw.phaseId.length === 0) return null
  return {
    mode: raw.mode as Mode,
    status,
    durationMs,
    remainingMs: clamp(num(raw.remainingMs, durationMs), 0, durationMs),
    targetAt: status === 'running' ? targetAt : null,
    phaseId: raw.phaseId.slice(0, 80),
    topic: str(raw.topic, ''),
    cycle: Math.max(0, Math.round(num(raw.cycle, 0))),
    autoChain: Math.max(0, Math.round(num(raw.autoChain, 0))),
    lastSeenAt: num(raw.lastSeenAt, Date.now()),
    completedAt: typeof raw.completedAt === 'number' ? raw.completedAt : null,
    endedBy: raw.endedBy === 'finished' || raw.endedBy === 'away' ? raw.endedBy : null,
  }
}

const OUTCOMES: Outcome[] = ['completed', 'early']

export function sanitizeLog(raw: unknown): LogEntry[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: LogEntry[] = []
  for (const item of raw) {
    if (!isObj(item)) continue
    if (typeof item.id !== 'string' || seen.has(item.id)) continue
    if (!OUTCOMES.includes(item.outcome as Outcome)) continue
    const endedAt = num(item.endedAt, NaN)
    const durationMs = num(item.durationMs, NaN)
    if (!Number.isFinite(endedAt) || !Number.isFinite(durationMs) || durationMs < 0) continue
    seen.add(item.id)
    out.push({
      id: item.id,
      endedAt,
      durationMs,
      plannedMs: num(item.plannedMs, durationMs),
      outcome: item.outcome as Outcome,
      topic: str(item.topic, ''),
      ...(item.away === true ? { away: true } : {}),
      ...(typeof item.reviewNext === 'string' && item.reviewNext ? { reviewNext: str(item.reviewNext, '') } : {}),
    })
  }
  return out.sort((a, b) => b.endedAt - a.endedAt).slice(0, 1000)
}

export function loadSettings(storage: StorageLike): Settings {
  return sanitizeSettings(readJson(storage, KEYS.settings))
}
export function loadTimer(storage: StorageLike): TimerState | null {
  return sanitizeTimer(readJson(storage, KEYS.timer))
}
export function loadLog(storage: StorageLike): LogEntry[] {
  return sanitizeLog(readJson(storage, KEYS.log))
}

/** Returns the serialized string that was written, or null on failure. */
export function save(storage: StorageLike, key: string, value: unknown): string | null {
  try {
    const s = JSON.stringify(value)
    storage.setItem(key, s)
    return s
  } catch {
    return null
  }
}
