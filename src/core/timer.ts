import type { LogEntry, Mode, Settings, TimerEvent, TimerState } from './types'

/** If the heartbeat is older than this, the app was asleep or closed. */
export const AWAY_THRESHOLD_MS = 150_000
/** Automatic phase starts allowed in a row before waiting for the user. */
export const MAX_AUTO_CHAIN = 4
/** Focus sessions ended early are only logged once they reach this length. */
export const MIN_LOGGABLE_MS = 60_000

export const DEFAULT_SETTINGS: Settings = {
  focusMin: 25,
  shortMin: 5,
  longMin: 15,
  longBreakEvery: 4,
  autoAdvance: false,
  sound: false,
  volume: 0.25,
  notifications: false,
  dailyGoalMin: 0,
}

export const LIMITS = {
  focusMin: [1, 180],
  shortMin: [1, 60],
  longMin: [1, 90],
  longBreakEvery: [2, 10],
  dailyGoalMin: [0, 720],
} as const

let idCounter = 0
export function newId(): string {
  const c = globalThis.crypto as Crypto | undefined
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  idCounter += 1
  return `${Date.now().toString(36)}-${idCounter}-${Math.random().toString(36).slice(2, 8)}`
}

export function durationFor(mode: Mode, s: Settings): number {
  const min = mode === 'focus' ? s.focusMin : mode === 'short' ? s.shortMin : s.longMin
  return Math.round(min * 60_000)
}

export function createPhase(
  mode: Mode,
  settings: Settings,
  now: number,
  carry?: Pick<TimerState, 'topic' | 'cycle' | 'autoChain'>,
): TimerState {
  const durationMs = durationFor(mode, settings)
  return {
    mode,
    status: 'idle',
    durationMs,
    remainingMs: durationMs,
    targetAt: null,
    phaseId: newId(),
    topic: carry?.topic ?? '',
    cycle: carry?.cycle ?? 0,
    autoChain: carry?.autoChain ?? 0,
    lastSeenAt: now,
    completedAt: null,
    endedBy: null,
  }
}

/** Remaining time, always derived from the clock for a running phase. */
export function getRemaining(s: TimerState, now: number): number {
  if (s.status === 'running' && s.targetAt !== null) {
    return Math.max(0, Math.min(s.durationMs, s.targetAt - now))
  }
  if (s.status === 'completed') return 0
  return Math.max(0, Math.min(s.durationMs, s.remainingMs))
}

export function getElapsed(s: TimerState, now: number): number {
  if (s.status === 'completed') return s.durationMs
  return s.durationMs - getRemaining(s, now)
}

export function getProgress(s: TimerState, now: number): number {
  if (s.durationMs <= 0) return 0
  return Math.min(1, Math.max(0, getElapsed(s, now) / s.durationMs))
}

export function start(s: TimerState, now: number): TimerState {
  if (s.status !== 'idle' && s.status !== 'paused') return s
  const remaining = Math.max(0, s.remainingMs)
  if (remaining <= 0) return s
  return {
    ...s,
    status: 'running',
    targetAt: now + remaining,
    remainingMs: remaining,
    lastSeenAt: now,
    autoChain: 0,
  }
}

export function pause(s: TimerState, now: number): TimerState {
  if (s.status !== 'running') return s
  return {
    ...s,
    status: 'paused',
    remainingMs: getRemaining(s, now),
    targetAt: null,
    lastSeenAt: now,
    autoChain: 0,
  }
}

/** Fresh, idle phase of the same mode. Duration is re-read from settings. */
export function reset(s: TimerState, settings: Settings, now: number): TimerState {
  return createPhase(s.mode, settings, now, { topic: s.topic, cycle: s.cycle, autoChain: 0 })
}

export function switchMode(s: TimerState, mode: Mode, settings: Settings, now: number): TimerState {
  return createPhase(mode, settings, now, { topic: s.topic, cycle: s.cycle, autoChain: 0 })
}

