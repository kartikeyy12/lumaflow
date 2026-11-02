import { describe, expect, it } from 'vitest'
import { TimerController } from './controller'
import { statsForDay } from './stats'
import { KEYS, loadLog, memoryStorage, type StorageLike } from './storage'
import { swElapsed } from './stopwatch'

const MIN = 60_000
const T0 = new Date(2026, 4, 10, 9, 0, 0).getTime()

function setup(storage: StorageLike = memoryStorage(), startAt = T0) {
  let now = startAt
  const make = () => new TimerController({ storage, clock: () => now })
  return {
    c: make(),
    storage,
    make,
    advance: (ms: number) => {
      now += ms
    },
    get now() {
      return now
    },
  }
}

type H = ReturnType<typeof setup>

/** A live app ticking every second, so the heartbeat stays fresh. */
function runLive(h: H, ms: number, step = 1000) {
  for (let t = 0; t < ms; t += step) {
    h.advance(step)
    h.c.tick()
  }
}

describe('stopwatch in the controller', () => {
  it('switches view, runs, pauses and resumes', () => {
    const h = setup()
    expect(h.c.getSnapshot().view).toBe('timer')
    h.c.switchToStopwatch()
    expect(h.c.getSnapshot().view).toBe('stopwatch')
    h.c.start()
    runLive(h, 5 * MIN)
    h.c.pause()
    const paused = h.c.getSnapshot()
    expect(paused.stopwatch.status).toBe('paused')
    expect(swElapsed(paused.stopwatch, h.now)).toBe(5 * MIN)
    h.advance(20 * MIN)
    h.c.start()
    runLive(h, 2 * MIN)
    expect(swElapsed(h.c.getSnapshot().stopwatch, h.now)).toBe(7 * MIN)
  })

  it('toggle drives whichever view is active', () => {
    const h = setup()
    h.c.switchToStopwatch()
    h.c.toggle()
    expect(h.c.getSnapshot().stopwatch.status).toBe('running')
    expect(h.c.getSnapshot().timer.status).toBe('idle')
    h.c.toggle()
    expect(h.c.getSnapshot().stopwatch.status).toBe('paused')
  })

  it('finish saves one history entry with the topic and returns to zero', () => {
    const h = setup()
    h.c.setTopic('Signals revision')
    h.c.switchToStopwatch()
    h.c.start()
    runLive(h, 33 * MIN)
    h.c.reset()
    const s = h.c.getSnapshot()
    expect(s.stopwatch.status).toBe('idle')
    expect(s.stopwatch.elapsedMs).toBe(0)
    expect(s.log).toHaveLength(1)
    expect(s.log[0]).toMatchObject({ stopwatch: true, topic: 'Signals revision', durationMs: 33 * MIN, outcome: 'completed' })
    expect(loadLog(h.storage)).toHaveLength(1)
  })

  it('counts a stopwatch run in the day totals', () => {
    const h = setup()
    h.c.switchToStopwatch()
    h.c.start()
    runLive(h, 40 * MIN)
    h.c.reset()
    const today = statsForDay(h.c.getSnapshot().log, h.now)
    expect(today.sessions).toBe(1)
    expect(today.focusedMs).toBe(40 * MIN)
  })

  it('does not save a run under a minute, and says so', () => {
    const h = setup()
    h.c.switchToStopwatch()
    h.c.start()
    runLive(h, 20_000)
    h.c.reset()
    const s = h.c.getSnapshot()
    expect(s.log).toHaveLength(0)
    expect(s.notice).toMatch(/under a minute/i)
    expect(s.stopwatch.status).toBe('idle')
  })

  it('finishing an idle stopwatch does nothing', () => {
    const h = setup()
    h.c.switchToStopwatch()
    h.c.reset()
    expect(h.c.getSnapshot().log).toHaveLength(0)
    expect(h.c.getSnapshot().notice).toBeNull()
  })

  it('leaving for a timer mode saves the run first', () => {
    const h = setup()
    h.c.switchToStopwatch()
    h.c.start()
    runLive(h, 12 * MIN)
    h.c.switchMode('short')
    const s = h.c.getSnapshot()
    expect(s.view).toBe('timer')
    expect(s.timer).toMatchObject({ mode: 'short', status: 'idle' })
    expect(s.log).toHaveLength(1)
    expect(s.log[0].durationMs).toBe(12 * MIN)
    expect(s.stopwatch.status).toBe('idle')
  })

  it('moving to the stopwatch ends a running focus session early', () => {
    const h = setup()
    h.c.start()
    runLive(h, 10 * MIN)
    h.c.switchToStopwatch()
    const s = h.c.getSnapshot()
    expect(s.timer.status).toBe('idle')
    expect(s.log).toHaveLength(1)
    expect(s.log[0]).toMatchObject({ outcome: 'early', durationMs: 10 * MIN })
    expect(s.log[0].stopwatch).toBeUndefined()
  })

  it('never has both tools running at once', () => {
    const h = setup()
    h.c.start()
    runLive(h, 2 * MIN)
    h.c.switchToStopwatch()
    h.c.start()
    runLive(h, 2 * MIN)
    let s = h.c.getSnapshot()
    expect([s.timer.status, s.stopwatch.status].filter((x) => x === 'running')).toHaveLength(1)
    h.c.switchMode('focus')
    h.c.start()
    s = h.c.getSnapshot()
    expect(s.timer.status).toBe('running')
    expect(s.stopwatch.status).toBe('idle')
  })

  describe('reload and sleep', () => {
    it('a brief reload keeps counting and says so', () => {
      const h = setup()
      h.c.switchToStopwatch()
      h.c.start()
      runLive(h, 10 * MIN)
      h.advance(20_000)
      const c2 = h.make()
      const s = c2.getSnapshot()
      expect(s.view).toBe('stopwatch')
      expect(s.stopwatch.status).toBe('running')
      expect(swElapsed(s.stopwatch, h.now)).toBe(10 * MIN + 20_000)
      expect(s.notice).toMatch(/welcome back/i)
    })

    it('a long absence pauses at the last heartbeat instead of counting the gap', () => {
      const h = setup()
      h.c.switchToStopwatch()
      h.c.start()
      runLive(h, 15 * MIN)
      h.advance(6 * 60 * MIN)
      const s = h.make().getSnapshot()
      expect(s.stopwatch.status).toBe('paused')
      expect(swElapsed(s.stopwatch, h.now)).toBe(15 * MIN)
      expect(s.notice).toMatch(/not counted/i)
    })

    it('a paused stopwatch comes back paused', () => {
      const h = setup()
      h.c.switchToStopwatch()
      h.c.start()
      runLive(h, 4 * MIN)
      h.c.pause()
      h.advance(3 * 60 * MIN)
      const s = h.make().getSnapshot()
      expect(s.stopwatch.status).toBe('paused')
      expect(swElapsed(s.stopwatch, h.now)).toBe(4 * MIN)
    })

    it('laptop sleep with the page still loaded pauses it too', () => {
      const h = setup()
      h.c.switchToStopwatch()
      h.c.start()
      runLive(h, 8 * MIN)
      h.advance(2 * 60 * MIN)
      h.c.tick(true)
      const s = h.c.getSnapshot()
      expect(s.stopwatch.status).toBe('paused')
      expect(swElapsed(s.stopwatch, h.now)).toBe(8 * MIN)
    })

    it('finishing after an away pause saves only the counted time', () => {
      const h = setup()
      h.c.switchToStopwatch()
      h.c.start()
      runLive(h, 25 * MIN)
      h.advance(5 * 60 * MIN)
      h.c.tick(true)
      h.c.reset()
      expect(h.c.getSnapshot().log[0].durationMs).toBe(25 * MIN)
    })

    it('survives corrupt stopwatch data', () => {
      const storage = memoryStorage()
      storage.setItem(KEYS.stopwatch, '{"status":"running"}')
      storage.setItem(KEYS.view, '"stopwatch"')
      const s = setup(storage).c.getSnapshot()
      expect(s.stopwatch.status).toBe('idle')
      expect(s.view).toBe('stopwatch')
    })

    it('the chosen view survives a reload', () => {
      const h = setup()
      h.c.switchToStopwatch()
      expect(h.make().getSnapshot().view).toBe('stopwatch')
      h.c.switchMode('focus')
      expect(h.make().getSnapshot().view).toBe('timer')
    })
  })
})

