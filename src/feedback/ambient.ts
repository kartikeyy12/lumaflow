import type { AmbientId } from '../core/types'
import { getAudioContext, resumeAudio } from './audio'
import { brownLoop, dropsLoop, thunderBurst, whiteLoop } from './ambientData'

export const AMBIENTS: Array<{ id: AmbientId; label: string; note: string }> = [
  { id: 'brown', label: 'Brown noise', note: 'A soft low rumble' },
  { id: 'rain', label: 'Rain', note: 'Steady rain on a roof' },
  { id: 'storm', label: 'Thunderstorm', note: 'Rain with distant thunder' },
]

const LOOP_SECONDS = 12
const FADE_FRACTION = 0.12
const THUNDER_SECONDS = 11
const MAX_GAIN = 0.5

type LoopKind = 'brown' | 'white' | 'drops'

interface Engine {
  kind: AmbientId
  master: GainNode
  sources: AudioScheduledSourceNode[]
  nodes: AudioNode[]
  timer: number | null
}

let engine: Engine | null = null
/** Bumped by every start and stop, so a start that was overtaken while waiting for audio gives up. */
let generation = 0
let cache: { rate: number; bufs: Partial<Record<LoopKind, AudioBuffer>> } | null = null

function toBuffer(ctx: BaseAudioContext, left: Float32Array, right: Float32Array): AudioBuffer {
  const b = ctx.createBuffer(2, left.length, ctx.sampleRate)
  b.copyToChannel(left as Float32Array<ArrayBuffer>, 0)
  b.copyToChannel(right as Float32Array<ArrayBuffer>, 1)
  return b
}

/** Loop buffers are made once per sample rate. Each channel gets its own noise, which sounds wide rather than centred. */
function loopBuffer(ctx: BaseAudioContext, kind: LoopKind): AudioBuffer {
  if (!cache || cache.rate !== ctx.sampleRate) cache = { rate: ctx.sampleRate, bufs: {} }
  const hit = cache.bufs[kind]
  if (hit) return hit
  const rate = ctx.sampleRate
  const length = Math.round(LOOP_SECONDS * rate)
  const fade = Math.round(LOOP_SECONDS * FADE_FRACTION * rate)
  const make = () =>
    kind === 'brown' ? brownLoop(length, fade) : kind === 'white' ? whiteLoop(length, fade) : dropsLoop(length, fade, rate)
  const buf = toBuffer(ctx, make(), make())
  cache.bufs[kind] = buf
  return buf
}

interface Layer {
  buffer: LoopKind
  filters: Array<{ type: BiquadFilterType; frequency: number; Q?: number }>
  gain: number
}

const LAYERS: Record<AmbientId, Layer[]> = {
  brown: [{ buffer: 'brown', filters: [{ type: 'lowpass', frequency: 1400 }], gain: 1 }],
  rain: [
    // The steady wash, the low roar underneath it, and the individual drops.
    {
      buffer: 'white',
      filters: [
        { type: 'highpass', frequency: 700 },
        { type: 'lowpass', frequency: 7500 },
      ],
      gain: 0.3,
    },
    { buffer: 'brown', filters: [{ type: 'lowpass', frequency: 380 }], gain: 0.55 },
    { buffer: 'drops', filters: [{ type: 'bandpass', frequency: 3200, Q: 0.8 }], gain: 1.8 },
  ],
  storm: [],
}
LAYERS.storm = LAYERS.rain

function addLoop(ctx: AudioContext, e: Engine, layer: Layer) {
  const source = ctx.createBufferSource()
  source.buffer = loopBuffer(ctx, layer.buffer)
  source.loop = true
  let tail: AudioNode = source
  e.nodes.push(source)
  for (const f of layer.filters) {
    const node = ctx.createBiquadFilter()
    node.type = f.type
    node.frequency.value = f.frequency
    if (f.Q) node.Q.value = f.Q
    tail.connect(node)
    tail = node
    e.nodes.push(node)
  }
  const gain = ctx.createGain()
  gain.gain.value = layer.gain
  tail.connect(gain).connect(e.master)
  e.nodes.push(gain)
  source.start(ctx.currentTime, Math.random() * LOOP_SECONDS)
  e.sources.push(source)
}

