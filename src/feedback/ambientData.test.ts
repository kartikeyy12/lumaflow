import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../flow/scene'
import { brownLoop, dropsLoop, loopable, thunderBurst, whiteLoop } from './ambientData'

const RATE = 8000
const rms = (a: Float32Array, from = 0, to = a.length) => {
  let s = 0
  for (let i = from; i < to; i++) s += a[i] * a[i]
  return Math.sqrt(s / (to - from))
}
const peak = (a: Float32Array) => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
const finite = (a: Float32Array) => a.every((v) => Number.isFinite(v))

describe('loop generators', () => {
  const length = RATE * 4
  const fade = Math.round(length * 0.15)

  it('make the right length, finite, and within range', () => {
    for (const make of [brownLoop, whiteLoop, (l: number, f: number, r: () => number) => dropsLoop(l, f, RATE, r)]) {
      const out = make(length, fade, mulberry32(1))
      expect(out).toHaveLength(length)
      expect(finite(out)).toBe(true)
      expect(peak(out)).toBeLessThanOrEqual(1)
      expect(peak(out)).toBeGreaterThan(0)
    }
  })

  it('give the same sound for the same seed', () => {
    expect(brownLoop(1000, 100, mulberry32(9))).toEqual(brownLoop(1000, 100, mulberry32(9)))
    expect(brownLoop(1000, 100, mulberry32(9))).not.toEqual(brownLoop(1000, 100, mulberry32(10)))
  })

  it('brown noise joins up with no jump at the loop point', () => {
    const out = brownLoop(length, fade, mulberry32(3))
    let steps = 0
    for (let i = 1; i < out.length; i++) steps = Math.max(steps, Math.abs(out[i] - out[i - 1]))
    expect(Math.abs(out[out.length - 1] - out[0])).toBeLessThanOrEqual(steps * 1.5)
  })

  it('keeps the level steady through the blended start', () => {
    const out = whiteLoop(length, fade, mulberry32(4))
    const whole = rms(out)
    expect(rms(out, 0, fade)).toBeGreaterThan(whole * 0.8)
    expect(rms(out, 0, fade)).toBeLessThan(whole * 1.2)
  })

  it('drops are sparse: mostly quiet with short bursts', () => {
    const out = dropsLoop(length, fade, RATE, mulberry32(5))
    const quiet = out.filter((v) => Math.abs(v) < 0.02).length / out.length
    expect(quiet).toBeGreaterThan(0.3)
    expect(peak(out)).toBeGreaterThan(0.3)
  })

  it('loopable blends the tail into the head', () => {
    const raw = new Float32Array([1, 1, 1, 1, 0.5, 0.5])
    const out = loopable(raw, 4, 2)
    expect(out).toHaveLength(4)
    expect(out[0]).toBeCloseTo(0.5, 5)
    expect(out[3]).toBe(1)
  })
})

describe('thunder', () => {
  const length = RATE * 9

  it('starts and ends in silence so it never clicks', () => {
    const out = thunderBurst(length, RATE, mulberry32(2))
    expect(Math.abs(out[0])).toBeLessThan(0.01)
    expect(Math.abs(out[out.length - 1])).toBeLessThan(0.01)
    expect(finite(out)).toBe(true)
  })

  it('is normalised below full scale and has real energy', () => {
    const out = thunderBurst(length, RATE, mulberry32(6))
    expect(peak(out)).toBeLessThanOrEqual(0.9001)
    expect(peak(out)).toBeGreaterThan(0.85)
    expect(rms(out)).toBeGreaterThan(0.02)
  })

  it('fades away: the last second is far quieter than the loudest part', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const out = thunderBurst(length, RATE, mulberry32(seed))
      let loudest = 0
      for (let i = 0; i + RATE <= length; i += RATE / 2) loudest = Math.max(loudest, rms(out, i, i + RATE))
      expect(rms(out, length - RATE, length)).toBeLessThan(loudest * 0.4)
    }
  })

  it('differs from one roll to the next', () => {
    expect(thunderBurst(RATE * 3, RATE, mulberry32(1))).not.toEqual(thunderBurst(RATE * 3, RATE, mulberry32(2)))
  })
})
