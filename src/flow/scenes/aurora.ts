import { swell, type Scene } from '../scene'

interface Blob {
  hue: number
  bx: number
  by: number
  ax: number
  ay: number
  fx: number
  fy: number
  ph: number
  r: number
  a: number
}

const BLOBS: Blob[] = [
  { hue: 160, bx: 0.26, by: 0.66, ax: 0.14, ay: 0.08, fx: 0.11, fy: 0.08, ph: 0.0, r: 0.34, a: 0.2 },
  { hue: 178, bx: 0.52, by: 0.74, ax: 0.16, ay: 0.07, fx: 0.08, fy: 0.1, ph: 1.7, r: 0.38, a: 0.17 },
  { hue: 204, bx: 0.74, by: 0.5, ax: 0.12, ay: 0.1, fx: 0.1, fy: 0.07, ph: 3.1, r: 0.32, a: 0.17 },
  { hue: 262, bx: 0.38, by: 0.3, ax: 0.15, ay: 0.09, fx: 0.07, fy: 0.09, ph: 4.4, r: 0.3, a: 0.15 },
  { hue: 146, bx: 0.88, by: 0.76, ax: 0.1, ay: 0.06, fx: 0.09, fy: 0.12, ph: 5.2, r: 0.28, a: 0.14 },
]

/**
 * Large soft light that slowly trades places. Rendered at low resolution and
 * smoothed up by the browser, which is both cheap and exactly the look.
 */
export function createAurora(): Scene {
  return {
    resize() {},
    draw(ctx, w, h, t, p, pulse) {
      const g = p.glow + swell(pulse) * 0.22
      const reach = 0.85 + p.spread * 0.3
      const size = Math.max(w, h)
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      for (const b of BLOBS) {
        const x = (b.bx + Math.sin(t * b.fx + b.ph) * b.ax * reach) * w
        const y = (b.by + Math.cos(t * b.fy + b.ph * 1.3) * b.ay * reach) * h
        const r = b.r * size * (0.9 + p.spread * 0.2)
        ctx.save()
        ctx.translate(x, y)
        ctx.scale(1, 1.45)
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r)
        const a = b.a * g * 1.7
        grad.addColorStop(0, `hsla(${b.hue}, 78%, 56%, ${a})`)
        grad.addColorStop(0.55, `hsla(${b.hue}, 72%, 46%, ${a * 0.4})`)
        grad.addColorStop(1, `hsla(${b.hue}, 70%, 40%, 0)`)
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(0, 0, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
      ctx.restore()
    },
  }
}
