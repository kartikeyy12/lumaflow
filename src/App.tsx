import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TimerController } from './core/controller'
import { MODE_LABEL } from './core/format'
import { statsForDay } from './core/stats'
import { MIN_LOGGABLE_MS, durationFor, getElapsed, nextMode } from './core/timer'
import type { Mode } from './core/types'
import { Controls } from './components/Controls'
import { FlowCanvas } from './components/FlowCanvas'
import { IconClose, IconCollapse, IconExpand, IconKeyboard, IconSettings } from './components/icons'
import { LogDialog } from './components/LogDialog'
import { ModeTabs } from './components/ModeTabs'
import { SettingsDialog } from './components/SettingsDialog'
import { ShortcutsDialog } from './components/ShortcutsDialog'
import { StatsDock } from './components/StatsDock'
import { TimerDial } from './components/TimerDial'
import type { FlowState } from './flow/flow'
import { unlockAudio } from './feedback/chime'
import { useReducedMotion } from './hooks/useReducedMotion'
import { useShortcuts } from './hooks/useShortcuts'
import { useTimer } from './hooks/useTimer'

type Pending = { kind: 'reset' } | { kind: 'mode'; mode: Mode } | null
type Panel = 'settings' | 'log' | 'help' | null

const CONFIRM_MS = 4000
const MODE_KEY: Record<Mode, string> = { focus: '1', short: '2', long: '3' }

