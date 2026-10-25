let ctx: AudioContext | null = null

function getContext(): AudioContext | null {
  if (ctx) return ctx
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  try {
    ctx = new Ctor()
  } catch {
    ctx = null
  }
  return ctx
}

/**
 * Browsers only allow audio after a user gesture. Call this from a click or
 * key handler (starting the timer) so the chime can play later on its own.
 */
export function unlockAudio() {
  const c = getContext()
  if (c && c.state === 'suspended') void c.resume().catch(() => {})
}

/** A soft two-note chime. Short, low volume, no sharp attack. */
export function playChime(volume: number) {
  const c = getContext()
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
  const c = getContext()
  if (!c) return
  try {
    if (c.state === 'suspended') await c.resume()
  } catch {
    return
  }
  playChime(volume)
}
