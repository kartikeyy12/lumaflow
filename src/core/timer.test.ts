import { describe, expect, it } from 'vitest'
import {
  AWAY_THRESHOLD_MS,
  DEFAULT_SETTINGS,
  MAX_AUTO_CHAIN,
  MIN_LOGGABLE_MS,
  applySettingsToPhase,
  beginNext,
  createPhase,
  earlyEntry,
  evaluate,
  getProgress,
  getRemaining,
  nextMode,
  pause,
  reset,
  shouldAutoAdvance,
  start,
  switchMode,
} from './timer'
import { formatClock, formatDuration } from './format'

const S = DEFAULT_SETTINGS
const T0 = 1_700_000_000_000
const MIN = 60_000

const fresh = (mode: 'focus' | 'short' | 'long' = 'focus') => createPhase(mode, S, T0)

describe('start, pause, resume, reset', () => {
  it('starts with a target timestamp and the full duration remaining', () => {
    const r = start(fresh(), T0)
    expect(r.status).toBe('running')
    expect(r.targetAt).toBe(T0 + 25 * MIN)
    expect(getRemaining(r, T0)).toBe(25 * MIN)
  })

  it('derives remaining time from the clock, not from tick counts', () => {
    const r = start(fresh(), T0)
    expect(getRemaining(r, T0 + 10 * MIN + 500)).toBe(15 * MIN - 500)
    // Jumping straight ahead (throttled tab) is exact.
    expect(getRemaining(r, T0 + 24 * MIN)).toBe(1 * MIN)
  })

  it('pauses by freezing the remaining time', () => {
    const p = pause(start(fresh(), T0), T0 + 5 * MIN)
    expect(p.status).toBe('paused')
    expect(p.targetAt).toBeNull()
    expect(getRemaining(p, T0 + 99 * MIN)).toBe(20 * MIN)
  })

  it('resumes from the frozen remainder', () => {
    const p = pause(start(fresh(), T0), T0 + 5 * MIN)
    const r = start(p, T0 + 30 * MIN)
    expect(r.status).toBe('running')
    expect(r.targetAt).toBe(T0 + 30 * MIN + 20 * MIN)
  })

  it('ignores start while running and pause while idle', () => {
    const r = start(fresh(), T0)
    expect(start(r, T0 + 1000)).toBe(r)
    const i = fresh()
    expect(pause(i, T0)).toBe(i)
  })

  it('reset returns an idle full-length phase with a new id', () => {
    const r = start(fresh(), T0)
    const x = reset(r, S, T0 + 3 * MIN)
    expect(x.status).toBe('idle')
    expect(x.remainingMs).toBe(25 * MIN)
    expect(x.phaseId).not.toBe(r.phaseId)
  })

  it('reset picks up changed settings', () => {
    const x = reset(start(fresh(), T0), { ...S, focusMin: 50 }, T0)
    expect(x.durationMs).toBe(50 * MIN)
  })

  it('progress reflects real elapsed time', () => {
    const r = start(fresh(), T0)
    expect(getProgress(r, T0)).toBe(0)
    expect(getProgress(r, T0 + 12.5 * MIN)).toBeCloseTo(0.5, 5)
    expect(getProgress(r, T0 + 99 * MIN)).toBe(1)
  })
})

describe('mode switching', () => {
  it('switches to a fresh idle phase of the new mode, keeping the topic', () => {
    const base = { ...start(fresh(), T0), topic: 'DFT' }
    const x = switchMode(base, 'short', S, T0 + MIN)
    expect(x.mode).toBe('short')
    expect(x.status).toBe('idle')
    expect(x.durationMs).toBe(5 * MIN)
    expect(x.topic).toBe('DFT')
  })

  it('applies new settings only to an untouched phase', () => {
    const idle = applySettingsToPhase(fresh(), { ...S, focusMin: 40 })
    expect(idle.durationMs).toBe(40 * MIN)
    const running = start(fresh(), T0)
    expect(applySettingsToPhase(running, { ...S, focusMin: 40 })).toBe(running)
  })
})

describe('completion', () => {
  it('does nothing before the target', () => {
    const r = start(fresh(), T0)
    const res = evaluate(r, T0 + 25 * MIN - 1)
    expect(res.event).toBeNull()
    expect(res.state).toBe(r)
  })

  it('completes exactly at the target and records the session', () => {
    const r = { ...start(fresh(), T0), topic: ' Laplace ' }
    const res = evaluate({ ...r, lastSeenAt: T0 + 25 * MIN - 200 }, T0 + 25 * MIN)
    expect(res.event?.type).toBe('completed')
    expect(res.event?.away).toBe(false)
    expect(res.event?.silent).toBe(false)
    expect(res.event?.entry).toMatchObject({
      id: r.phaseId,
      durationMs: 25 * MIN,
      outcome: 'completed',
      topic: 'Laplace',
    })
    expect(res.state.status).toBe('completed')
    expect(res.state.cycle).toBe(1)
  })

  it('cannot complete twice (no duplicate events or entries)', () => {
    const r = { ...start(fresh(), T0), lastSeenAt: T0 + 25 * MIN }
    const first = evaluate(r, T0 + 25 * MIN)
    expect(first.event).not.toBeNull()
    const second = evaluate(first.state, T0 + 25 * MIN + 1000)
    expect(second.event).toBeNull()
    expect(second.state).toBe(first.state)
  })

  it('a break completing records no entry and does not add to the cycle', () => {
    const r = { ...start(fresh('short'), T0), cycle: 2, lastSeenAt: T0 + 5 * MIN }
    const res = evaluate(r, T0 + 5 * MIN)
    expect(res.event?.entry).toBeNull()
    expect(res.state.cycle).toBe(2)
  })

  it('finishing a long break resets the cycle', () => {
    const r = { ...start(fresh('long'), T0), cycle: 4, lastSeenAt: T0 + 15 * MIN }
    expect(evaluate(r, T0 + 15 * MIN).state.cycle).toBe(0)
  })

  it('treats a long gap since the last heartbeat as away: full credit at the target time, silent', () => {
    const r = { ...start(fresh(), T0), lastSeenAt: T0 + 10 * MIN }
    const now = T0 + 25 * MIN + 2 * AWAY_THRESHOLD_MS
    const res = evaluate(r, now)
    expect(res.event?.away).toBe(true)
    expect(res.event?.silent).toBe(true)
    expect(res.event?.entry?.endedAt).toBe(T0 + 25 * MIN)
    expect(res.event?.entry?.away).toBe(true)
    expect(res.state.endedBy).toBe('away')
  })

  it('a short gap (throttled background tab) is not treated as away', () => {
    const r = { ...start(fresh(), T0), lastSeenAt: T0 + 24 * MIN + 30_000 }
    const res = evaluate(r, T0 + 25 * MIN + 20_000)
    expect(res.event?.away).toBe(false)
    expect(res.event?.silent).toBe(false)
  })

  it('silent option suppresses sound and auto-advance without marking away', () => {
    const r = { ...start(fresh(), T0), lastSeenAt: T0 + 25 * MIN }
    const res = evaluate(r, T0 + 25 * MIN, { silent: true })
    expect(res.event?.silent).toBe(true)
    expect(res.event?.away).toBe(false)
  })
})