export default function App({ controller }: { controller: TimerController }) {
  const { timer, settings, log, now, notice, remaining } = useTimer(controller)
  const reduced = useReducedMotion()
  const [panel, setPanel] = useState<Panel>(null)
  const [pending, setPending] = useState<Pending>(null)
  const [announce, setAnnounce] = useState('')
  const [fullscreen, setFullscreen] = useState(false)
  const canFullscreen = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen

  const today = useMemo(() => statsForDay(log, now), [log, now])
  const entry = useMemo(() => log.find((e) => e.id === timer.phaseId) ?? null, [log, timer.phaseId])

  // Abandoning a focus session that has real progress needs a second press.
  const guarded =
    timer.mode === 'focus' &&
    (timer.status === 'running' || timer.status === 'paused') &&
    getElapsed(timer, now) >= MIN_LOGGABLE_MS

  const clearPending = useCallback(() => setPending(null), [])
  useEffect(() => {
    if (!pending) return
    const id = window.setTimeout(clearPending, CONFIRM_MS)
    return () => window.clearTimeout(id)
  }, [pending, clearPending])

  const toggle = useCallback(() => {
    if (settings.sound) unlockAudio()
    setPending(null)
    controller.toggle()
  }, [controller, settings.sound])

  const requestReset = useCallback(() => {
    if (timer.status === 'idle') return
    if (guarded && pending?.kind !== 'reset') {
      setPending({ kind: 'reset' })
      return
    }
    setPending(null)
    controller.reset()
  }, [controller, guarded, pending, timer.status])

  const requestMode = useCallback(
    (mode: Mode) => {
      if (mode === timer.mode && timer.status !== 'completed') return
      if (guarded && !(pending?.kind === 'mode' && pending.mode === mode)) {
        setPending({ kind: 'mode', mode })
        return
      }
      setPending(null)
      controller.switchMode(mode)
    },
    [controller, guarded, pending, timer.mode, timer.status],
  )

  const startNext = useCallback(
    (mode?: Mode) => {
      if (settings.sound) unlockAudio()
      controller.startNext(mode)
    },
    [controller, settings.sound],
  )

  const toggleFullscreen = useCallback(() => {
    if (!canFullscreen) return
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    else void document.documentElement.requestFullscreen().catch(() => {})
  }, [canFullscreen])

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  useShortcuts({
    toggle,
    reset: requestReset,
    mode: requestMode,
    fullscreen: toggleFullscreen,
    help: () => setPanel('help'),
    cancel: () => setPending(null),
  })

  // Screen reader announcements for state changes (not for every second).
  const lastAnnounced = useRef('')
  useEffect(() => {
    const label = MODE_LABEL[timer.mode]
    const mins = Math.round(timer.durationMs / 60_000)
    const key = `${timer.phaseId}:${timer.status}`
    if (lastAnnounced.current === key) return
    const first = lastAnnounced.current === ''
    lastAnnounced.current = key
    if (first) return
    if (timer.status === 'running') setAnnounce(`${label} started, ${mins} minutes.`)
    else if (timer.status === 'paused') setAnnounce(`${label} paused.`)
    else if (timer.status === 'completed') setAnnounce(`${label} complete. Choose what to do next.`)
    else setAnnounce(`${label} ready, ${mins} minutes.`)
  }, [timer.phaseId, timer.status, timer.mode, timer.durationMs])

  const flowState: FlowState =
    timer.status === 'paused'
      ? 'paused'
      : timer.status === 'completed'
        ? 'completed'
        : timer.status === 'idle'
          ? 'idle'
          : timer.mode

  const upcoming = nextMode(timer, settings)
  const hint =
    pending?.kind === 'reset'
      ? 'This ends the session early and logs the time so far. Press R again to confirm, Esc to cancel.'
      : pending?.kind === 'mode'
        ? `Switching ends this session early. Press ${MODE_KEY[pending.mode]} again to switch to ${MODE_LABEL[pending.mode].toLowerCase()}, Esc to cancel.`
        : timer.status === 'completed'
          ? timer.endedBy === 'away'
            ? 'This one ended while LumaFlow was not running.'
            : ''
          : `Next: ${MODE_LABEL[upcoming]} · ${Math.round(durationFor(upcoming, settings) / 60_000)} min`

  return (
    <div className="app" data-flow={flowState}>
      <FlowCanvas
        state={flowState}
        reducedMotion={reduced}
        pulseKey={timer.status === 'completed' ? timer.phaseId : null}
      />

      <header className="topbar">
        <div className="brand">
          <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
            <path d="M3 19 C 9 8, 14 8, 17 15 S 25 22, 29 12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            <path d="M3 24 C 9 13, 14 13, 17 20 S 25 27, 29 17" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
          </svg>
          <div>
            <span className="brand-name">LumaFlow</span>
            <span className="brand-tag">Find your rhythm. Stay in the flow.</span>
          </div>
        </div>
        <div className="topbar-actions">
          <button type="button" className="icon-btn" onClick={() => setPanel('help')} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">
            <IconKeyboard />
          </button>
          {canFullscreen && (
            <button
              type="button"
              className="icon-btn"
              onClick={toggleFullscreen}
              aria-label={fullscreen ? 'Exit full screen' : 'Enter full screen'}
              aria-pressed={fullscreen}
              title="Full screen (F)"
            >
              {fullscreen ? <IconCollapse /> : <IconExpand />}
            </button>
          )}
          <button type="button" className="icon-btn" onClick={() => setPanel('settings')} aria-label="Settings" title="Settings">
            <IconSettings />
          </button>
        </div>
      </header>

      <main className="stage" id="main">
        {notice && (
          <div className="notice" role="status">
            <span>{notice}</span>
            <button type="button" className="icon-btn icon-btn-sm" onClick={controller.dismissNotice} aria-label="Dismiss message">
              <IconClose />
            </button>
          </div>
        )}

        <ModeTabs mode={timer.mode} onSelect={requestMode} />
        <TimerDial timer={timer} now={now} remaining={remaining} />

        <label className="field topic">
          <span className="field-label">Studying</span>
          <input
            type="text"
            value={timer.topic}
            maxLength={200}
            placeholder="Topic or goal for this session"
            onChange={(e) => controller.setTopic(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        <Controls
          timer={timer}
          settings={settings}
          entry={entry}
          confirmingReset={pending?.kind === 'reset'}
          onToggle={toggle}
          onReset={requestReset}
          onStartNext={startNext}
          onFinish={controller.finish}
          onReviewNext={controller.setReviewNext}
        />

        <p className={`hint${pending ? ' hint-alert' : ''}`} role="status" aria-live="polite">
          {hint}
        </p>
      </main>

      <StatsDock
        today={today}
        goalMin={settings.dailyGoalMin}
        onOpenLog={() => setPanel('log')}
        onOpenGoal={() => setPanel('settings')}
      />

      <div className="sr-only" role="status" aria-live="polite">
        {announce}
      </div>

      <SettingsDialog
        open={panel === 'settings'}
        onClose={() => setPanel(null)}
        settings={settings}
        timer={timer}
        onChange={controller.updateSettings}
      />
      <LogDialog
        open={panel === 'log'}
        onClose={() => setPanel(null)}
        log={log}
        today={today}
        now={now}
        onDelete={controller.deleteEntry}
        onClear={controller.clearLog}
      />
      <ShortcutsDialog open={panel === 'help'} onClose={() => setPanel(null)} />
    </div>
  )
}
