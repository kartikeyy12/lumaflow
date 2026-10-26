import { getAudioContext, resumeAudio } from './audio'

export { unlockAudio } from './audio'

/** A soft two-note chime. Short, low volume, no sharp attack. */
export function playChime(volume: number) {
  const c = getAudioContext()
  if (!c || c.state !== 'running') return
  const vol = Math.min(1, Math.max(0, volume)) * 0.35
  if (vol <= 0) return
  const t0 = c.currentTime + 0.02
  const notes: Array<[number, number]> = [
    [523.25, 0],
    [783.99, 0.28],
  ]
  for (const [freq, offset] of notes) {
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    const t = t0 + offset
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.08)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.6)
    osc.connect(gain).connect(c.destination)
    osc.start(t)
    osc.stop(t + 1.7)
  }
}

/** Plays the chime from a user gesture, waiting for the audio context to wake. */
export async function previewChime(volume: number) {
  if (await resumeAudio()) playChime(volume)
}
