import type { Status } from '../core/types'
import { StateGlyph } from './icons'

const R = 150
const C = 2 * Math.PI * R

const STATUS_TEXT = {
  idle: 'Ready',
  running: 'Running',
  paused: 'Paused',
  completed: 'Complete',
} as const

interface Props {
  /** "Focus", "Short break", "Stopwatch" and so on. */
  label: string
  /** Pre-formatted clock text, such as 24:57 or 1:05:30. */
  clock: string
  /** What a screen reader announces for the clock. */
  spoken: string
  /** 0 to 1. */
  progress: number
  status: Status
  /** Changes when a new phase starts, so the ring resets instead of unwinding. */
  arcKey: string
  /** Hook for styling per mode. */
  mode: string
}

export function TimerDial({ label, clock, spoken, progress, status, arcKey, mode }: Props) {
  const hasHours = clock.split(':').length === 3
  const offset = C * (1 - Math.min(1, Math.max(0, progress)))

  return (
    <div className="dial" data-status={status} data-mode={mode}>
      <svg className="dial-ring" viewBox="0 0 340 340" aria-hidden="true">
        <circle className="dial-disc" cx="170" cy="170" r={R - 6} />
        <circle className="dial-track" cx="170" cy="170" r={R} />
        <circle
          key={arcKey}
          className="dial-arc"
          cx="170"
          cy="170"
          r={R}
          strokeDasharray={C}
          strokeDashoffset={offset}
          transform="rotate(-90 170 170)"
        />
      </svg>
      <div className="dial-face">
        <div className="dial-mode">{label}</div>
        <div className={`dial-clock${hasHours ? ' has-hours' : ''}`} role="timer" aria-live="off" aria-label={spoken}>
          {clock.split('').map((ch, i) =>
            ch === ':' ? (
              <span key={i} className="colon" aria-hidden="true">
                :
              </span>
            ) : (
              <span key={i} className="digit" aria-hidden="true">
                {ch}
              </span>
            ),
          )}
        </div>
        <div className="dial-status">
          <StateGlyph status={status} />
          <span>{STATUS_TEXT[status]}</span>
        </div>
      </div>
    </div>
  )
}
