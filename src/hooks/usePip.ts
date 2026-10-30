import { useCallback, useEffect, useRef, useState } from 'react'
import type { MiniData } from '../pip/mini'
import { createVideoPip, openDocumentPip, pipSupport, type PipKind, type VideoPip } from '../pip/pip'

export interface PipControl {
  kind: PipKind | null
  active: boolean
  /** Where to render the mini timer when a real page is floating. */
  container: HTMLElement | null
  toggle: () => void
}

/**
 * The floating mini timer. In Chrome and Edge it is a small page with the clock and one button.
 * Elsewhere it is a video of the clock, and the browser's own play and pause controls drive the timer.
 */
export function usePip(data: MiniData, onAction: () => void): PipControl {
  const [kind] = useState(pipSupport)
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const [active, setActive] = useState(false)
  const win = useRef<Window | null>(null)
  const video = useRef<VideoPip | null>(null)
  const busy = useRef(false)
  const actionRef = useRef(onAction)
  actionRef.current = onAction
  const dataRef = useRef(data)
  dataRef.current = data

  const reset = useCallback(() => {
    win.current = null
    setContainer(null)
    setActive(false)
  }, [])

  const close = useCallback(() => {
    if (win.current) {
      const w = win.current
      win.current = null
      try {
        w.close()
      } catch {
        /* already closed */
      }
    }
    video.current?.close()
    video.current = null
    setContainer(null)
    setActive(false)
  }, [])

  const open = useCallback(async () => {
    if (busy.current || !kind) return
    busy.current = true
    try {
      if (kind === 'document') {
        const w = await openDocumentPip()
        const root = w.document.createElement('div')
        root.id = 'pip-root'
        w.document.body.appendChild(root)
        // Space presses the button, like on the main page.
        w.addEventListener('keydown', (e) => {
          if (e.code === 'Space' && (e.target as HTMLElement | null)?.tagName !== 'BUTTON') {
            e.preventDefault()
            actionRef.current()
          }
        })
        w.addEventListener('pagehide', reset, { once: true })
        win.current = w
        setContainer(root)
        setActive(true)
      } else {
        const v = createVideoPip({ onAction: () => actionRef.current(), onClose: reset })
        video.current = v
        await v.open(dataRef.current)
        setActive(true)
      }
    } catch {
      // The browser said no (no gesture, blocked, or closed at once). Nothing is left half open.
      video.current = null
      win.current = null
      setContainer(null)
      setActive(false)
    } finally {
      busy.current = false
    }
  }, [kind, reset])

  const toggle = useCallback(() => {
    if (win.current || video.current) close()
    else void open()
  }, [close, open])

  // Keep a floating video current.
  useEffect(() => {
    video.current?.update(data)
  }, [data])

  useEffect(() => close, [close])

  return { kind, active, container, toggle }
}
