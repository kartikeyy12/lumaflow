import { drawFlow } from '../flow'
import type { Scene } from '../scene'

/** Slow luminous strands. The band stays centred and never grows past 620px. */
export function createRibbon(): Scene {
  return {
    resize() {},
    draw(ctx, w, h, t, p, pulse) {
      const band = Math.min(h * 0.7, 620)
      ctx.save()
      ctx.translate(0, (h - band) / 2)
      drawFlow(ctx, w, band, t, p, pulse)
      ctx.restore()
    },
  }
}
