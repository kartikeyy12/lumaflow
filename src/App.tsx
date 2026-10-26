import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TimerController } from './core/controller'
import { MODE_LABEL, formatClock, formatElapsed, spokenDuration } from './core/format'
import { statsForDay } from './core/stats'
import { MIN_LOGGABLE_MS, durationFor, getElapsed, getProgress, nextMode } from './core/timer'
import { Controls } from './components/Controls'
import { FlowCanvas } from './components/FlowCanvas'
import {
  IconClose,
  IconCollapse,
  IconExpand,
  IconKeyboard,
  IconScene,
  IconSettings,
  IconSound,
} from './components/icons'
import { LogDialog } from './components/LogDialog'
import { ModeTabs, type Tab } from './components/ModeTabs'
import { SettingsDialog } from './components/SettingsDialog'
import { ShortcutsDialog } from './components/ShortcutsDialog'
import { StatsDock } from './components/StatsDock'
import { TimerDial } from './components/TimerDial'
import type { FlowState } from './flow/flow'
import { SCENE_BY_ID, nextScene } from './flow/scenes'
import { unlockAudio } from './feedback/chime'
import { setNoiseVolume, startNoise, stopNoise } from './feedback/noise'
import { useReducedMotion } from './hooks/useReducedMotion'
import { useShortcuts } from './hooks/useShortcuts'
import { useTimer } from './hooks/useTimer'

type Pending = { kind: 'reset' } | { kind: 'tab'; tab: Tab } | null
type Panel = 'settings' | 'log' | 'help' | null

const CONFIRM_MS = 4000
const HOUR_MS = 3_600_000
const TAB_KEY: Record<Tab, string> = { focus: '1', short: '2', long: '3', stopwatch: '4' }
const TAB_LABEL: Record<Tab, string> = { ...MODE_LABEL, stopwatch: 'Stopwatch' }

