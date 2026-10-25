import { useState } from 'react'
import { formatDayLabel, formatDuration, formatTimeOfDay } from '../core/format'
import { dayKey, type DayStats } from '../core/stats'
import type { LogEntry } from '../core/types'
import { IconClose } from './icons'
import { Modal } from './Modal'

interface Props {
  open: boolean
  onClose: () => void
  log: LogEntry[]
  today: DayStats
  now: number
  onDelete: (id: string) => void
  onClear: () => void
}

function outcomeLabel(e: LogEntry): string {
  if (e.outcome === 'early') return `Ended early · planned ${formatDuration(e.plannedMs)}`
  if (e.away) return 'Finished while away'
  return 'Completed'
}

export function LogDialog({ open, onClose, log, today, now, onDelete, onClear }: Props) {
  const [confirming, setConfirming] = useState(false)

  const groups: Array<{ key: string; label: string; entries: LogEntry[] }> = []
  for (const e of log) {
    const key = dayKey(e.endedAt)
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.entries.push(e)
    else groups.push({ key, label: formatDayLabel(e.endedAt, now), entries: [e] })
  }

  return (
    <Modal
      open={open}
      title="History"
      onClose={() => {
        setConfirming(false)
        onClose()
      }}
      wide
    >
      <p className="muted small">
        Today: {today.sessions} completed {today.sessions === 1 ? 'session' : 'sessions'}, {formatDuration(today.focusedMs)} focused.
        A session counts toward the day it ended. Ended-early sessions add their time but are not counted as completed.
      </p>

      {log.length === 0 ? (
        <p className="empty">No sessions yet. Finished focus sessions will appear here.</p>
      ) : (
        <div className="log" data-testid="log">
          {groups.map((g) => (
            <section key={g.key} aria-label={g.label}>
              <h3>{g.label}</h3>
              <ul>
                {g.entries.map((e) => (
                  <li key={e.id}>
                    <span className="log-time">{formatTimeOfDay(e.endedAt)}</span>
                    <span className="log-main">
                      <span className="log-topic">{e.topic || 'No topic'}</span>
                      <span className="log-meta">
                        {formatDuration(e.durationMs)} · {outcomeLabel(e)}
                      </span>
                      {e.reviewNext && <span className="log-next">Review next: {e.reviewNext}</span>}
                    </span>
                    <button
                      type="button"
                      className="icon-btn icon-btn-sm"
                      aria-label={`Delete session at ${formatTimeOfDay(e.endedAt)}`}
                      onClick={() => onDelete(e.id)}
                    >
                      <IconClose />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {log.length > 0 && (
        <div className="danger-zone">
          {confirming ? (
            <div className="confirm" role="alertdialog" aria-label="Confirm clearing data">
              <span>Remove all {log.length} saved sessions? Settings are kept.</span>
              <button type="button" className="btn btn-sm" onClick={() => setConfirming(false)} autoFocus>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-sm btn-warn"
                onClick={() => {
                  onClear()
                  setConfirming(false)
                }}
              >
                Yes, clear everything
              </button>
            </div>
          ) : (
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setConfirming(true)}>
              Clear session data
            </button>
          )}
        </div>
      )}
    </Modal>
  )
}
