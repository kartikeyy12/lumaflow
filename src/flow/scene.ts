import type { SceneId } from '../core/types'
import type { FlowParams } from './flow'

/**
 * A background. `t` is accumulated flow time (it only advances while the
 * scene is moving, so changing speed never makes the picture jump) and `pulse`
 * runs from 0 to 1 once when a session completes. Scenes draw in CSS pixels
 * and never clear the canvas themselves.
 */
export interface Scene {
  resize(w: number, h: number): void
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, p: FlowParams, pulse: number): void
}

export interface SceneMeta {
  id: SceneId
  label: string
  note: string
  /** Pixel ratio cap. Values below 1 render small and let the browser smooth it up. */
  dpr: number
  animated: boolean
  create: () => Scene
}

/** Small seeded generator so a scene looks the same every time it is built. */
export function mulberry32(seed: number): () => number {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const swell = (pulse: number) => Math.sin(Math.PI * Math.min(1, Math.max(0, pulse)))
