import type { AmbientId, BeatId, SceneId, Settings } from './types'

export type Ambient = 'brown' | 'rain' | 'storm'

/** What each background sounds like when the sound is set to follow it. */
export const MATCHED_AMBIENT: Record<SceneId, Ambient> = {
  ribbon: 'brown',
  nebula: 'brown',
  aurora: 'rain',
  ripples: 'rain',
  drift: 'storm',
  still: 'brown',
}

/** The sound to play for a setting, or null for none. */
export function resolveAmbient(ambient: AmbientId, scene: SceneId): Ambient | null {
  if (ambient === 'none') return null
  if (ambient === 'match') return MATCHED_AMBIENT[scene]
  return ambient
}

export interface BeatInfo {
  id: Exclude<BeatId, 'off'>
  label: string
  /** Difference between the two ears, in Hz. */
  hz: number
  note: string
}

export const BEATS: BeatInfo[] = [
  { id: 'theta', label: 'Theta', hz: 6, note: 'Slow' },
  { id: 'alpha', label: 'Alpha', hz: 10, note: 'Calm' },
  { id: 'beta', label: 'Beta', hz: 15, note: 'Alert' },
  { id: 'gamma', label: 'Gamma', hz: 40, note: 'Fast' },
]

/** Pitch heard in the left ear. The right ear gets this plus the beat rate. */
export const BEAT_CARRIER_HZ = 220

/** The two tones for a binaural beat, or null when it is off. Each ear gets one, and the brain hears the difference. */
export function beatTones(beat: BeatId, carrier = BEAT_CARRIER_HZ): { left: number; right: number; beat: number } | null {
  const info = BEATS.find((b) => b.id === beat)
  if (!info) return null
  return { left: carrier, right: carrier + info.hz, beat: info.hz }
}

export const beatLabel = (b: BeatInfo) => `${b.label}, ${b.hz} Hz (${b.note.toLowerCase()})`

/** Whether the sound button has anything to play with these settings. */
export function hasSound(s: Pick<Settings, 'ambient' | 'beat' | 'scene'>): boolean {
  return resolveAmbient(s.ambient, s.scene) !== null || beatTones(s.beat) !== null
}
