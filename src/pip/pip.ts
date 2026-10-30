import type { MiniData } from './mini'
import { STATUS_TEXT } from './mini'

export type PipKind = 'document' | 'video'

interface DocumentPipApi {
  requestWindow: (opts?: { width?: number; height?: number }) => Promise<Window>
}

function documentPipApi(): DocumentPipApi | null {
  if (typeof window === 'undefined') return null
  const api = (window as unknown as { documentPictureInPicture?: DocumentPipApi }).documentPictureInPicture
  return api && typeof api.requestWindow === 'function' ? api : null
}

/**
 * Chrome and Edge can float a real page (buttons and all). Safari and others can only float
 * a video, so there the clock is drawn onto a canvas and played as one. Firefox gets neither.
 */
export function pipSupport(): PipKind | null {
  if (documentPipApi()) return 'document'
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  const video = document.createElement('video')
  const canVideo =
    document.pictureInPictureEnabled === true &&
    typeof canvas.captureStream === 'function' &&
    typeof video.requestPictureInPicture === 'function'
  return canVideo ? 'video' : null
}

/** Opens the small window. Must be called from a click or key press. */
export async function openDocumentPip(): Promise<Window> {
  const api = documentPipApi()
  if (!api) throw new Error('Document picture-in-picture is not available')
  const win = await api.requestWindow({ width: 280, height: 170 })
  copyStyles(document, win.document)
  win.document.title = 'LumaFlow'
  win.document.documentElement.lang = document.documentElement.lang || 'en'
  return win
}

/** The small window starts empty, so give it the same stylesheets as this page. */
export function copyStyles(from: Document, to: Document) {
  for (const sheet of Array.from(from.styleSheets)) {
    try {
      const css = Array.from(sheet.cssRules)
        .map((r) => r.cssText)
        .join('\n')
      const el = to.createElement('style')
      el.textContent = css
      to.head.appendChild(el)
    } catch {
      if (!sheet.href) continue
      const link = to.createElement('link')
      link.rel = 'stylesheet'
      link.href = sheet.href
      to.head.appendChild(link)
    }
  }
}

/** Fallback: the clock drawn on a canvas, played in a video that the browser floats. */
export interface VideoPip {
  open: (data: MiniData) => Promise<void>
  update: (data: MiniData) => void
  close: () => void
}

const W = 320
const H = 180

export function createVideoPip(handlers: { onAction: () => void; onClose: () => void }): VideoPip {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.setAttribute('aria-hidden', 'true')
  let last: MiniData | null = null
  let isOpen = false

  const accent = () =>
    getComputedStyle(document.querySelector('.app') ?? document.documentElement).getPropertyValue('--accent').trim() || '#b9a8ff'

  const draw = (d: MiniData) => {
    if (!ctx) return
    ctx.fillStyle = '#0c0c0f'
    ctx.fillRect(0, 0, W, H)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = accent()
    ctx.font = '600 15px system-ui, sans-serif'
    ctx.fillText(d.label.toUpperCase(), W / 2, 30)
    ctx.fillStyle = '#efeae1'
    ctx.font = '600 72px system-ui, sans-serif'
    ctx.fillText(d.clock, W / 2, 92)
    ctx.fillStyle = '#9a98a5'
    ctx.font = '500 14px system-ui, sans-serif'
    ctx.fillText(STATUS_TEXT[d.status], W / 2, 150)
  }

  const session = () => (typeof navigator !== 'undefined' ? navigator.mediaSession : undefined)

  const sync = (d: MiniData) => {
    const ms = session()
    if (!ms) return
    ms.playbackState = d.running ? 'playing' : 'paused'
    try {
      ms.metadata = new MediaMetadata({ title: `${d.clock} · ${d.label}`, artist: 'LumaFlow' })
    } catch {
      /* some browsers have no MediaMetadata */
    }
  }

  const onLeave = () => {
    if (!isOpen) return
    isOpen = false
    clearHandlers()
    handlers.onClose()
  }

  function clearHandlers() {
    const ms = session()
    if (!ms) return
    for (const a of ['play', 'pause'] as const) {
      try {
        ms.setActionHandler(a, null)
      } catch {
        /* not supported */
      }
    }
  }

  return {
    async open(d) {
      last = d
      draw(d)
      video.srcObject = canvas.captureStream()
      await video.play()
      video.addEventListener('leavepictureinpicture', onLeave, { once: true })
      await video.requestPictureInPicture()
      isOpen = true
      const ms = session()
      if (ms) {
        for (const a of ['play', 'pause'] as const) {
          try {
            // The floating controls ask for play or pause. Answer with the timer's own start, pause or resume.
            ms.setActionHandler(a, () => handlers.onAction())
          } catch {
            /* not supported */
          }
        }
      }
      sync(d)
    },
    update(d) {
      last = d
      if (!isOpen) return
      draw(d)
      sync(d)
    },
    close() {
      if (!isOpen) return
      isOpen = false
      clearHandlers()
      video.removeEventListener('leavepictureinpicture', onLeave)
      if (document.pictureInPictureElement === video) void document.exitPictureInPicture().catch(() => {})
      video.pause()
      video.srcObject = null
      void last
    },
  }
}
