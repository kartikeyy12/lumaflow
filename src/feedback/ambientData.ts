// Sample generators for the ambient sounds. Plain Float32Array in, plain
// Float32Array out, so they can be tested without any audio hardware.

export type Rnd = () => number

/**
 * Turns `length + fade` raw samples into a loop with no seam. The extra tail is
 * blended into the start with an equal-power curve, so the last sample flows
 * into the first and the level does not dip at the join.
 */
export function loopable(raw: Float32Array, length: number, fade: number): Float32Array {
  const out = raw.slice(0, length)
  for (let i = 0; i < fade; i++) {
    const k = (i / fade) * (Math.PI / 2)
    const v = out[i] * Math.sin(k) + raw[length + i] * Math.cos(k)
    out[i] = v > 1 ? 1 : v < -1 ? -1 : v
  }
  return out
}

const clip = (v: number) => (v > 1 ? 1 : v < -1 ? -1 : v)

/** A random walk with a leak, which is what gives brown noise its soft low rumble. */
export function brownLoop(length: number, fade: number, rnd: Rnd = Math.random): Float32Array {
  const raw = new Float32Array(length + fade)
  let last = 0
  for (let i = 0; i < raw.length; i++) {
    last = (last + 0.02 * (rnd() * 2 - 1)) / 1.02
    raw[i] = clip(last * 3.5)
  }
  return loopable(raw, length, fade)
}

export function whiteLoop(length: number, fade: number, rnd: Rnd = Math.random): Float32Array {
  const raw = new Float32Array(length + fade)
  for (let i = 0; i < raw.length; i++) raw[i] = rnd() * 2 - 1
  return loopable(raw, length, fade)
}

/**
 * Sparse, short noise bursts at random moments: the individual drops on top of
 * the steady wash of rain. Most are quiet and a few are sharper.
 */
export function dropsLoop(length: number, fade: number, rate: number, rnd: Rnd = Math.random, perSecond = 80): Float32Array {
  const total = length + fade
  const raw = new Float32Array(total)
  const count = Math.round((total / rate) * perSecond)
  for (let n = 0; n < count; n++) {
    const pos = Math.floor(rnd() * total)
    const amp = 0.2 + 0.8 * rnd() * rnd()
    const tau = (0.0007 + 0.0017 * rnd()) * rate
    const len = Math.ceil(tau * 5)
    for (let k = 0; k < len && pos + k < total; k++) {
      raw[pos + k] += amp * (rnd() * 2 - 1) * Math.exp(-k / tau)
    }
  }
  for (let i = 0; i < total; i++) raw[i] = clip(raw[i])
  return loopable(raw, length, fade)
}

/**
 * One distant roll of thunder: low rumble shaped by a few swells that rise
 * quickly and die away slowly. It starts and ends in silence, so it can be
 * dropped into the mix at any moment without a click.
 */
export function thunderBurst(length: number, rate: number, rnd: Rnd = Math.random): Float32Array {
  const out = new Float32Array(length)
  const env = new Float32Array(length)

  let last = 0
  const body = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    last = (last + 0.03 * (rnd() * 2 - 1)) / 1.015
    body[i] = last
  }

  const swells = 3 + Math.floor(rnd() * 3)
  let onset = 0.2 + rnd() * 0.4
  for (let s = 0; s < swells; s++) {
    const amp = s === 0 ? 0.75 + 0.25 * rnd() : 0.3 + 0.55 * rnd()
    const rise = 0.04 + 0.1 * rnd()
    const tau = 0.9 + 1.6 * rnd()
    for (let i = Math.floor(onset * rate); i < length; i++) {
      const dt = i / rate - onset
      const e = amp * (1 - Math.exp(-dt / rise)) * Math.exp(-dt / tau)
      if (e > env[i]) env[i] = e
      else if (dt > tau * 6) break
    }
    onset += 0.5 + 1.6 * rnd()
  }

  const head = Math.round(0.05 * rate)
  const tail = Math.round(1.2 * rate)
  let peak = 0
  for (let i = 0; i < length; i++) {
    let g = env[i]
    if (i < head) g *= i / head
    if (i > length - tail) g *= (length - i) / tail
    out[i] = body[i] * g
    peak = Math.max(peak, Math.abs(out[i]))
  }
  if (peak > 0) for (let i = 0; i < length; i++) out[i] = (out[i] / peak) * 0.9
  return out
}
