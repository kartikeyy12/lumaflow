import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TimerController } from './core/controller'
import type { TaskStore } from './core/taskStore'
import { hasSound, resolveAmbient } from './core/sounds'
import { openCount, type Task } from './core/tasks'
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
  IconPip,
  IconScene,
  IconSettings,
  IconSound,
  IconTodo,
} from './components/icons'
import { LogDialog } from './components/LogDialog'
import { ModeTabs, type Tab } from './components/ModeTabs'
import { SettingsDialog } from './components/SettingsDialog'
import { ShortcutsDialog } from './components/ShortcutsDialog'
import { StatsDock } from './components/StatsDock'
import { TodoDialog } from './components/TodoDialog'
import { TodoList } from './components/TodoList'
import { TimerDial } from './components/TimerDial'
import type { FlowState } from './flow/flow'
import { SCENE_BY_ID, nextScene } from './flow/scenes'
import { unlockAudio } from './feedback/chime'
import { ambientPlaying, setAmbientVolume, startAmbient, stopAmbient } from './feedback/ambient'
import { useReducedMotion } from './hooks/useReducedMotion'
import { useShortcuts } from './hooks/useShortcuts'
import { useMedia } from './hooks/useMedia'
import { useIdle } from './hooks/useIdle'
import { usePip } from './hooks/usePip'
import { createPortal } from 'react-dom'
import { MiniTimer } from './components/MiniTimer'
import type { MiniData } from './pip/mini'
import { useTasks } from './hooks/useTasks'
import { useTimer } from './hooks/useTimer'

type Pending = { kind: 'reset' } | { kind: 'tab'; tab: Tab } | null
type Panel = 'settings' | 'log' | 'help' | 'tasks' | null

const CONFIRM_MS = 4000
/** How long the screen has to be left alone before the extras fade. */
const IDLE_MS = 6000
/** Wide enough to keep the to-do list beside the timer without crowding it. */
const WIDE_QUERY = '(min-width: 1180px)'
const HOUR_MS = 3_600_000
const TAB_KEY: Record<Tab, string> = { focus: '1', short: '2', long: '3', stopwatch: '4' }
const TAB_LABEL: Record<Tab, string> = { ...MODE_LABEL, stopwatch: 'Stopwatch' }

