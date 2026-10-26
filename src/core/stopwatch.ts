import { AWAY_THRESHOLD_MS, MIN_LOGGABLE_MS, newId } from './timer'
import type { LogEntry, StopwatchState } from './types'

export function createStopwatch(now: number): StopwatchState {
  return { status: 'idle', runId: newId(), startedAt: null, elapsedMs: 0, lastSeenAt: now }
}

/** Always derived from the clock while running. */
export function swElapsed(s: StopwatchState, now: number): number {
  if (s.status === 'running' && s.startedAt !== null) return Math.max(0, now - s.startedAt)
  return Math.max(0, s.elapsedMs)
}

/** Start or resume. Resuming continues from the elapsed time already banked. */
export function swStart(s: StopwatchState, now: number): StopwatchState {
  if (s.status === 'running') return s
  return { ...s, status: 'running', startedAt: now - s.elapsedMs, lastSeenAt: now }
}

export function swPause(s: StopwatchState, now: number): StopwatchState {
  if (s.status !== 'running') return s
  return { ...s, status: 'paused', elapsedMs: swElapsed(s, now), startedAt: null, lastSeenAt: now }
}

export function swTouch(s: StopwatchState, now: number): StopwatchState {
  return s.lastSeenAt === now ? s : { ...s, lastSeenAt: now }
}

/** History entry for a finished run, or null when it was too short to keep. */
export function swEntry(s: StopwatchState, now: number, topic: string): LogEntry | null {
  if (s.status === 'idle') return null
  const elapsed = swElapsed(s, now)
  if (elapsed < MIN_LOGGABLE_MS) return null
  return {
    id: s.runId,
    endedAt: now,
    durationMs: Math.round(elapsed),
    plannedMs: Math.round(elapsed),
    outcome: 'completed',
    topic: topic.trim(),
    stopwatch: true,
  }
}

/**
 * A stopwatch has no end, so time spent asleep or with the app closed must
 * not be counted as study time. If the heartbeat went quiet for longer than
 * the away threshold, the run is paused at the last moment the app was alive.
 */
export function swEvaluate(s: StopwatchState, now: number): { state: StopwatchState; away: boolean } {
  if (s.status !== 'running' || s.startedAt === null) return { state: s, away: false }
  if (now - s.lastSeenAt <= AWAY_THRESHOLD_MS) return { state: s, away: false }
  const stoppedAt = Math.max(s.startedAt, Math.min(now, s.lastSeenAt))
  return {
    state: {
      ...s,
      status: 'paused',
      elapsedMs: Math.max(0, stoppedAt - s.startedAt),
      startedAt: null,
      lastSeenAt: now,
    },
    away: true,
  }
}
