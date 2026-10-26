import { getAudioContext, resumeAudio } from './audio'

const SECONDS = 12
const FADE = 0.12
const MAX_GAIN = 0.5

/** A random walk with a leak, which is what gives brown noise its soft low rumble. */
function brownWalk(length: number): Float32Array {
  const out = new Float32Array(length)
  let last = 0
  for (let i = 0; i < length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02
    out[i] = last * 3.5
  }
  return out
}

/**
 * Brown noise that loops without a seam. The extra tail generated past the end
 * is blended into the start, so the last sample flows straight into the first.
 * Each channel gets its own noise, which sounds wide rather than centred.
 */
export function makeBrownNoise(ctx: BaseAudioContext, seconds = SECONDS): AudioBuffer {
  const rate = ctx.sampleRate
  const length = Math.round(seconds * rate)
  const fade = Math.round(FADE * seconds * rate)
  const buffer = ctx.createBuffer(2, length, rate)
  for (let ch = 0; ch < 2; ch++) {
    const raw = brownWalk(length + fade)
    const out = buffer.getChannelData(ch)
    out.set(raw.subarray(0, length))
    for (let i = 0; i < fade; i++) {
      const k = i / fade
      out[i] = out[i] * k + raw[length + i] * (1 - k)
    }
  }
  return buffer
}

interface Engine {
  source: AudioBufferSourceNode
  gain: GainNode
}

let engine: Engine | null = null
let buffer: AudioBuffer | null = null

export function noiseIsOn(): boolean {
  return engine !== null
}

/** Starts the noise. Must be called from a user gesture. Resolves false if audio is unavailable. */
export async function startNoise(volume: number): Promise<boolean> {
  if (engine) return true
  const ctx = await resumeAudio()
  if (!ctx || ctx.state !== 'running') return false
  if (!buffer || buffer.sampleRate !== ctx.sampleRate) buffer = makeBrownNoise(ctx)
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.loop = true
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 1400
  const gain = ctx.createGain()
  gain.gain.value = 0
  source.connect(filter).connect(gain).connect(ctx.destination)
  source.start()
  gain.gain.setTargetAtTime(Math.max(0, Math.min(1, volume)) * MAX_GAIN, ctx.currentTime, 0.4)
  engine = { source, gain }
  return true
}

export function setNoiseVolume(volume: number) {
  const ctx = getAudioContext()
  if (!engine || !ctx) return
  engine.gain.gain.setTargetAtTime(Math.max(0, Math.min(1, volume)) * MAX_GAIN, ctx.currentTime, 0.15)
}

/** Fades out, then releases the nodes. */
export function stopNoise() {
  const ctx = getAudioContext()
  const e = engine
  engine = null
  if (!e || !ctx) return
  e.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.2)
  window.setTimeout(() => {
    try {
      e.source.stop()
    } catch {
      // Already stopped.
    }
    e.source.disconnect()
    e.gain.disconnect()
  }, 1200)
}
