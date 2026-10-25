import { MODE_LABEL, formatClock } from '../core/format'
import { getProgress } from '../core/timer'
import type { TimerState } from '../core/types'
import { StateGlyph } from './icons'

const R = 150
const C = 2 * Math.PI * R

const STATUS_TEXT = {
  idle: 'Ready',
  running: 'Running',
  paused: 'Paused',
  completed: 'Complete',
} as const

function spoken(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const parts: string[] = []
  if (h) parts.push(`${h} ${h === 1 ? 'hour' : 'hours'}`)
  if (m) parts.push(`${m} ${m === 1 ? 'minute' : 'minutes'}`)
  if (s || parts.length === 0) parts.push(`${s} ${s === 1 ? 'second' : 'seconds'}`)
  return parts.join(' ')
}

interface Props {
  timer: TimerState
  now: number
  remaining: number
}

export function TimerDial({ timer, now, remaining }: Props) {
  const progress = getProgress(timer, now)
  const clock = formatClock(remaining)
  const hasHours = clock.split(':').length === 3
  const offset = C * (1 - progress)

  return (
    <div className="dial" data-status={timer.status} data-mode={timer.mode}>
      <svg className="dial-ring" viewBox="0 0 340 340" aria-hidden="true">
        <circle className="dial-disc" cx="170" cy="170" r={R - 6} />
        <circle className="dial-track" cx="170" cy="170" r={R} />
        <circle
          key={timer.phaseId}
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
        <div className="dial-mode">{MODE_LABEL[timer.mode]}</div>
        <div
          className={`dial-clock${hasHours ? ' has-hours' : ''}`}
          role="timer"
          aria-live="off"
          aria-label={`${spoken(remaining)} remaining`}
        >
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
          <StateGlyph status={timer.status} />
          <span>{STATUS_TEXT[timer.status]}</span>
        </div>
      </div>
    </div>
  )
}