/** One roll of thunder, played now. It fades out on its own and removes itself. */
function rollThunder(ctx: AudioContext, e: Engine) {
  const rate = ctx.sampleRate
  const length = Math.round(THUNDER_SECONDS * rate)
  const source = ctx.createBufferSource()
  source.buffer = toBuffer(ctx, thunderBurst(length, rate), thunderBurst(length, rate))
  const low = ctx.createBiquadFilter()
  low.type = 'lowpass'
  // Starts with a little more bite, then settles into a deep rumble.
  low.frequency.setValueAtTime(520, ctx.currentTime)
  low.frequency.exponentialRampToValueAtTime(130, ctx.currentTime + THUNDER_SECONDS * 0.8)
  const gain = ctx.createGain()
  // Thunder should rise above the rain, so it sits a little louder than the wash.
  gain.gain.value = 0.9 + Math.random() * 0.7
  source.connect(low).connect(gain)
  let tail: AudioNode = gain
  if (typeof ctx.createStereoPanner === 'function') {
    const pan = ctx.createStereoPanner()
    pan.pan.value = Math.random() * 1.2 - 0.6
    gain.connect(pan)
    tail = pan
  }
  tail.connect(e.master)
  source.start()
  e.sources.push(source)
  source.onended = () => {
    e.sources = e.sources.filter((s) => s !== source)
    source.disconnect()
    low.disconnect()
    gain.disconnect()
    tail.disconnect()
  }
}

/** The first roll comes soon enough to be noticed, the rest are well spaced. */
function scheduleThunder(ctx: AudioContext, e: Engine, first: boolean) {
  const wait = first ? 5000 + Math.random() * 7000 : 20000 + Math.random() * 35000
  e.timer = window.setTimeout(() => {
    if (engine !== e) return
    rollThunder(ctx, e)
    scheduleThunder(ctx, e, false)
  }, wait)
}

const level = (volume: number) => Math.max(0, Math.min(1, volume)) * MAX_GAIN

export function ambientIsOn(): boolean {
  return engine !== null
}

export function ambientKind(): AmbientId | null {
  return engine ? engine.kind : null
}

/** Starts a sound. Must be called from a user gesture. Resolves false if audio is unavailable. */
export async function startAmbient(kind: AmbientId, volume: number): Promise<boolean> {
  if (engine) return true
  const mine = ++generation
  const ctx = await resumeAudio()
  if (mine !== generation || engine) return engine !== null
  if (!ctx || ctx.state !== 'running') return false
  const master = ctx.createGain()
  master.gain.value = 0
  // A gentle limiter so overlapping layers and thunder never clip.
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -14
  limiter.knee.value = 18
  limiter.ratio.value = 3
  limiter.attack.value = 0.01
  limiter.release.value = 0.4
  master.connect(limiter).connect(ctx.destination)
  const e: Engine = { kind, master, sources: [], nodes: [master, limiter], timer: null }
  for (const layer of LAYERS[kind]) addLoop(ctx, e, layer)
  if (kind === 'storm') scheduleThunder(ctx, e, true)
  master.gain.setTargetAtTime(level(volume), ctx.currentTime, 0.4)
  engine = e
  return true
}

export function setAmbientVolume(volume: number) {
  const ctx = getAudioContext()
  if (!engine || !ctx) return
  engine.master.gain.setTargetAtTime(level(volume), ctx.currentTime, 0.15)
}

/** Fades out, then releases everything. */
export function stopAmbient() {
  const ctx = getAudioContext()
  const e = engine
  engine = null
  generation++
  if (!e) return
  if (e.timer !== null) window.clearTimeout(e.timer)
  if (ctx) e.master.gain.setTargetAtTime(0, ctx.currentTime, 0.2)
  window.setTimeout(() => {
    for (const s of e.sources) {
      s.onended = null
      try {
        s.stop()
      } catch {
        // Already stopped.
      }
    }
    for (const n of e.nodes) n.disconnect()
  }, 1200)
}
