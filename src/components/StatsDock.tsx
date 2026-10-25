import { formatDuration } from '../core/format'
import type { DayStats } from '../core/stats'
import { IconHistory } from './icons'

interface Props {
  today: DayStats
  goalMin: number
  onOpenLog: () => void
  onOpenGoal: () => void
}

export function StatsDock({ today, goalMin, onOpenLog, onOpenGoal }: Props) {
  const goalMs = goalMin * 60_000
  const pct = goalMs > 0 ? Math.min(100, Math.round((today.focusedMs / goalMs) * 100)) : 0
  const reached = goalMs > 0 && today.focusedMs >= goalMs

  return (
    <footer className="dock" aria-label="Today">
      <dl className="stats">
        <div>
          <dt>Sessions today</dt>
          <dd>{today.sessions}</dd>
        </div>
        <div>
          <dt>Focused today</dt>
          <dd>{formatDuration(today.focusedMs)}</dd>
        </div>
        <div className="goal">
          <dt>Daily goal</dt>
          <dd>
            {goalMs > 0 ? (
              <>
                <div
                  className="meter"
                  role="progressbar"
                  aria-label="Daily focus goal"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={pct}
                  aria-valuetext={`${formatDuration(today.focusedMs)} of ${formatDuration(goalMs)}`}
                >
                  <span style={{ width: `${pct}%` }} />
                </div>
                <span className="goal-text">
                  {formatDuration(today.focusedMs)} of {formatDuration(goalMs)}
                  {reached ? ' · reached' : ''}
                </span>
              </>
            ) : (
              <button type="button" className="link" onClick={onOpenGoal}>
                Set a goal
              </button>
            )}
          </dd>
        </div>
      </dl>
      <button type="button" className="btn btn-quiet btn-sm" onClick={onOpenLog}>
        <IconHistory />
        <span>History</span>
      </button>
    </footer>
  )
}
