import { useEffect, useRef } from 'react'
import type { Mode } from '../core/types'

export interface ShortcutHandlers {
  toggle: () => void
  reset: () => void
  mode: (mode: Mode) => void
  fullscreen: () => void
  help: () => void
  cancel: () => void
}

export function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  if (el.isContentEditable) return true
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

/** Elements that already do something with Space or Enter. */
function activatesOnSpace(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  return el.tagName === 'BUTTON' || el.tagName === 'A' || el.tagName === 'SUMMARY' || el.getAttribute('role') === 'button'
}

const MODE_KEYS: Record<string, Mode> = { '1': 'focus', '2': 'short', '3': 'long' }

/**
 * Global shortcuts. They never fire while typing in a field, while a dialog
 * is open, or with Ctrl, Cmd or Alt held. When a button has focus, Space is
 * left alone so it presses that button.
 */
export function useShortcuts(handlers: ShortcutHandlers) {
  const ref = useRef(handlers)
  ref.current = handlers

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return
      if (isEditable(e.target)) return
      const h = ref.current

      if (e.key === 'Escape') {
        h.cancel()
        return
      }
      if (document.querySelector('dialog[open]')) return

      if (e.key === ' ' || e.code === 'Space') {
        if (activatesOnSpace(e.target)) return
        e.preventDefault()
        if (!e.repeat) h.toggle()
        return
      }
      if (e.repeat) return
      const key = e.key.toLowerCase()
      if (key === 'r') h.reset()
      else if (key in MODE_KEYS) h.mode(MODE_KEYS[key])
      else if (key === 'f') h.fullscreen()
      else if (e.key === '?') h.help()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    document.documentElement.dataset.shortcuts = 'ready'
    return () => {
      window.removeEventListener('keydown', onKey)
      delete document.documentElement.dataset.shortcuts
    }
  }, [])
}
