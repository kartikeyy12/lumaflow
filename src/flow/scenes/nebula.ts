import { mulberry32, swell, type Scene } from '../scene'

interface Star {
  x: number
  y: number
  z: number
  r: number
  tw: number
  ph: number
  color: string
  bright: boolean
}

const STAR_COLORS = ['rgb(255,246,232)', 'rgb(205,222,255)', 'rgb(255,214,196)', 'rgb(236,226,255)']
const CLOUD_HUES = [318, 276, 232, 196, 340, 256]

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = c.height = size
  return [c, c.getContext('2d') as CanvasRenderingContext2D]
}

/** One soft cloud layer, painted once at low resolution and then drifted. */
function buildLayer(size: number, seed: number, blobs: number): HTMLCanvasElement {
  const [canvas, x] = makeCanvas(size)
  const rnd = mulberry32(seed)
  x.globalCompositeOperation = 'lighter'
  for (let i = 0; i < blobs; i++) {
    const hue = CLOUD_HUES[Math.floor(rnd() * CLOUD_HUES.length)] + (rnd() - 0.5) * 26
    const cx = size * (0.16 + rnd() * 0.68)
    const cy = size * (0.16 + rnd() * 0.68)
    const r = size * (0.1 + rnd() * 0.2)
    const stretch = 0.4 + rnd() * 0.75
    const a = 0.15 + rnd() * 0.2
    x.save()
    x.translate(cx, cy)
    x.rotate(rnd() * Math.PI)
    x.scale(1, stretch)
    const g = x.createRadialGradient(0, 0, 0, 0, 0, r)
    g.addColorStop(0, `hsla(${hue}, 90%, 60%, ${a})`)
    g.addColorStop(0.5, `hsla(${hue}, 80%, 46%, ${a * 0.42})`)
    g.addColorStop(1, `hsla(${hue}, 80%, 40%, 0)`)
    x.fillStyle = g
    x.beginPath()
    x.arc(0, 0, r, 0, Math.PI * 2)
    x.fill()
    x.restore()
  }
  return canvas
}

function buildGlow(): HTMLCanvasElement {
  const [c, x] = makeCanvas(32)
  const g = x.createRadialGradient(16, 16, 0, 16, 16, 16)
  g.addColorStop(0, 'rgba(255,255,255,0.9)')
  g.addColorStop(0.25, 'rgba(220,230,255,0.28)')
  g.addColorStop(1, 'rgba(200,210,255,0)')
  x.fillStyle = g
  x.fillRect(0, 0, 32, 32)
  return c
}

/**
 * Colourful clouds and a field of twinkling stars. Two cloud layers turn very
 * slowly in opposite directions, stars drift sideways at different depths.
 */
export function createNebula(): Scene {
  let layerA: HTMLCanvasElement | null = null
  let layerB: HTMLCanvasElement | null = null
  let glow: HTMLCanvasElement | null = null
  let layerSize = 0
  let stars: Star[] = []

  return {
    resize(w, h) {
      layerSize = Math.ceil(Math.hypot(w, h) * 0.5)
      layerA = buildLayer(layerSize, 7, 15)
      layerB = buildLayer(layerSize, 23, 12)
      glow = buildGlow()
      const rnd = mulberry32(11)
      const count = Math.round(Math.min(420, Math.max(90, (w * h) / 6000)))
      stars = Array.from({ length: count }, () => {
        const z = 0.2 + rnd() * 0.8
        return {
          x: rnd() * w,
          y: rnd() * h,
          z,
          r: 0.45 + z * 0.95,
          tw: 0.5 + rnd() * 1.6,
          ph: rnd() * Math.PI * 2,
          color: STAR_COLORS[Math.floor(rnd() * STAR_COLORS.length)],
          bright: rnd() > 0.94,
        }
      })
    },

    draw(ctx, w, h, t, p, pulse) {
      if (!layerA || !layerB || !glow) return
      const lift = swell(pulse)
      const g = p.glow + lift * 0.22
      const scale = (2.25 + (p.spread - 0.5) * 0.5) * 1
      const cx = w / 2
      const cy = h * 0.47

      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      const layers: Array<[HTMLCanvasElement, number, number, number]> = [
        [layerA, t * 0.006 + 0.3, Math.sin(t * 0.03) * 26, Math.cos(t * 0.024) * 18],
        [layerB, -t * 0.0045 + 1.2, Math.cos(t * 0.022) * 32, Math.sin(t * 0.028) * 20],
      ]
      for (const [img, rot, dx, dy] of layers) {
        ctx.save()
        ctx.globalAlpha = Math.min(1, g * 1.5)
        ctx.translate(cx + dx, cy + dy)
        ctx.rotate(rot)
        ctx.scale(scale, scale)
        ctx.drawImage(img, -layerSize / 2, -layerSize / 2)
        ctx.restore()
      }
      ctx.restore()

      // Keep the area behind the timer calm so the numerals stay easy to read.
      const dim = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * 0.46)
      dim.addColorStop(0, 'rgba(5,4,10,0.55)')
      dim.addColorStop(1, 'rgba(5,4,10,0)')
      ctx.fillStyle = dim
      ctx.fillRect(0, 0, w, h)

      const drift = t * 7
      const bright = 0.45 + Math.min(1, g) * 0.75
      for (const s of stars) {
        let x = (s.x - drift * s.z) % w
        if (x < 0) x += w
        const a = s.z * 0.95 * (0.62 + 0.38 * Math.sin(t * s.tw + s.ph)) * bright
        ctx.globalAlpha = Math.min(1, a)
        if (s.bright) {
          const d = 10 + s.z * 12
          ctx.drawImage(glow, x - d / 2, s.y - d / 2, d, d)
        }
        ctx.fillStyle = s.color
        if (s.r < 0.9) ctx.fillRect(x, s.y, 1, 1)
        else {
          ctx.beginPath()
          ctx.arc(x, s.y, s.r, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      ctx.globalAlpha = 1
    },
  }
}