describe('what comes next', () => {
  it('short break after focus, long break after the configured count', () => {
    expect(nextMode({ ...fresh(), cycle: 1 }, S)).toBe('short')
    expect(nextMode({ ...fresh(), cycle: 4 }, S)).toBe('long')
    expect(nextMode({ ...fresh(), cycle: 2 }, { ...S, longBreakEvery: 2 })).toBe('long')
  })

  it('focus follows any break', () => {
    expect(nextMode(fresh('short'), S)).toBe('focus')
    expect(nextMode(fresh('long'), S)).toBe('focus')
  })

  it('beginNext keeps topic and cycle and can start immediately', () => {
    const done = { ...fresh(), status: 'completed' as const, cycle: 1, topic: 'Z-transform' }
    const n = beginNext(done, S, T0, { startNow: true })
    expect(n.mode).toBe('short')
    expect(n.status).toBe('running')
    expect(n.topic).toBe('Z-transform')
    expect(n.cycle).toBe(1)
    expect(n.phaseId).not.toBe(done.phaseId)
  })
})

describe('auto-advance', () => {
  const done = (over = {}) => ({ ...fresh(), status: 'completed' as const, ...over })
  const event = (silent: boolean) => ({ type: 'completed' as const, mode: 'focus' as const, away: false, silent, entry: null })

  it('is off by default', () => {
    expect(shouldAutoAdvance(done(), S, event(false))).toBe(false)
  })

  it('advances when enabled and the event was not silent', () => {
    expect(shouldAutoAdvance(done(), { ...S, autoAdvance: true }, event(false))).toBe(true)
  })

  it('never advances after a silent completion', () => {
    expect(shouldAutoAdvance(done(), { ...S, autoAdvance: true }, event(true))).toBe(false)
  })

  it('stops after the chain limit so there is no endless unattended loop', () => {
    const s = { ...S, autoAdvance: true }
    let state = done({ autoChain: 0 })
    let count = 0
    while (shouldAutoAdvance(state, s, event(false))) {
      state = { ...beginNext(state, s, T0, { startNow: true, auto: true }), status: 'completed' as const }
      count += 1
      if (count > 20) break
    }
    expect(count).toBe(MAX_AUTO_CHAIN)
  })

  it('a manual start resets the chain', () => {
    const r = start({ ...fresh(), autoChain: 3 }, T0)
    expect(r.autoChain).toBe(0)
  })
})

describe('ending early', () => {
  it('logs focus progress when abandoned after the minimum', () => {
    const r = start(fresh(), T0)
    const e = earlyEntry(r, T0 + 10 * MIN)
    expect(e).toMatchObject({ id: r.phaseId, durationMs: 10 * MIN, plannedMs: 25 * MIN, outcome: 'early' })
  })

  it('ignores very short attempts', () => {
    const r = start(fresh(), T0)
    expect(earlyEntry(r, T0 + MIN_LOGGABLE_MS - 1)).toBeNull()
  })

  it('never logs breaks or idle phases', () => {
    expect(earlyEntry(start(fresh('short'), T0), T0 + 4 * MIN)).toBeNull()
    expect(earlyEntry(fresh(), T0 + 4 * MIN)).toBeNull()
  })

  it('counts paused time correctly', () => {
    const p = pause(start(fresh(), T0), T0 + 7 * MIN)
    expect(earlyEntry(p, T0 + 60 * MIN)?.durationMs).toBe(7 * MIN)
  })
})

describe('formatting', () => {
  it('formats mm:ss and h:mm:ss, rounding up partial seconds', () => {
    expect(formatClock(25 * MIN)).toBe('25:00')
    expect(formatClock(24 * MIN + 59_001)).toBe('25:00')
    expect(formatClock(1)).toBe('00:01')
    expect(formatClock(0)).toBe('00:00')
    expect(formatClock(90 * MIN)).toBe('1:30:00')
  })

  it('formats durations', () => {
    expect(formatDuration(0)).toBe('0m')
    expect(formatDuration(40 * MIN)).toBe('40m')
    expect(formatDuration(85 * MIN)).toBe('1h 25m')
    expect(formatDuration(120 * MIN)).toBe('2h')
  })
})
