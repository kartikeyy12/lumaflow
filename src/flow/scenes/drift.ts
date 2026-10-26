import { mulberry32, swell, type Scene } from '../scene'

interface Mote {
  x: number
  y: number
  z: number
  ph: number
  tw: number
}

function buildSprite(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const x = c.getContext('2d') as CanvasRenderingContext2D
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(255,226,176,1)')
  g.addColorStop(0.2, 'rgba(255,205,140,0.5)')
  g.addColorStop(1, 'rgba(255,190,120,0)')
  x.fillStyle = g
  x.fillRect(0, 0, 64, 64)
  return c
}

/** Sparse warm motes rising through lamplight. Deeper ones are smaller and slower. */
export function createDrift(): Scene {
  let motes: Mote[] = []
  let sprite: HTMLCanvasElement | null = null

  return {
    resize(w, h) {
      sprite = buildSprite()
      const rnd = mulberry32(5)
      const count = Math.round(Math.min(70, Math.max(26, (w * h) / 20000)))
      motes = Array.from({ length: count }, () => ({
        x: rnd() * w,
        y: rnd() * h,
        z: 0.25 + rnd() * 0.75,
        ph: rnd() * Math.PI * 2,
        tw: 0.4 + rnd() * 0.9,
      }))
    },

    draw(ctx, w, h, t, p, pulse) {
      if (!sprite) return
      const g = p.glow + swell(pulse) * 0.22

      // A low warm glow, like a lamp just out of frame.
      const lamp = ctx.createRadialGradient(w * 0.5, h * 1.08, 0, w * 0.5, h * 1.08, Math.max(w, h) * 0.75)
      lamp.addColorStop(0, `rgba(255,170,90,${0.17 * g})`)
      lamp.addColorStop(1, 'rgba(255,170,90,0)')
      ctx.fillStyle = lamp
      ctx.fillRect(0, 0, w, h)

      const pad = 40
      const span = h + pad * 2
      const sway = 10 + p.amplitude * 22
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      for (const m of motes) {
        const y = (((m.y - t * 13 * m.z) % span) + span) % span - pad
        const x = m.x + Math.sin(t * 0.22 * m.tw + m.ph) * sway * m.z
        const edge = Math.min(1, Math.min(y + pad, h + pad - y) / 70)
        const a = (0.14 + 0.46 * m.z) * (0.7 + 0.3 * Math.sin(t * m.tw + m.ph)) * Math.min(1, g * 1.25) * edge
        const d = 8 + m.z * 22
        ctx.globalAlpha = Math.max(0, Math.min(1, a))
        ctx.drawImage(sprite, x - d / 2, y - d / 2, d, d)
      }
      ctx.restore()
    },
  }
}