export function touch(s: TimerState, now: number): TimerState {
  return s.lastSeenAt === now ? s : { ...s, lastSeenAt: now }
}

/** The phase that should follow the one in `s`. */
export function nextMode(s: TimerState, settings: Settings): Mode {
  if (s.mode !== 'focus') return 'focus'
  return s.cycle >= settings.longBreakEvery ? 'long' : 'short'
}

/**
 * Focus time worth recording for a phase that is being abandoned (reset or
 * mode switch). Returns null for breaks and for very short attempts.
 */
export function earlyEntry(s: TimerState, now: number): LogEntry | null {
  if (s.mode !== 'focus') return null
  if (s.status !== 'running' && s.status !== 'paused') return null
  const elapsed = getElapsed(s, now)
  if (elapsed < MIN_LOGGABLE_MS) return null
  return {
    id: s.phaseId,
    endedAt: now,
    durationMs: Math.round(elapsed),
    plannedMs: s.durationMs,
    outcome: 'early',
    topic: s.topic.trim(),
  }
}

export interface EvaluateResult {
  state: TimerState
  event: Extract<TimerEvent, { type: 'completed' }> | null
}

/**
 * Detects the end of a running phase. Safe to call as often as you like: a
 * phase can only complete once, because the state leaves `running` the first
 * time it does.
 *
 * The wall clock is authoritative. If the phase ran out while the app was not
 * alive (closed tab, sleeping laptop) it still completes in full, but it is
 * flagged `away` and stays silent, so nothing beeps or auto-starts on return.
 */
export function evaluate(s: TimerState, now: number, opts: { silent?: boolean } = {}): EvaluateResult {
  if (s.status !== 'running' || s.targetAt === null || now < s.targetAt) {
    return { state: s, event: null }
  }
  const away = now - s.lastSeenAt > AWAY_THRESHOLD_MS
  const silent = away || Boolean(opts.silent)
  const completedAt = away ? s.targetAt : Math.min(now, s.targetAt)

  let entry: LogEntry | null = null
  if (s.mode === 'focus') {
    entry = {
      id: s.phaseId,
      endedAt: completedAt,
      durationMs: s.durationMs,
      plannedMs: s.durationMs,
      outcome: 'completed',
      topic: s.topic.trim(),
      ...(away ? { away: true } : {}),
    }
  }

  let cycle = s.cycle
  if (s.mode === 'focus') cycle += 1
  if (s.mode === 'long') cycle = 0

  const state: TimerState = {
    ...s,
    status: 'completed',
    remainingMs: 0,
    targetAt: null,
    completedAt,
    endedBy: away ? 'away' : 'finished',
    lastSeenAt: now,
    cycle,
  }
  return { state, event: { type: 'completed', mode: s.mode, away, silent, entry } }
}

/** Moves from a completed phase to the next one, optionally starting it. */
export function beginNext(
  s: TimerState,
  settings: Settings,
  now: number,
  opts: { mode?: Mode; startNow?: boolean; auto?: boolean } = {},
): TimerState {
  const mode = opts.mode ?? nextMode(s, settings)
  const chain = opts.auto ? s.autoChain + 1 : 0
  const fresh = createPhase(mode, settings, now, { topic: s.topic, cycle: s.cycle, autoChain: chain })
  if (!opts.startNow) return fresh
  return { ...start(fresh, now), autoChain: chain }
}

export function shouldAutoAdvance(s: TimerState, settings: Settings, event: EvaluateResult['event']): boolean {
  return Boolean(
    event && !event.silent && settings.autoAdvance && s.status === 'completed' && s.autoChain < MAX_AUTO_CHAIN,
  )
}

/** Applies new settings to a phase. Only an untouched phase changes length. */
export function applySettingsToPhase(s: TimerState, settings: Settings): TimerState {
  if (s.status !== 'idle') return s
  const durationMs = durationFor(s.mode, settings)
  if (durationMs === s.durationMs) return s
  return { ...s, durationMs, remainingMs: durationMs }
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}
