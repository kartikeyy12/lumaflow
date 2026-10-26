import { swell, type Scene } from '../scene'

const RINGS = 7

/** Rings that spread out from the timer, one slow breath at a time. */
export function createRipples(): Scene {
  return {
    resize() {},
    draw(ctx, w, h, t, p, pulse) {
      const g = p.glow + swell(pulse) * 0.22
      const cx = w / 2
      const cy = h * 0.47
      const near = Math.min(w, h) * 0.3
      const far = Math.hypot(w, h) * (0.4 + p.spread * 0.12)
      const hue = p.hue - 40

      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, near * 2.4)
      const breath = 1 + 0.06 * Math.sin(t * 0.5)
      core.addColorStop(0, `hsla(${hue}, 80%, 62%, ${0.09 * g * breath})`)
      core.addColorStop(1, `hsla(${hue}, 80%, 62%, 0)`)
      ctx.fillStyle = core
      ctx.fillRect(0, 0, w, h)

      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      for (let i = 0; i < RINGS; i++) {
        const u = (t * 0.036 + i / RINGS) % 1
        const eased = 1 - Math.pow(1 - u, 1.6)
        const r = near + eased * (far - near)
        const fadeIn = Math.min(1, u / 0.12)
        const a = Math.pow(1 - u, 1.7) * fadeIn * g * 0.42
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.lineWidth = 0.8 + (1 - u) * 1.4
        ctx.strokeStyle = `hsla(${hue}, 78%, 74%, ${a})`
        ctx.stroke()
      }
      ctx.restore()
    },
  }
}
