import { useEffect, useId, useState } from 'react'
import { LIMITS, MAX_AUTO_CHAIN } from '../core/timer'
import { BEATS, beatLabel } from '../core/sounds'
import type { BeatId, Settings, TimerState } from '../core/types'
import { AMBIENTS } from '../feedback/ambient'
import { previewChime } from '../feedback/chime'
import { notificationPermission, requestNotificationPermission } from '../feedback/notify'
import { SCENES } from '../flow/scenes'
import type { Backup } from '../core/backup'
import type { Task } from '../core/tasks'
import type { LogEntry } from '../core/types'
import { DataSection } from './DataSection'
import { Modal } from './Modal'

interface Props {
  open: boolean
  onClose: () => void
  settings: Settings
  timer: TimerState
  onChange: (patch: Partial<Settings>) => void
  tasks: Task[]
  log: LogEntry[]
  now: number
  onRestore: (backup: Backup) => { sessions: number; todos: number }
  onStartFresh: (opts: { settings: boolean }) => void
}

export function SettingsDialog({ open, onClose, settings, timer, onChange, tasks, log, now, onRestore, onStartFresh }: Props) {
  const [notifyMsg, setNotifyMsg] = useState<string | null>(null)
  const active = timer.status === 'running' || timer.status === 'paused'

  return (
    <Modal open={open} title="Settings" onClose={onClose}>
      <section className="set-group" aria-labelledby="set-bg">
        <h3 id="set-bg">Background</h3>
        <div className="scenes" role="radiogroup" aria-labelledby="set-bg">
          {SCENES.map((s) => (
            <label key={s.id} className="scene-opt" data-scene-opt={s.id}>
              <input
                type="radio"
                name="scene"
                value={s.id}
                checked={settings.scene === s.id}
                onChange={() => onChange({ scene: s.id })}
              />
              <span className="scene-swatch" aria-hidden="true" />
              <span className="scene-name">{s.label}</span>
              <span className="scene-note">{s.note}</span>
            </label>
          ))}
        </div>
        <p className="muted small">Press B anywhere to switch to the next one.</p>
        <Toggle
          label="Fade everything but the clock"
          hint="While a session runs, the buttons and panels fade after a few seconds. Move the mouse or press a key to bring them back."
          checked={settings.fadeUi}
          onChange={(v) => onChange({ fadeUi: v })}
        />
      </section>

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
          {active ? 'A session is running, so new lengths apply from the next one.' : '25 and 5 are only defaults. Use whatever suits you.'}
        </p>
      </section>

      <section className="set-group" aria-labelledby="set-goal">
        <h3 id="set-goal">Daily focus goal</h3>
        <GoalField minutes={settings.dailyGoalMin} onCommit={(v) => onChange({ dailyGoalMin: v })} />
      </section>

      <section className="set-group" aria-labelledby="set-alerts">
        <h3 id="set-alerts">When a session ends</h3>
        <p className="muted small">The screen always shows it. Everything below is optional.</p>
        <Toggle
          label="Start the next phase automatically"
          hint={`Up to ${MAX_AUTO_CHAIN} in a row, then it waits for you.`}
          checked={settings.autoAdvance}
          onChange={(v) => onChange({ autoAdvance: v })}
        />
        <Toggle
          label="Play a soft chime"
          hint="Browsers need a click or key press first. Starting the timer counts."
          checked={settings.sound}
          onChange={(v) => onChange({ sound: v })}
        />
        {settings.sound && (
          <div className="volume">
            <label htmlFor="vol">Chime volume</label>
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
          label="Notify me when the window is in the background"
          hint={
            notificationPermission() === 'unsupported'
              ? 'Not supported in this browser.'
              : notificationPermission() === 'denied'
                ? 'Blocked for this site in your browser settings.'
                : 'Your browser will ask for permission.'
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

      <section className="set-group" aria-labelledby="set-sound">
        <h3 id="set-sound">Background sound</h3>
        <div className="sounds" role="radiogroup" aria-labelledby="set-sound">
          {AMBIENTS.map((a) => (
            <label key={a.id} className="sound-opt">
              <input
                type="radio"
                name="ambient"
                value={a.id}
                checked={settings.ambient === a.id}
                onChange={() => onChange({ ambient: a.id })}
              />
              <span className="sound-name">{a.label}</span>
              <span className="sound-note">{a.note}</span>
            </label>
          ))}
        </div>
        <div className="beat-row">
          <label htmlFor="beat">Binaural beat</label>
          <select id="beat" value={settings.beat} onChange={(e) => onChange({ beat: e.target.value as BeatId })}>
            <option value="off">Off</option>
            {BEATS.map((b) => (
              <option key={b.id} value={b.id}>
                {beatLabel(b)}
              </option>
            ))}
          </select>
        </div>
        {settings.beat !== 'off' && (
          <p className="muted small">
            Needs headphones. It plays quietly under the sound above. Research on whether beats help focus is mixed, so treat it as a
            preference, not a promise.
          </p>
        )}
        <Toggle
          label="Play it while I focus"
          hint="Starts with each focus session or stopwatch run and fades out when you pause or finish. Breaks stay quiet."
          checked={settings.ambientAuto}
          onChange={(v) => onChange({ ambientAuto: v })}
        />
        <div className="volume volume-flat">
          <label htmlFor="noise-vol">Volume</label>
          <input
            id="noise-vol"
            type="range"
            min={0.05}
            max={1}
            step={0.05}
            value={settings.noiseVolume}
            onChange={(e) => onChange({ noiseVolume: Number(e.target.value) })}
          />
        </div>
        <p className="muted small">Press M to switch it on or off at any time.</p>
      </section>
      <DataSection settings={settings} tasks={tasks} log={log} now={now} onRestore={onRestore} onStartFresh={onStartFresh} />
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