describe('background setting', () => {
  it('is saved and restored', () => {
    const h = setup()
    h.c.updateSettings({ scene: 'aurora' })
    expect(h.make().getSnapshot().settings.scene).toBe('aurora')
  })

  it('falls back to the default for an unknown value', () => {
    const storage = memoryStorage()
    storage.setItem(KEYS.settings, JSON.stringify({ scene: 'lava' }))
    expect(setup(storage).c.getSnapshot().settings.scene).toBe('ribbon')
  })

  it('does not touch a session that is running', () => {
    const h = setup()
    h.c.start()
    runLive(h, 3 * MIN)
    h.c.updateSettings({ scene: 'drift', noiseVolume: 0.8 })
    const s = h.c.getSnapshot()
    expect(s.timer.status).toBe('running')
    expect(s.settings).toMatchObject({ scene: 'drift', noiseVolume: 0.8 })
  })
})

describe('start fresh', () => {
  it('clears history, the session and the stopwatch, and keeps settings', () => {
    const h = setup()
    h.c.updateSettings({ focusMin: 40, dailyGoalMin: 120 })
    h.c.setTopic('Signals')
    h.c.start()
    runLive(h, 40 * MIN + 5000)
    expect(h.c.getSnapshot().log).toHaveLength(1)
    h.c.switchToStopwatch()
    h.c.start()
    runLive(h, 3 * MIN)
    h.c.startFresh()
    const s = h.c.getSnapshot()
    expect(s.log).toHaveLength(0)
    expect(s.view).toBe('timer')
    expect(s.timer).toMatchObject({ mode: 'focus', status: 'idle', cycle: 0, topic: '' })
    expect(s.stopwatch.status).toBe('idle')
    expect(s.settings).toMatchObject({ focusMin: 40, dailyGoalMin: 120 })
    expect(statsForDay(s.log, h.now).sessions).toBe(0)
  })

  it('can put settings back to their defaults too', () => {
    const h = setup()
    h.c.updateSettings({ focusMin: 40, dailyGoalMin: 120, scene: 'drift' })
    h.c.startFresh({ settings: true })
    expect(h.c.getSnapshot().settings).toMatchObject({ focusMin: 25, dailyGoalMin: 0, scene: 'ribbon' })
  })

  it('is saved, so a reload stays at zero', () => {
    const h = setup()
    h.c.start()
    runLive(h, 25 * MIN + 5000)
    h.c.startFresh()
    const s = h.make().getSnapshot()
    expect(s.log).toHaveLength(0)
    expect(s.timer.status).toBe('idle')
    expect(loadLog(h.storage)).toHaveLength(0)
  })
})
