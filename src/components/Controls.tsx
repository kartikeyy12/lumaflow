import { useEffect, useState } from 'react'
import { MODE_LABEL } from '../core/format'
import { durationFor, nextMode } from '../core/timer'
import type { LogEntry, Mode, Settings, TimerState } from '../core/types'
import { IconPause, IconPlay, IconReset } from './icons'

interface Props {
  timer: TimerState
  settings: Settings
  /** Log entry recorded for the phase that just completed, if any. */
  entry: LogEntry | null
  confirmingReset: boolean
  onToggle: () => void
  onReset: () => void
  onStartNext: (mode?: Mode) => void
  onFinish: () => void
  onReviewNext: (id: string, text: string) => void
}

export function Controls(props: Props) {
  const { timer, settings, entry, confirmingReset } = props

  if (timer.status === 'completed') {
    const next = nextMode(timer, settings)
    const mins = Math.round(durationFor(next, settings) / 60_000)
    const alt: Mode | null = next !== 'focus' ? 'focus' : null
    return (
      <div className="controls-stack">
        {entry && timer.mode === 'focus' && <ReviewNext entry={entry} onSave={props.onReviewNext} />}
        <div className="controls">
          <button type="button" className="btn btn-primary" onClick={() => props.onStartNext(next)} autoFocus>
            <IconPlay />
            <span>
              Start {MODE_LABEL[next].toLowerCase()} · {mins} min
            </span>
          </button>
          {alt && (
            <button type="button" className="btn" onClick={() => props.onStartNext(alt)}>
              Another focus
            </button>
          )}
          <button type="button" className="btn btn-quiet" onClick={props.onFinish}>
            Done
          </button>
        </div>
      </div>
    )
  }

  const running = timer.status === 'running'
  const label = running ? 'Pause' : timer.status === 'paused' ? 'Resume' : 'Start'
  const inProgress = timer.status === 'running' || timer.status === 'paused'
  return (
    <div className="controls">
      <button
        type="button"
        className="btn btn-primary btn-main"
        onClick={props.onToggle}
        aria-keyshortcuts="Space"
      >
        {running ? <IconPause /> : <IconPlay />}
        <span>{label}</span>
      </button>
      <button
        type="button"
        className={`btn${confirmingReset ? ' btn-warn' : ''}`}
        onClick={props.onReset}
        aria-keyshortcuts="R"
        disabled={!inProgress}
      >
        <IconReset />
        <span>{confirmingReset ? 'Confirm reset' : 'Reset'}</span>
      </button>
    </div>
  )
}

function ReviewNext({ entry, onSave }: { entry: LogEntry; onSave: (id: string, text: string) => void }) {
  const [text, setText] = useState(entry.reviewNext ?? '')
  useEffect(() => setText(entry.reviewNext ?? ''), [entry.id, entry.reviewNext])
  return (
    <label className="field field-wide">
      <span className="field-label">Review next (optional)</span>
      <input
        type="text"
        value={text}
        maxLength={300}
        placeholder="What should you come back to?"
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== (entry.reviewNext ?? '') && onSave(entry.id, text)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
      />
    </label>
  )
}
