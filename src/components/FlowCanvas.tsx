import { useEffect, useRef } from 'react'
import type { SceneId } from '../core/types'
import { FLOW_TARGETS, approach, isSettled, type FlowParams, type FlowState } from '../flow/flow'
import { SCENE_BY_ID } from '../flow/scenes'

interface Props {
  scene: SceneId
  state: FlowState
  reducedMotion: boolean
  /** Changes once per completed phase to trigger the soft swell. */
  pulseKey: string | null
}

const FRAME_MS = 1000 / 30
const STATIC_T = 3.2
const PULSE_SECONDS = 2.8

/**
 * Draws the chosen background at 30 fps with a capped pixel ratio. The loop
 * stops when the tab is hidden, when motion is reduced, and once the scene has
 * settled into a paused pose, so an idle app costs almost nothing.
 *
 * Mount it with `key={scene}` so a new background fades in from the dark.
 */
export function FlowCanvas({ scene, state, reducedMotion, pulseKey }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const targetRef = useRef<FlowParams>(FLOW_TARGETS[state])
  const wakeRef = useRef<() => void>(() => {})
  const pulseRef = useRef<{ start: number } | null>(null)
  const reducedRef = useRef(reducedMotion)
  const lastPulseKey = useRef<string | null>(pulseKey)

  reducedRef.current = reducedMotion
  targetRef.current = FLOW_TARGETS[state]

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const meta = SCENE_BY_ID[scene]
    const impl = meta.create()

    let w = 0
    let h = 0
    let raf = 0
    let last = 0
    let acc = 0
    let t = STATIC_T
    let params: FlowParams = { ...targetRef.current }
    let running = false

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const device = window.devicePixelRatio || 1
      const ratio = meta.dpr < 1 ? meta.dpr : Math.min(device, meta.dpr)
      w = Math.max(1, Math.round(rect.width))
      h = Math.max(1, Math.round(rect.height))
      canvas.width = Math.max(1, Math.round(w * ratio))
      canvas.height = Math.max(1, Math.round(h * ratio))
      ctx.setTransform(canvas.width / w, 0, 0, canvas.height / h, 0, 0)
      impl.resize(w, h)
      paint(performance.now())
    }

    const pulseValue = (now: number) => {
      const p = pulseRef.current
      if (!p) return 0
      const v = (now - p.start) / (PULSE_SECONDS * 1000)
      if (v >= 1) {
        pulseRef.current = null
        return 0
      }
      return v
    }

    const paint = (now: number) => {
      ctx.clearRect(0, 0, w, h)
      impl.draw(ctx, w, h, t, params, pulseValue(now))
    }

    const frame = (now: number) => {
      raf = 0
      if (document.visibilityState === 'hidden' || reducedRef.current) {
        running = false
        return
      }
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      acc += dt * 1000
      if (acc >= FRAME_MS) {
        const step = acc / 1000
        acc = 0
        params = approach(params, targetRef.current, step)
        t += step * params.speed
        paint(now)
      }
      const settled = isSettled(params, targetRef.current) && params.speed < 0.004 && !pulseRef.current
      if (settled) {
        params = { ...targetRef.current }
        paint(now)
        running = false
        return
      }
      raf = requestAnimationFrame(frame)
    }

    const wake = () => {
      if (reducedRef.current || !meta.animated) {
        // No motion: snap to the pose for the current state and draw once.
        params = { ...targetRef.current }
        paint(performance.now())
        return
      }
      if (running || document.visibilityState === 'hidden') return
      running = true
      last = performance.now()
      acc = FRAME_MS
      raf = requestAnimationFrame(frame)
    }
    wakeRef.current = wake

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (raf) cancelAnimationFrame(raf)
        raf = 0
        running = false
      } else {
        wake()
      }
    }

    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    document.addEventListener('visibilitychange', onVisibility)
    resize()
    wake()

    return () => {
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      if (raf) cancelAnimationFrame(raf)
      wakeRef.current = () => {}
    }
  }, [scene])

  // State or motion preference changed: make sure the loop is awake (or repaint once).
  useEffect(() => {
    wakeRef.current()
  }, [state, reducedMotion])

  useEffect(() => {
    if (pulseKey !== null && pulseKey !== lastPulseKey.current && !reducedMotion) {
      pulseRef.current = { start: performance.now() }
      wakeRef.current()
    }
    lastPulseKey.current = pulseKey
  }, [pulseKey, reducedMotion])

  return <canvas ref={canvasRef} className="flow-canvas" aria-hidden="true" data-testid="flow-canvas" />
}
