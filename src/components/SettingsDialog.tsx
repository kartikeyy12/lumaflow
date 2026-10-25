import { useEffect, useId, useState } from 'react'
import { LIMITS, MAX_AUTO_CHAIN } from '../core/timer'
import type { Settings, TimerState } from '../core/types'
import { previewChime } from '../feedback/chime'
import { notificationPermission, requestNotificationPermission } from '../feedback/notify'
import { Modal } from './Modal'

interface Props {
  open: boolean
  onClose: () => void
  settings: Settings
  timer: TimerState
  onChange: (patch: Partial<Settings>) => void
}

export function SettingsDialog({ open, onClose, settings, timer, onChange }: Props) {
  const [notifyMsg, setNotifyMsg] = useState<string | null>(null)
  const active = timer.status === 'running' || timer.status === 'paused'

  return (
    <Modal open={open} title="Settings" onClose={onClose}>
      <section className="set-group" aria-labelledby="set-lengths">
        <h3 id="set-lengths">Session lengths</h3>
        <div className="set-grid">
          <NumberField label="Focus" unit="min" value={settings.focusMin} limits={LIMITS.focusMin} onCommit={(v) => onChange({ focusMin: v })} />
          <NumberField label="Short break" unit="min" value={settings.shortMin} limits={LIMITS.shortMin} onCommit={(v) => onChange({ shortMin: v })} />
          <NumberField label="Long break" unit="min" value={settings.longMin} limits={LIMITS.longMin} onCommit={(v) => onChange({ longMin: v })} />
          <NumberField
            label="Long break after"
            unit="sessions"
            value={settings.longBreakEvery}
            limits={LIMITS.longBreakEvery}
            onCommit={(v) => onChange({ longBreakEvery: v })}
          />
        </div>
        <p className="muted small">
          {active
            ? 'A session is under way, so new lengths apply from the next one.'
            : 'Any length works. 25 and 5 are only the defaults.'}
        </p>
      </section>

      <section className="set-group" aria-labelledby="set-goal">
        <h3 id="set-goal">Daily focus goal</h3>
        <GoalField minutes={settings.dailyGoalMin} onCommit={(v) => onChange({ dailyGoalMin: v })} />
      </section>

      <section className="set-group" aria-labelledby="set-flow">
        <h3 id="set-flow">Flow</h3>
        <Toggle
          label="Start the next phase automatically"
          hint={`Runs up to ${MAX_AUTO_CHAIN} phases in a row, then waits for you.`}
          checked={settings.autoAdvance}
          onChange={(v) => onChange({ autoAdvance: v })}
        />
      </section>

      <section className="set-group" aria-labelledby="set-alerts">
        <h3 id="set-alerts">End of session</h3>
        <p className="muted small">The screen always shows when a session ends. These are optional extras.</p>
        <Toggle
          label="Play a soft chime"
          hint="Off by default. Needs a click or key press on the page first, which starting the timer provides."
          checked={settings.sound}
          onChange={(v) => onChange({ sound: v })}
        />
        {settings.sound && (
          <div className="volume">
            <label htmlFor="vol">Volume</label>
            <input
              id="vol"
              type="range"
              min={0.05}
              max={1}
              step={0.05}
              value={settings.volume}
              onChange={(e) => onChange({ volume: Number(e.target.value) })}
            />
            <button type="button" className="btn btn-sm" onClick={() => void previewChime(settings.volume)}>
              Preview
            </button>
          </div>
        )}
        <Toggle
          label="Browser notification when the window is in the background"
          hint={
            notificationPermission() === 'unsupported'
              ? 'Not supported in this browser.'
              : notificationPermission() === 'denied'
                ? 'Blocked in your browser settings for this site.'
                : 'Asks for permission when you turn it on.'
          }
          checked={settings.notifications && notificationPermission() === 'granted'}
          disabled={notificationPermission() === 'unsupported' || notificationPermission() === 'denied'}
          onChange={async (v) => {
            if (!v) {
              onChange({ notifications: false })
              setNotifyMsg(null)
              return
            }
            const result = await requestNotificationPermission()
            if (result === 'granted') {
              onChange({ notifications: true })
              setNotifyMsg(null)
            } else {
              onChange({ notifications: false })
              setNotifyMsg('Permission was not granted, so notifications stay off.')
            }
          }}
        />
        {notifyMsg && (
          <p className="small" role="status">
            {notifyMsg}
          </p>
        )}
      </section>
    </Modal>
  )
}

function Toggle(props: {
  label: string
  hint?: string
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void | Promise<void>
}) {
  const id = useId()
  return (
    <div className="toggle">
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={props.checked}
        disabled={props.disabled}
        onChange={(e) => void props.onChange(e.target.checked)}
      />
      <label htmlFor={id}>
        <span>{props.label}</span>
        {props.hint && <small>{props.hint}</small>}
      </label>
    </div>
  )
}

function NumberField(props: {
  label: string
  unit: string
  value: number
  limits: readonly [number, number]
  onCommit: (v: number) => void
}) {
  const id = useId()
  const [draft, setDraft] = useState(String(props.value))
  useEffect(() => setDraft(String(props.value)), [props.value])
  const commit = () => {
    const n = Math.round(Number(draft))
    if (!Number.isFinite(n) || draft.trim() === '') {
      setDraft(String(props.value))
      return
    }
    const clamped = Math.min(props.limits[1], Math.max(props.limits[0], n))
    setDraft(String(clamped))
    if (clamped !== props.value) props.onCommit(clamped)
  }
  return (
    <div className="num">
      <label htmlFor={id}>{props.label}</label>
      <div className="num-input">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={props.limits[0]}
          max={props.limits[1]}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
          }}
        />
        <span aria-hidden="true">{props.unit}</span>
      </div>
    </div>
  )
}

function GoalField({ minutes, onCommit }: { minutes: number; onCommit: (m: number) => void }) {
  const id = useId()
  const [unit, setUnit] = useState<'min' | 'h'>(minutes > 0 && minutes % 60 === 0 ? 'h' : 'min')
  const shown = unit === 'h' ? minutes / 60 : minutes
  const [draft, setDraft] = useState(minutes === 0 ? '' : String(shown))
  useEffect(() => setDraft(minutes === 0 ? '' : String(unit === 'h' ? minutes / 60 : minutes)), [minutes, unit])

  const commit = () => {
    if (draft.trim() === '') {
      if (minutes !== 0) onCommit(0)
      return
    }
    const n = Number(draft)
    if (!Number.isFinite(n) || n < 0) {
      setDraft(minutes === 0 ? '' : String(shown))
      return
    }
    const mins = Math.min(LIMITS.dailyGoalMin[1], Math.round(unit === 'h' ? n * 60 : n))
    if (mins !== minutes) onCommit(mins)
    else setDraft(mins === 0 ? '' : String(unit === 'h' ? mins / 60 : mins))
  }

  return (
    <div className="num goal-field">
      <label htmlFor={id}>Goal per day</label>
      <div className="num-input">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={0}
          step={unit === 'h' ? 0.25 : 5}
          placeholder="No goal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
          }}
        />
        <select aria-label="Goal unit" value={unit} onChange={(e) => setUnit(e.target.value as 'min' | 'h')}>
          <option value="min">minutes</option>
          <option value="h">hours</option>
        </select>
      </div>
      <p className="muted small">Leave empty for no goal. Progress counts all focus time logged today.</p>
    </div>
  )
}
