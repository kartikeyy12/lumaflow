import { describe, expect, it } from 'vitest'
import { SCENE_IDS } from './storage'
import { BEATS, BEAT_CARRIER_HZ, MATCHED_AMBIENT, beatLabel, beatTones, hasSound, resolveAmbient } from './sounds'

describe('choosing the sound', () => {
  it('uses an explicit choice as it is', () => {
    expect(resolveAmbient('rain', 'drift')).toBe('rain')
    expect(resolveAmbient('storm', 'still')).toBe('storm')
    expect(resolveAmbient('none', 'drift')).toBeNull()
  })

  it('follows the background when asked, and every background has a sound', () => {
    for (const scene of SCENE_IDS) {
      expect(MATCHED_AMBIENT[scene], scene).toBeDefined()
      expect(resolveAmbient('match', scene)).toBe(MATCHED_AMBIENT[scene])
    }
    expect(resolveAmbient('match', 'drift')).not.toBe(resolveAmbient('match', 'aurora'))
  })

  it('knows when there is nothing to play', () => {
    expect(hasSound({ ambient: 'none', beat: 'off', scene: 'ribbon' })).toBe(false)
    expect(hasSound({ ambient: 'none', beat: 'alpha', scene: 'ribbon' })).toBe(true)
    expect(hasSound({ ambient: 'rain', beat: 'off', scene: 'ribbon' })).toBe(true)
    expect(hasSound({ ambient: 'match', beat: 'off', scene: 'still' })).toBe(true)
  })
})

describe('binaural beats', () => {
  it('offers the usual bands at their usual rates', () => {
    expect(BEATS.map((b) => [b.id, b.hz])).toEqual([
      ['theta', 6],
      ['alpha', 10],
      ['beta', 15],
      ['gamma', 40],
    ])
  })

  it('gives each ear one tone so that the difference is the beat rate', () => {
    for (const b of BEATS) {
      const t = beatTones(b.id)
      expect(t).not.toBeNull()
      expect(t!.left).toBe(BEAT_CARRIER_HZ)
      expect(t!.right - t!.left).toBe(b.hz)
      expect(t!.beat).toBe(b.hz)
    }
  })

  it('keeps both tones in a comfortable range', () => {
    for (const b of BEATS) {
      const t = beatTones(b.id)!
      expect(t.left).toBeGreaterThanOrEqual(100)
      expect(t.right).toBeLessThanOrEqual(400)
    }
  })

  it('is silent when off', () => {
    expect(beatTones('off')).toBeNull()
  })

  it('has readable labels', () => {
    expect(beatLabel(BEATS[3])).toBe('Gamma, 40 Hz (fast)')
  })
})
