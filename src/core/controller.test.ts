import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TimerController } from './controller'
import { KEYS, loadLog, memoryStorage, save, type StorageLike } from './storage'
import { statsForDay } from './stats'
import { AWAY_THRESHOLD_MS, DEFAULT_SETTINGS } from './timer'

const MIN = 60_000
const T0 = new Date(2026, 4, 10, 9, 0, 0).getTime()

function setup(storage: StorageLike = memoryStorage(), startAt = T0) {
  let now = startAt
  const onCompleted = vi.fn()
  const make = () => new TimerController({ storage, clock: () => now, onCompleted })
  const c = make()
  return {
    c,
    storage,
    onCompleted,
    make,
    advance: (ms: number) => {
      now += ms
    },
    setNow: (t: number) => {
      now = t
    },
    get now() {
      return now
    },
  }
}

/** Simulates a live app: ticks on a short cadence so the heartbeat stays fresh. */
function runLive(h: ReturnType<typeof setup>, ms: number, step = 1000) {
  for (let t = 0; t < ms; t += step) {
    h.advance(step)
    h.c.tick()
  }
}

describe('TimerController', () => {
  beforeEach(() => vi.useRealTimers())
  afterEach(() => vi.restoreAllMocks())

  it('start, pause, resume, reset', () => {
    const h = setup()
    h.c.start()
    expect(h.c.getSnapshot().timer.status).toBe('running')
    runLive(h, 5 * MIN)
    h.c.pause()
    expect(h.c.getSnapshot().timer.status).toBe('paused')
    expect(h.c.getSnapshot().timer.remainingMs).toBe(20 * MIN)
    h.advance(10 * MIN)
    h.c.start()
    expect(h.c.getSnapshot().timer.status).toBe('running')
    runLive(h, MIN)
    h.c.reset()
    const t = h.c.getSnapshot().timer
    expect(t.status).toBe('idle')
    expect(t.remainingMs).toBe(25 * MIN)
  })

  it('completes once, records one session, fires one event', () => {
    const h = setup()
    h.c.setTopic('Convolution')
    h.c.start()
    runLive(h, 25 * MIN)
    // Many more ticks after completion must not duplicate anything.
    for (let i = 0; i < 20; i++) {
      h.advance(500)
      h.c.tick(true)
    }
    const snap = h.c.getSnapshot()
    expect(snap.timer.status).toBe('completed')
    expect(snap.log).toHaveLength(1)
    expect(snap.log[0]).toMatchObject({ outcome: 'completed', topic: 'Convolution', durationMs: 25 * MIN })
    expect(h.onCompleted).toHaveBeenCalledTimes(1)
    expect(loadLog(h.storage)).toHaveLength(1)
  })

  it('completes correctly after a single huge clock jump while the app was alive (throttled tab)', () => {
    const h = setup()
    h.c.start()
    h.advance(26 * MIN)
    h.c.tick()
    // The gap exceeds the away threshold, so this is treated as sleep: silent, but recorded.
    const snap = h.c.getSnapshot()
    expect(snap.timer.status).toBe('completed')
    expect(snap.log).toHaveLength(1)
    expect(h.onCompleted).not.toHaveBeenCalled()
  })

  it('background throttling (ticks only every 60s) still completes on time and with a signal', () => {
    const h = setup()
    h.c.start()
    runLive(h, 25 * MIN - 1000, 60_000 / 4) // up to just before the end, 15s steps
    h.advance(1000)
    h.c.tick()
    expect(h.c.getSnapshot().timer.status).toBe('completed')
    expect(h.onCompleted).toHaveBeenCalledTimes(1)
  })

  describe('refresh recovery', () => {
    it('restores a running session without sound and with the correct remaining time', () => {
      const h = setup()
      h.c.start()
      runLive(h, 10 * MIN)
      h.advance(20_000)
      const c2 = h.make()
      const snap = c2.getSnapshot()
      expect(snap.timer.status).toBe('running')
      expect(snap.now).toBe(h.now)
      expect(snap.timer.targetAt! - h.now).toBe(15 * MIN - 20_000)
      expect(snap.notice).toMatch(/welcome back/i)
      expect(h.onCompleted).not.toHaveBeenCalled()
    })

    it('restores a paused session as paused', () => {
      const h = setup()
      h.c.start()
      runLive(h, 3 * MIN)
      h.c.pause()
      h.advance(2 * 3600_000)
      const c2 = h.make()
      expect(c2.getSnapshot().timer.status).toBe('paused')
      expect(c2.getSnapshot().timer.remainingMs).toBe(22 * MIN)
    })

    it('a session that ended while closed completes silently, is recorded once, and does not auto-start', () => {
      const h = setup()
      h.c.updateSettings({ autoAdvance: true, sound: true })
      h.c.start()
      runLive(h, 5 * MIN)
      h.advance(2 * 3600_000)
      const c2 = h.make()
      const snap = c2.getSnapshot()
      expect(snap.timer.status).toBe('completed')
      expect(snap.timer.endedBy).toBe('away')
      expect(snap.log).toHaveLength(1)
      expect(snap.log[0].away).toBe(true)
      expect(snap.notice).toMatch(/closed/i)
      expect(h.onCompleted).not.toHaveBeenCalled()
      // A second reload must not record it again.
      const c3 = h.make()
      expect(c3.getSnapshot().log).toHaveLength(1)
      expect(c3.getSnapshot().timer.status).toBe('completed')
    })

    it('uses the finish time, not the reload time, for the log entry', () => {
      const h = setup()
      h.c.start()
      runLive(h, 5 * MIN)
      h.advance(5 * 3600_000)
      const log = h.make().getSnapshot().log
      expect(log[0].endedAt).toBe(T0 + 25 * MIN)
    })

    it('survives corrupt timer data', () => {
      const storage = memoryStorage()
      storage.setItem(KEYS.timer, '{{{')
      const h = setup(storage)
      expect(h.c.getSnapshot().timer.status).toBe('idle')
    })
  })

  describe('laptop sleep while the page stays loaded', () => {
    it('finishing during sleep is silent and does not auto-advance', () => {
      const h = setup()
      h.c.updateSettings({ autoAdvance: true, sound: true })
      h.c.start()
      runLive(h, 10 * MIN)
      h.advance(30 * MIN + AWAY_THRESHOLD_MS)
      h.c.tick(true)
      const snap = h.c.getSnapshot()
      expect(snap.timer.status).toBe('completed')
      expect(snap.timer.endedBy).toBe('away')
      expect(h.onCompleted).not.toHaveBeenCalled()
      expect(snap.log).toHaveLength(1)
      expect(snap.log[0].away).toBe(true)
    })

    it('waking before the end just carries on', () => {
      const h = setup()
      h.c.start()
      runLive(h, 10 * MIN)
      h.advance(5 * MIN)
      h.c.tick(true)
      const snap = h.c.getSnapshot()
      expect(snap.timer.status).toBe('running')
      expect(snap.timer.targetAt! - h.now).toBe(10 * MIN)
    })
  })

  describe('auto advance', () => {
    it('moves from focus to a running short break, but only when alive at the end', () => {
      const h = setup()
      h.c.updateSettings({ autoAdvance: true })
      h.c.start()
      runLive(h, 25 * MIN)
      const t = h.c.getSnapshot().timer
      expect(t.mode).toBe('short')
      expect(t.status).toBe('running')
      expect(h.c.getSnapshot().log).toHaveLength(1)
    })

    it('stops after the chain limit', () => {
      const h = setup()
      h.c.updateSettings({ autoAdvance: true, focusMin: 1, shortMin: 1, longMin: 1 })
      h.c.start()
      runLive(h, 20 * MIN)
      const t = h.c.getSnapshot().timer
      expect(t.status).toBe('completed')
    })
  })

  describe('abandoning a session', () => {
    it('reset after real progress logs an early entry', () => {
      const h = setup()
      h.c.start()
      runLive(h, 10 * MIN)
      h.c.reset()
      const log = h.c.getSnapshot().log
      expect(log).toHaveLength(1)
      expect(log[0]).toMatchObject({ outcome: 'early', durationMs: 10 * MIN })
      expect(statsForDay(log, h.now).sessions).toBe(0)
      expect(statsForDay(log, h.now).focusedMs).toBe(10 * MIN)
    })

    it('reset within the first minute logs nothing', () => {
      const h = setup()
      h.c.start()
      runLive(h, 30_000)
      h.c.reset()
      expect(h.c.getSnapshot().log).toHaveLength(0)
    })

    it('switching mode mid focus logs early and starts the new mode idle', () => {
      const h = setup()
      h.c.start()
      runLive(h, 5 * MIN)
      h.c.switchMode('long')
      const s = h.c.getSnapshot()
      expect(s.timer).toMatchObject({ mode: 'long', status: 'idle' })
      expect(s.timer.remainingMs).toBe(15 * MIN)
      expect(s.log[0].outcome).toBe('early')
    })

    it('switching to the same mode is a no-op', () => {
      const h = setup()
      h.c.start()
      runLive(h, 2 * MIN)
      const before = h.c.getSnapshot().timer
      h.c.switchMode('focus')
      expect(h.c.getSnapshot().timer).toBe(before)
    })
  })

  describe('after completion', () => {
    it('start moves into the suggested break', () => {
      const h = setup()
      h.c.start()
      runLive(h, 25 * MIN)
      h.c.start()
      expect(h.c.getSnapshot().timer).toMatchObject({ mode: 'short', status: 'running' })
    })

    it('the fourth focus session leads to a long break', () => {
      const h = setup()
      for (let i = 0; i < 4; i++) {
        h.c.switchMode('focus')
        h.c.start()
        runLive(h, 25 * MIN)
      }
      h.c.start()
      expect(h.c.getSnapshot().timer.mode).toBe('long')
    })

    it('finish returns to an idle focus session', () => {
      const h = setup()
      h.c.start()
      runLive(h, 25 * MIN)
      h.c.finish()
      expect(h.c.getSnapshot().timer).toMatchObject({ mode: 'focus', status: 'idle' })
    })
  })

  describe('persistence', () => {
    it('settings, topic and log survive a reload', () => {
      const h = setup()
      h.c.updateSettings({ focusMin: 50, dailyGoalMin: 180 })
      h.c.setTopic('Op-amps')
      h.c.start()
      runLive(h, 50 * MIN)
      const c2 = h.make()
      const snap = c2.getSnapshot()
      expect(snap.settings).toMatchObject({ focusMin: 50, dailyGoalMin: 180 })
      expect(snap.timer.topic).toBe('Op-amps')
      expect(snap.log).toHaveLength(1)
    })

    it('changing lengths while idle updates the displayed time, and while running does not', () => {
      const h = setup()
      h.c.updateSettings({ focusMin: 30 })
      expect(h.c.getSnapshot().timer.remainingMs).toBe(30 * MIN)
      h.c.start()
      h.c.updateSettings({ focusMin: 45 })
      expect(h.c.getSnapshot().timer.durationMs).toBe(30 * MIN)
    })

    it('keeps working when storage is unavailable', () => {
      const broken: StorageLike = {
        getItem: () => {
          throw new Error('no')
        },
        setItem: () => {
          throw new Error('no')
        },
        removeItem: () => {},
      }
      const h = setup(broken)
      h.c.start()
      runLive(h, 25 * MIN)
      expect(h.c.getSnapshot().timer.status).toBe('completed')
      expect(h.c.getSnapshot().log).toHaveLength(1)
    })

    it('clear removes all sessions but keeps settings', () => {
      const h = setup()
      h.c.updateSettings({ focusMin: 20 })
      h.c.start()
      runLive(h, 20 * MIN)
      h.c.clearLog()
      expect(h.c.getSnapshot().log).toHaveLength(0)
      expect(loadLog(h.storage)).toHaveLength(0)
      expect(h.c.getSnapshot().settings.focusMin).toBe(20)
    })

    it('review-next notes attach to an entry', () => {
      const h = setup()
      h.c.start()
      runLive(h, 25 * MIN)
      const id = h.c.getSnapshot().log[0].id
      h.c.setReviewNext(id, 'Redo problem 4')
      expect(h.c.getSnapshot().log[0].reviewNext).toBe('Redo problem 4')
      h.c.setReviewNext(id, '  ')
      expect(h.c.getSnapshot().log[0].reviewNext).toBeUndefined()
    })
  })

  describe('day boundary', () => {
    it('a session finishing after midnight counts toward the new day', () => {
      const late = new Date(2026, 4, 10, 23, 50, 0).getTime()
      const h = setup(memoryStorage(), late)
      h.c.start()
      runLive(h, 25 * MIN)
      const log = h.c.getSnapshot().log
      expect(statsForDay(log, h.now).sessions).toBe(1)
      expect(statsForDay(log, late).sessions).toBe(0)
    })
  })

  it('does not rewrite unchanged state on every tick', () => {
    const storage = memoryStorage()
    const spy = vi.spyOn(storage, 'setItem')
    const h = setup(storage)
    h.c.start()
    spy.mockClear()
    for (let i = 0; i < 40; i++) {
      h.advance(250)
      h.c.tick()
    }
    // Only heartbeats (every 5 s): 10 s of ticks means a couple of writes, not 40.
    expect(spy.mock.calls.length).toBeLessThanOrEqual(3)
  })

  it('uses sane defaults', () => {
    const h = setup()
    expect(h.c.getSnapshot().settings).toEqual(DEFAULT_SETTINGS)
    expect(h.c.getSnapshot().timer).toMatchObject({ mode: 'focus', status: 'idle' })
    expect(save(h.storage, 'x', 1)).toBe('1')
  })
})
