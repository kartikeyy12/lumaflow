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

/** True once the person has clicked, tapped or pressed a key on this page. Before that, browsers refuse to start audio. */
export function audioAllowed(): boolean {
  const ua = (navigator as unknown as { userActivation?: { hasBeenActive: boolean } }).userActivation
  return ua ? ua.hasBeenActive : true
}

/**
 * Returns a running context, or null if audio cannot start yet. It never waits on a
 * blocked context: some browsers leave resume() pending forever until a gesture.
 */
export async function resumeAudio(): Promise<AudioContext | null> {
  if (!audioAllowed()) return null
  const c = getAudioContext()
  if (!c) return null
  try {
    if (c.state === 'suspended') {
      await Promise.race([c.resume(), new Promise<void>((done) => window.setTimeout(done, 600))])
    }
  } catch {
    return null
  }
  return c.state === 'running' ? c : null
}