export default function App({ controller, taskStore }: { controller: TimerController; taskStore: TaskStore }) {
  const tasks = useTasks(taskStore)
  const wide = useMedia(WIDE_QUERY)
  const [todoFocus, setTodoFocus] = useState(0)
  // The to-do item chosen with "Study". It only counts while the Studying field still says the same thing.
  const [studyId, setStudyId] = useState<string | null>(null)
  const { timer, stopwatch, view, settings, log, now, notice, remaining, elapsed } = useTimer(controller)
  const reduced = useReducedMotion()
  const [panel, setPanel] = useState<Panel>(null)
  const [pending, setPending] = useState<Pending>(null)
  const [announce, setAnnounce] = useState('')
  const [fullscreen, setFullscreen] = useState(false)
  // null follows the settings; true or false is a deliberate press of the sound button.
  const [soundOverride, setSoundOverride] = useState<boolean | null>(null)
  const canFullscreen = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen

  const stopwatchView = view === 'stopwatch'
  const phaseKey = stopwatchView ? stopwatch.runId : timer.phaseId
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
    if (settings.sound || settings.ambientAuto) unlockAudio()
    setPending(null)
    controller.toggle()
  }, [controller, settings.sound, settings.ambientAuto])

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
      if (settings.sound || settings.ambientAuto) unlockAudio()
      controller.startNext(mode)
    },
    [controller, settings.sound, settings.ambientAuto],
  )

  const toggleFullscreen = useCallback(() => {
    if (!canFullscreen) return
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    else void document.documentElement.requestFullscreen().catch(() => {})
  }, [canFullscreen])

  const cycleScene = useCallback(() => {
    controller.updateSettings({ scene: nextScene(settings.scene) })
  }, [controller, settings.scene])

  // Sound follows the session: it plays during focus and stopwatch runs, and fades out otherwise.
  // Pressing the sound button (or M) overrides that until the next session starts.
  const sessionActive = stopwatchView ? stopwatch.status === 'running' : timer.status === 'running' && timer.mode === 'focus'
  const idle = useIdle(settings.fadeUi && sessionActive && panel === null, IDLE_MS)
  const playable = hasSound(settings)
  const soundKind = resolveAmbient(settings.ambient, settings.scene)
  const soundWanted = playable && (soundOverride ?? (settings.ambientAuto && sessionActive))
  // A muted sound stays muted through pauses, and comes back with the next session.
  useEffect(() => {
    setSoundOverride((o) => (o === false ? null : o))
  }, [phaseKey])

  const toggleSound = useCallback(() => {
    // With no sound chosen there is nothing to switch on, so take the person to where they choose one.
    if (!playable) {
      setPanel('settings')
      return
    }
    unlockAudio()
    setSoundOverride(!soundWanted)
  }, [playable, soundWanted])

  const volume = useRef(settings.noiseVolume)
  volume.current = settings.noiseVolume
  useEffect(() => {
    if (!soundWanted) {
      stopAmbient()
      return
    }
    const playing = ambientPlaying()
    if (playing && (playing.kind !== soundKind || playing.beat !== settings.beat)) stopAmbient()
    let cancelled = false
    const retry = () => void attempt()
    const disarm = () => {
      window.removeEventListener('pointerup', retry)
      window.removeEventListener('keydown', retry)
    }
    // After a reload the browser blocks audio until the next click or key press, so try again then.
    const attempt = async () => {
      const ok = await startAmbient(soundKind, settings.beat, volume.current)
      if (cancelled) return
      if (ok) disarm()
      else {
        window.addEventListener('pointerup', retry, { once: true })
        window.addEventListener('keydown', retry, { once: true })
      }
    }
    void attempt()
    return () => {
      cancelled = true
      disarm()
    }
  }, [soundWanted, soundKind, settings.beat])

  useEffect(() => {
    setAmbientVolume(settings.noiseVolume)
  }, [settings.noiseVolume])
  useEffect(() => () => stopAmbient(), [])

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const todoShown = wide && settings.todoOpen
  // On wide screens the list lives beside the timer and this shows or hides it. On narrow ones it opens a dialog.
  const openTodo = useCallback(
    (focusOnly = false) => {
      if (!wide) {
        setPanel('tasks')
        return
      }
      if (!focusOnly && settings.todoOpen) controller.updateSettings({ todoOpen: false })
      else {
        if (!settings.todoOpen) controller.updateSettings({ todoOpen: true })
        setTodoFocus((n) => n + 1)
      }
    },
    [wide, settings.todoOpen, controller],
  )
  useEffect(() => {
    if (todoFocus === 0) return
    const id = window.setTimeout(() => document.getElementById('todo-input')?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [todoFocus])
  const todoHandlers = {
    onAdd: taskStore.add,
    onToggle: taskStore.toggle,
    onRemove: taskStore.remove,
    onClearDone: taskStore.clearDone,
    onFocusOn: (task: Task) => {
      controller.setTopic(task.text)
      setStudyId(task.id)
      setPanel(null)
    },
  }

  useShortcuts({
    toggle,
    reset: requestReset,
    mode: requestTab,
    scene: cycleScene,
    noise: toggleSound,
    tasks: () => openTodo(true),
    pip: () => pip.toggle(),
    fullscreen: toggleFullscreen,
    help: () => setPanel('help'),
    cancel: () => setPending(null),
  })

  // Screen reader announcements for state changes (not for every second).
  const lastAnnounced = useRef('')
  const status = stopwatchView ? stopwatch.status : timer.status
  const upcomingMode = nextMode(timer, settings)
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

  const completedTimer = !stopwatchView && timer.status === 'completed'
  const mini = useMemo<MiniData>(() => {
    const running = status === 'running'
    return {
      label: stopwatchView ? 'Stopwatch' : MODE_LABEL[timer.mode],
      clock: stopwatchView ? formatElapsed(elapsed) : formatClock(remaining),
      spoken: stopwatchView ? `${spokenDuration(elapsed)} elapsed` : `${spokenDuration(Math.ceil(remaining / 1000) * 1000)} remaining`,
      status,
      action: completedTimer ? `Start ${MODE_LABEL[upcomingMode].toLowerCase()}` : running ? 'Pause' : status === 'paused' ? 'Resume' : 'Start',
      running,
      scene: settings.scene,
    }
  }, [stopwatchView, timer.mode, elapsed, remaining, status, completedTimer, upcomingMode, settings.scene])
  const pip = usePip(mini, () => (completedTimer ? startNext(upcomingMode) : toggle()))

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

  const linkedTask = tasks.find((t) => t.id === studyId && !t.done && t.text === timer.topic) ?? null
  const offerDone = linkedTask !== null && !stopwatchView && timer.mode === 'focus' && timer.status === 'completed'

  const upcoming = upcomingMode
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
    const next = `Next: ${MODE_LABEL[upcoming]} · ${Math.round(durationFor(upcoming, settings) / 60_000)} min`
    // Which focus session this is within the cycle before a long break.
    hint = timer.mode === 'focus' ? `Session ${Math.min(timer.cycle + 1, settings.longBreakEvery)} of ${settings.longBreakEvery} · ${next}` : next
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
    <div className="app" data-flow={flowState} data-scene={settings.scene} data-idle={idle ? '' : undefined}>
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
            onClick={toggleSound}
            aria-label="Background sound"
            aria-pressed={soundWanted}
            aria-keyshortcuts="M"
            title="Background sound (M)"
          >
            <IconSound />
          </button>
          <button
            type="button"
            className="icon-btn icon-btn-count"
            onClick={() => openTodo()}
            aria-label={openCount(tasks) > 0 ? `To-do, ${openCount(tasks)} left` : 'To-do'}
            aria-pressed={wide ? todoShown : undefined}
            aria-keyshortcuts="T"
            title="To-do list (T)"
          >
            <IconTodo />
            {openCount(tasks) > 0 && (
              <span className="count-dot" aria-hidden="true">
                {Math.min(openCount(tasks), 99)}
              </span>
            )}
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
          {pip.kind && (
            <button
              type="button"
              className="icon-btn hide-narrow"
              onClick={pip.toggle}
              aria-label={pip.active ? 'Close the small timer' : 'Open the small timer'}
              aria-pressed={pip.active}
              aria-keyshortcuts="P"
              title="Small floating timer (P)"
            >
              <IconPip />
            </button>
          )}
          <button type="button" className="icon-btn hide-touch" onClick={() => setPanel('help')} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">
            <IconKeyboard />
          </button>
          {canFullscreen && (
            <button
              type="button"
              className="icon-btn hide-narrow"
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

        {offerDone && linkedTask && (
          <button type="button" className="btn btn-sm btn-quiet mark-done" onClick={() => taskStore.toggle(linkedTask.id)}>
            Mark “{linkedTask.text}” done
          </button>
        )}

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

      {todoShown && (
        <aside className={`todo-panel${sessionActive ? ' todo-quiet' : ''}`} aria-labelledby="todo-title" data-testid="todo-panel">
          <div className="todo-head">
            <h2 id="todo-title">To-do</h2>
            <button type="button" className="icon-btn icon-btn-sm" onClick={() => controller.updateSettings({ todoOpen: false })} aria-label="Hide the to-do list">
              <IconClose />
            </button>
          </div>
          <TodoList tasks={tasks} inputId="todo-input" {...todoHandlers} />
        </aside>
      )}

      <div className="sr-only" role="status" aria-live="polite">
        {announce}
      </div>

      <SettingsDialog
        open={panel === 'settings'}
        onClose={() => setPanel(null)}
        settings={settings}
        timer={timer}
        onChange={controller.updateSettings}
        tasks={tasks}
        log={log}
        now={now}
        onStartFresh={(opts) => {
          controller.startFresh(opts)
          taskStore.clearAll()
          setStudyId(null)
        }}
        onRestore={(backup) => {
          controller.updateSettings(backup.settings)
          return { sessions: controller.importSessions(backup.log), todos: taskStore.importTasks(backup.tasks) }
        }}
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
      <TodoDialog open={panel === 'tasks'} onClose={() => setPanel(null)} tasks={tasks} {...todoHandlers} />
      <ShortcutsDialog open={panel === 'help'} onClose={() => setPanel(null)} />
      {pip.container && createPortal(<MiniTimer data={mini} onAction={() => (completedTimer ? startNext(upcomingMode) : toggle())} />, pip.container)}
    </div>
  )
}