export default function App({ controller }: { controller: TimerController }) {
  const { timer, stopwatch, view, settings, log, now, notice, remaining, elapsed } = useTimer(controller)
  const reduced = useReducedMotion()
  const [panel, setPanel] = useState<Panel>(null)
  const [pending, setPending] = useState<Pending>(null)
  const [announce, setAnnounce] = useState('')
  const [fullscreen, setFullscreen] = useState(false)
  const [noiseOn, setNoiseOn] = useState(false)
  const canFullscreen = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen

  const stopwatchView = view === 'stopwatch'
  const tab: Tab = stopwatchView ? 'stopwatch' : timer.mode
  const today = useMemo(() => statsForDay(log, now), [log, now])
  const entry = useMemo(() => log.find((e) => e.id === timer.phaseId) ?? null, [log, timer.phaseId])

  // Abandoning a session that has real progress needs a second press.
  const guarded = stopwatchView
    ? stopwatch.status !== 'idle' && elapsed >= MIN_LOGGABLE_MS
    : timer.mode === 'focus' &&
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
    if (stopwatchView ? stopwatch.status === 'idle' : timer.status === 'idle') return
    if (guarded && pending?.kind !== 'reset') {
      setPending({ kind: 'reset' })
      return
    }
    setPending(null)
    controller.reset()
  }, [controller, guarded, pending, stopwatch.status, stopwatchView, timer.status])

  const requestTab = useCallback(
    (next: Tab) => {
      if (next === tab && !(next !== 'stopwatch' && timer.status === 'completed')) return
      if (guarded && !(pending?.kind === 'tab' && pending.tab === next)) {
        setPending({ kind: 'tab', tab: next })
        return
      }
      setPending(null)
      if (next === 'stopwatch') controller.switchToStopwatch()
      else controller.switchMode(next)
    },
    [controller, guarded, pending, tab, timer.status],
  )

  const startNext = useCallback(
    (mode?: Parameters<TimerController['startNext']>[0]) => {
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

  const cycleScene = useCallback(() => {
    controller.updateSettings({ scene: nextScene(settings.scene) })
  }, [controller, settings.scene])

  const toggleNoise = useCallback(async () => {
    if (noiseOn) {
      stopNoise()
      setNoiseOn(false)
      return
    }
    setNoiseOn(await startNoise(settings.noiseVolume))
  }, [noiseOn, settings.noiseVolume])

  useEffect(() => {
    if (noiseOn) setNoiseVolume(settings.noiseVolume)
  }, [noiseOn, settings.noiseVolume])
  useEffect(() => () => stopNoise(), [])

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  useShortcuts({
    toggle,
    reset: requestReset,
    mode: requestTab,
    scene: cycleScene,
    noise: () => void toggleNoise(),
    fullscreen: toggleFullscreen,
    help: () => setPanel('help'),
    cancel: () => setPending(null),
  })

  // Screen reader announcements for state changes (not for every second).
  const lastAnnounced = useRef('')
  const status = stopwatchView ? stopwatch.status : timer.status
  const phaseKey = stopwatchView ? stopwatch.runId : timer.phaseId
  useEffect(() => {
    const label = TAB_LABEL[tab]
    const mins = Math.round(timer.durationMs / 60_000)
    const key = `${phaseKey}:${status}`
    if (lastAnnounced.current === key) return
    const first = lastAnnounced.current === ''
    lastAnnounced.current = key
    if (first) return
    if (status === 'running') setAnnounce(stopwatchView ? 'Stopwatch started.' : `${label} started, ${mins} minutes.`)
    else if (status === 'paused') setAnnounce(`${label} paused.`)
    else if (status === 'completed') setAnnounce(`${label} complete. Choose what to do next.`)
    else setAnnounce(stopwatchView ? 'Stopwatch ready.' : `${label} ready, ${mins} minutes.`)
  }, [phaseKey, status, tab, timer.durationMs, stopwatchView])

  const flowState: FlowState =
    status === 'paused'
      ? 'paused'
      : status === 'completed'
        ? 'completed'
        : status === 'idle'
          ? 'idle'
          : stopwatchView
            ? 'focus'
            : timer.mode

  const upcoming = nextMode(timer, settings)
  let hint: string
  if (pending?.kind === 'reset') {
    hint = stopwatchView
      ? 'This saves the run to History and resets the clock. Press R again to confirm, Esc to cancel.'
      : 'This ends the session early and logs the time so far. Press R again to confirm, Esc to cancel.'
  } else if (pending?.kind === 'tab') {
    const key = TAB_KEY[pending.tab]
    hint = stopwatchView
      ? `Switching saves your stopwatch time. Press ${key} again for ${TAB_LABEL[pending.tab].toLowerCase()}, Esc to cancel.`
      : `Switching ends this session early. Press ${key} again for ${TAB_LABEL[pending.tab].toLowerCase()}, Esc to cancel.`
  } else if (stopwatchView) {
    hint = 'No target. Runs of a minute or more are saved when you finish.'
  } else if (timer.status === 'completed') {
    hint = timer.endedBy === 'away' ? 'This one ended while LumaFlow was not running.' : ''
  } else {
    hint = `Next: ${MODE_LABEL[upcoming]} · ${Math.round(durationFor(upcoming, settings) / 60_000)} min`
  }

  const dial = stopwatchView
    ? {
        label: 'Stopwatch',
        clock: formatElapsed(elapsed),
        spoken: `${spokenDuration(elapsed)} elapsed`,
        progress: (elapsed % HOUR_MS) / HOUR_MS,
        status: stopwatch.status,
        arcKey: stopwatch.runId,
        mode: 'stopwatch',
      }
    : {
        label: MODE_LABEL[timer.mode],
        clock: formatClock(remaining),
        spoken: `${spokenDuration(Math.ceil(remaining / 1000) * 1000)} remaining`,
        progress: getProgress(timer, now),
        status: timer.status,
        arcKey: timer.phaseId,
        mode: timer.mode,
      }

  return (
    <div className="app" data-flow={flowState} data-scene={settings.scene}>
      <FlowCanvas
        key={settings.scene}
        scene={settings.scene}
        state={flowState}
        reducedMotion={reduced}
        pulseKey={!stopwatchView && timer.status === 'completed' ? timer.phaseId : null}
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
          <button
            type="button"
            className="icon-btn"
            onClick={() => void toggleNoise()}
            aria-label="Brown noise"
            aria-pressed={noiseOn}
            aria-keyshortcuts="M"
            title="Brown noise (M)"
          >
            <IconSound />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={cycleScene}
            aria-label={`Change background, now ${SCENE_BY_ID[settings.scene].label}`}
            aria-keyshortcuts="B"
            title="Change background (B)"
          >
            <IconScene />
          </button>
          <button type="button" className="icon-btn hide-touch" onClick={() => setPanel('help')} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">
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

        <ModeTabs tab={tab} onSelect={requestTab} />
        <TimerDial {...dial} />

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
          view={view}
          stopwatch={stopwatch}
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
