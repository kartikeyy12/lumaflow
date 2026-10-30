import { formatDuration } from '../core/format'
import type { DayTotal } from '../core/stats'

/** Seven plain bars: focused time per day. No targets, streaks or colours that judge. */
export function WeekChart({ days, today }: { days: DayTotal[]; today: string }) {
  const max = Math.max(...days.map((d) => d.focusedMs), 1)
  const total = days.reduce((sum, d) => sum + d.focusedMs, 0)
  const name = (d: DayTotal) => new Date(d.at).toLocaleDateString([], { weekday: 'short' })
  const summary = days.map((d) => `${name(d)} ${d.focusedMs > 0 ? formatDuration(d.focusedMs) : 'none'}`).join(', ')

  return (
    <figure className="week" data-testid="week-chart">
      <figcaption>
        <span>Last 7 days</span>
        <span className="week-total">{formatDuration(total)} focused</span>
      </figcaption>
      <div className="week-bars" role="img" aria-label={`Focused time per day. ${summary}`}>
        {days.map((d) => (
          <div key={d.key} className={`week-col${d.key === today ? ' week-today' : ''}`}>
            <span className="week-val">{d.focusedMs > 0 ? formatDuration(d.focusedMs) : ''}</span>
            <span className="week-track">
              <span className="week-bar" style={{ height: d.focusedMs > 0 ? `${Math.max(4, (d.focusedMs / max) * 100)}%` : '0' }} />
            </span>
            <span className="week-day">{name(d)}</span>
          </div>
        ))}
      </div>
    </figure>
  )
}
