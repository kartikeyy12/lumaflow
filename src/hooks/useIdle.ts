import { useEffect, useState } from 'react'

const WAKE_EVENTS = ['pointermove', 'pointerdown', 'keydown', 'touchstart', 'wheel'] as const

/** True once nothing has moved or been pressed for `ms`, but only while `active`. */
export function useIdle(active: boolean, ms: number): boolean {
  const [idle, setIdle] = useState(false)

  useEffect(() => {
    if (!active) {
      setIdle(false)
      return
    }
    let id = window.setTimeout(() => setIdle(true), ms)
    const wake = () => {
      setIdle(false)
      window.clearTimeout(id)
      id = window.setTimeout(() => setIdle(true), ms)
    }
    for (const e of WAKE_EVENTS) window.addEventListener(e, wake, { passive: true })
    return () => {
      window.clearTimeout(id)
      for (const e of WAKE_EVENTS) window.removeEventListener(e, wake)
    }
  }, [active, ms])

  return active && idle
}
