import { useEffect, useRef } from 'react'
import { FLOW_TARGETS, approach, drawFlow, isSettled, type FlowParams, type FlowState } from '../flow/flow'

interface Props {
  state: FlowState
  reducedMotion: boolean
  /** Changes once per completed phase to trigger the soft swell. */
  pulseKey: string | null
}

const FRAME_MS = 1000 / 30
const STATIC_T = 3.2
const PULSE_SECONDS = 2.8

/**
 * The ribbon. Draws at 30 fps, at most 1.5x pixel density, stops entirely when
 * the tab is hidden, when motion is reduced, or when the ribbon has settled
 * into a paused pose.
 */
export function FlowCanvas({ state, reducedMotion, pulseKey }: Props) {
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

    let w = 0
    let h = 0
    let dpr = 1
    let raf = 0
    let last = 0
    let acc = 0
    let t = STATIC_T
    let params: FlowParams = { ...targetRef.current }
    let running = false

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      w = Math.max(1, Math.round(rect.width))
      h = Math.max(1, Math.round(rect.height))
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
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

    const paint = (now: number) => drawFlow(ctx, w, h, t, params, pulseValue(now))

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
      if (reducedRef.current) {
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
  }, [])

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
