import { describe, expect, it } from 'vitest'
import { formatElapsed, spokenDuration } from './format'
import { createStopwatch, swElapsed, swEntry, swEvaluate, swPause, swStart, swTouch } from './stopwatch'
import { AWAY_THRESHOLD_MS, MIN_LOGGABLE_MS } from './timer'

const T0 = 1_700_000_000_000
const MIN = 60_000

describe('stopwatch', () => {
  it('starts at zero and counts up from the clock', () => {
    const s = createStopwatch(T0)
    expect(swElapsed(s, T0 + 5000)).toBe(0)
    const r = swStart(s, T0)
    expect(swElapsed(r, T0)).toBe(0)
    expect(swElapsed(r, T0 + 90_500)).toBe(90_500)
  })

  it('pauses by banking the elapsed time', () => {
    const p = swPause(swStart(createStopwatch(T0), T0), T0 + 10 * MIN)
    expect(p.status).toBe('paused')
    expect(p.startedAt).toBeNull()
    expect(swElapsed(p, T0 + 99 * MIN)).toBe(10 * MIN)
  })

  it('resumes from the banked time, not from zero', () => {
    const p = swPause(swStart(createStopwatch(T0), T0), T0 + 10 * MIN)
    const r = swStart(p, T0 + 30 * MIN)
    expect(swElapsed(r, T0 + 30 * MIN)).toBe(10 * MIN)
    expect(swElapsed(r, T0 + 35 * MIN)).toBe(15 * MIN)
  })

  it('ignores start while running and pause while idle', () => {
    const r = swStart(createStopwatch(T0), T0)
    expect(swStart(r, T0 + 1000)).toBe(r)
    const i = createStopwatch(T0)
    expect(swPause(i, T0)).toBe(i)
  })

  it('never reports negative time if the clock moves backwards', () => {
    const r = swStart(createStopwatch(T0), T0)
    expect(swElapsed(r, T0 - 10_000)).toBe(0)
  })

  describe('history entry', () => {
    it('is recorded with the stopwatch flag and a trimmed topic', () => {
      const r = swStart(createStopwatch(T0), T0)
      const e = swEntry(r, T0 + 42 * MIN, '  Fourier series ')
      expect(e).toMatchObject({
        id: r.runId,
        durationMs: 42 * MIN,
        outcome: 'completed',
        topic: 'Fourier series',
        stopwatch: true,
      })
    })

    it('is skipped under the minimum, and for an idle stopwatch', () => {
      const r = swStart(createStopwatch(T0), T0)
      expect(swEntry(r, T0 + MIN_LOGGABLE_MS - 1, '')).toBeNull()
      expect(swEntry(createStopwatch(T0), T0 + 10 * MIN, '')).toBeNull()
    })

    it('counts a paused run by its banked time', () => {
      const p = swPause(swStart(createStopwatch(T0), T0), T0 + 7 * MIN)
      expect(swEntry(p, T0 + 3 * 60 * MIN, '')?.durationMs).toBe(7 * MIN)
    })
  })

  describe('time away', () => {
    it('is left alone while the heartbeat is fresh', () => {
      const r = { ...swStart(createStopwatch(T0), T0), lastSeenAt: T0 + 10 * MIN }
      const res = swEvaluate(r, T0 + 10 * MIN + 30_000)
      expect(res.away).toBe(false)
      expect(res.state).toBe(r)
    })

    it('pauses at the last heartbeat when the gap is longer than the threshold', () => {
      const r = { ...swStart(createStopwatch(T0), T0), lastSeenAt: T0 + 10 * MIN }
      const res = swEvaluate(r, T0 + 10 * MIN + AWAY_THRESHOLD_MS + 1)
      expect(res.away).toBe(true)
      expect(res.state.status).toBe('paused')
      expect(swElapsed(res.state, T0 + 99 * MIN)).toBe(10 * MIN)
    })

    it('does not count eight hours of sleep as study time', () => {
      const r = { ...swStart(createStopwatch(T0), T0), lastSeenAt: T0 + 20 * MIN }
      const res = swEvaluate(r, T0 + 8 * 60 * MIN)
      expect(swElapsed(res.state, T0 + 8 * 60 * MIN)).toBe(20 * MIN)
    })

    it('only applies to a running stopwatch', () => {
      const p = swPause(swStart(createStopwatch(T0), T0), T0 + MIN)
      expect(swEvaluate(p, T0 + 99 * MIN).away).toBe(false)
    })

    it('touch only changes the heartbeat', () => {
      const r = swStart(createStopwatch(T0), T0)
      const t = swTouch(r, T0 + 5000)
      expect(t.lastSeenAt).toBe(T0 + 5000)
      expect(swElapsed(t, T0 + 5000)).toBe(5000)
    })
  })
})

describe('count-up formatting', () => {
  it('rounds down so the clock never runs ahead', () => {
    expect(formatElapsed(0)).toBe('00:00')
    expect(formatElapsed(999)).toBe('00:00')
    expect(formatElapsed(1000)).toBe('00:01')
    expect(formatElapsed(59_999)).toBe('00:59')
    expect(formatElapsed(65 * MIN + 3000)).toBe('1:05:03')
  })

  it('reads out durations for screen readers', () => {
    expect(spokenDuration(0)).toBe('0 seconds')
    expect(spokenDuration(61_000)).toBe('1 minute 1 second')
    expect(spokenDuration(3600_000 + 5 * MIN + 3000)).toBe('1 hour 5 minutes 3 seconds')
  })
})
