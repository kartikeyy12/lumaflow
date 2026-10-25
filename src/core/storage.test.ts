import { describe, expect, it } from 'vitest'
import { KEYS, loadLog, loadSettings, loadTimer, memoryStorage, sanitizeSettings, sanitizeTimer, save } from './storage'
import { DEFAULT_SETTINGS, createPhase, start } from './timer'

describe('settings', () => {
  it('falls back to defaults for missing or corrupt data', () => {
    const s = memoryStorage()
    expect(loadSettings(s)).toEqual(DEFAULT_SETTINGS)
    s.setItem(KEYS.settings, '{not json')
    expect(loadSettings(s)).toEqual(DEFAULT_SETTINGS)
  })

  it('clamps out-of-range and wrongly typed values', () => {
    const out = sanitizeSettings({ focusMin: 9999, shortMin: -4, longMin: 'x', autoAdvance: 'yes', volume: 5 })
    expect(out.focusMin).toBe(180)
    expect(out.shortMin).toBe(1)
    expect(out.longMin).toBe(DEFAULT_SETTINGS.longMin)
    expect(out.autoAdvance).toBe(false)
    expect(out.volume).toBe(1)
  })

  it('round-trips', () => {
    const s = memoryStorage()
    const custom = { ...DEFAULT_SETTINGS, focusMin: 50, dailyGoalMin: 240, sound: true }
    save(s, KEYS.settings, custom)
    expect(loadSettings(s)).toEqual(custom)
  })
})

describe('timer state', () => {
  it('round-trips a running phase', () => {
    const s = memoryStorage()
    const t = start(createPhase('focus', DEFAULT_SETTINGS, 1000), 1000)
    save(s, KEYS.timer, t)
    expect(loadTimer(s)).toEqual(t)
  })

  it('rejects malformed states', () => {
    expect(sanitizeTimer(null)).toBeNull()
    expect(sanitizeTimer({})).toBeNull()
    expect(sanitizeTimer({ mode: 'focus', status: 'running', durationMs: 1000, phaseId: 'x' })).toBeNull()
    expect(sanitizeTimer({ mode: 'nope', status: 'idle', durationMs: 1000, phaseId: 'x' })).toBeNull()
    expect(sanitizeTimer({ mode: 'focus', status: 'idle', durationMs: -5, phaseId: 'x' })).toBeNull()
  })
})

describe('log', () => {
  it('drops invalid and duplicate entries, sorts newest first', () => {
    const s = memoryStorage()
    const good = (id: string, endedAt: number) => ({ id, endedAt, durationMs: 60_000, plannedMs: 60_000, outcome: 'completed', topic: '' })
    save(s, KEYS.log, [good('a', 1), good('b', 3), good('a', 2), { id: 'c' }, 'junk', { ...good('d', 4), outcome: 'weird' }])
    expect(loadLog(s).map((e) => e.id)).toEqual(['b', 'a'])
  })

  it('survives storage that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => {},
    }
    expect(loadLog(broken)).toEqual([])
    expect(loadSettings(broken)).toEqual(DEFAULT_SETTINGS)
    expect(save(broken, KEYS.log, [])).toBeNull()
  })
})
