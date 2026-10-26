let ctx: AudioContext | null = null

/** One shared context for the chime and the noise. Created on first use. */
export function getAudioContext(): AudioContext | null {
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
 * key handler so sound can start later without another interaction.
 */
export function unlockAudio() {
  const c = getAudioContext()
  if (c && c.state === 'suspended') void c.resume().catch(() => {})
}

export async function resumeAudio(): Promise<AudioContext | null> {
  const c = getAudioContext()
  if (!c) return null
  try {
    if (c.state === 'suspended') await c.resume()
  } catch {
    return null
  }
  return c
}
