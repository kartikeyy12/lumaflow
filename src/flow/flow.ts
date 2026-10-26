export type FlowState = 'idle' | 'focus' | 'short' | 'long' | 'paused' | 'completed'

export interface FlowParams {
  /** Drift speed multiplier. Zero means the ribbon holds still. */
  speed: number
  /** Wave height as a fraction of the available height. */
  amplitude: number
  /** How far the strands fan apart. */
  spread: number
  /** Overall luminosity. */
  glow: number
  /** Accent hue in degrees. Kept inside the lavender range. */
  hue: number
}

/**
 * Each state is a small step away from the others. The ribbon never gets
 * brighter or faster as a timer runs down.
 */
export const FLOW_TARGETS: Record<FlowState, FlowParams> = {
  idle: { speed: 0.22, amplitude: 0.4, spread: 0.55, glow: 0.4, hue: 256 },
  focus: { speed: 0.5, amplitude: 0.48, spread: 0.5, glow: 0.62, hue: 256 },
  short: { speed: 0.36, amplitude: 0.62, spread: 0.78, glow: 0.52, hue: 250 },
  long: { speed: 0.26, amplitude: 0.78, spread: 1, glow: 0.56, hue: 244 },
  paused: { speed: 0, amplitude: 0.34, spread: 0.42, glow: 0.26, hue: 256 },
  completed: { speed: 0.24, amplitude: 0.6, spread: 0.92, glow: 0.7, hue: 252 },
}

const KEYS: Array<keyof FlowParams> = ['speed', 'amplitude', 'spread', 'glow', 'hue']

/** Frame-rate independent exponential approach. `tau` is in seconds. */
export function approach(current: FlowParams, target: FlowParams, dt: number, tau = 1.1): FlowParams {
  const k = 1 - Math.exp(-dt / tau)
  const out = { ...current }
  for (const key of KEYS) out[key] = current[key] + (target[key] - current[key]) * k
  return out
}

export function isSettled(current: FlowParams, target: FlowParams): boolean {
  return KEYS.every((k) => Math.abs(current[k] - target[k]) < (k === 'hue' ? 0.2 : 0.004))
}

const STRANDS = 7
const POINTS = 96

/**
 * Draws one ribbon frame. The caller clears the canvas. `t` is accumulated
 * "flow time", so changing speed never makes the shape jump. `pulse` runs 0 to 1
 * once when a session completes and adds a single soft swell.
 */
export function drawFlow(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  p: FlowParams,
  pulse = 0,
) {
  const swell = Math.sin(Math.PI * pulse)
  const glow = p.glow + swell * 0.22
  const spread = p.spread + swell * 0.12
  const cy = h * 0.5
  const amp = h * 0.27 * p.amplitude

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  const grad = ctx.createLinearGradient(0, 0, w, 0)
  grad.addColorStop(0, `hsla(${p.hue}, 90%, 78%, 0)`)
  grad.addColorStop(0.2, `hsla(${p.hue}, 90%, 78%, 0.55)`)
  grad.addColorStop(0.5, `hsla(${p.hue}, 92%, 82%, 1)`)
  grad.addColorStop(0.8, `hsla(${p.hue}, 90%, 78%, 0.55)`)
  grad.addColorStop(1, `hsla(${p.hue}, 90%, 78%, 0)`)
  ctx.strokeStyle = grad

  const scale = Math.min(1, w / 900)
  const k1 = (2 * Math.PI) / (w * 0.9)
  const k2 = (2 * Math.PI) / (w * 0.47)
  const k3 = (2 * Math.PI) / (w * 0.29)

  for (let i = 0; i < STRANDS; i++) {
    const u = (i - (STRANDS - 1) / 2) / ((STRANDS - 1) / 2) // -1..1
    const centre = 1 - Math.abs(u) * 0.62
    const base = cy + u * spread * h * 0.13
    const phase = i * 0.34 * (0.6 + spread * 0.5)

    ctx.beginPath()
    for (let n = 0; n <= POINTS; n++) {
      const x = (n / POINTS) * w
      // Waves ease out toward the edges so the ribbon dissolves rather than ends.
      const edge = Math.sin(Math.PI * (n / POINTS))
      const wave =
        Math.sin(x * k1 + t * 0.9 + phase) * 0.58 +
        Math.sin(x * k2 - t * 0.62 + phase * 1.7) * 0.3 +
        Math.sin(x * k3 + t * 0.4 + phase * 0.6) * 0.12
      const y = base + wave * amp * (0.35 + 0.65 * edge) * (0.85 + 0.15 * scale)
      if (n === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    // Wide soft pass, then a thin bright core.
    ctx.lineWidth = 7 * scale + 3
    ctx.globalAlpha = Math.min(1, 0.14 * glow * centre * 1.6)
    ctx.stroke()
    ctx.lineWidth = 1.2
    ctx.globalAlpha = Math.min(1, 0.95 * glow * centre)
    ctx.stroke()
  }
  ctx.restore()
}
