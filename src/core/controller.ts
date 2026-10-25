import { appendEntry, dayKey } from './stats'
import {
  KEYS,
  loadLog,
  loadSettings,
  loadTimer,
  sanitizeLog,
  sanitizeSettings,
  sanitizeTimer,
  save,
  type StorageLike,
} from './storage'
import {
  applySettingsToPhase,
  beginNext,
  createPhase,
  earlyEntry,
  evaluate,
  getRemaining,
  pause,
  reset,
  shouldAutoAdvance,
  start,
  switchMode,
  touch,
} from './timer'
import type { LogEntry, Mode, Settings, TimerEvent, TimerState } from './types'

export interface Snapshot {
  timer: TimerState
  settings: Settings
  log: LogEntry[]
  /** Clock reading used for this snapshot. Components derive remaining time from it. */
  now: number
  /** One-off message such as "finished while you were away". */
  notice: string | null
}

type CompletedEvent = Extract<TimerEvent, { type: 'completed' }>

export interface ControllerOptions {
  storage: StorageLike
  clock?: () => number
  /** Called once per completed phase. Not called for silent completions. */
  onCompleted?: (event: CompletedEvent, settings: Settings) => void
}

const HEARTBEAT_MS = 5_000
const TICK_MS = 250

/**
 * Owns timer, settings and log. Framework agnostic so the behavior can be
 * tested without a DOM. The UI reads snapshots and calls the action methods.
 */
export class TimerController {
  private timer: TimerState
  private settings: Settings
  private log: LogEntry[]
  private notice: string | null = null
  private snapshot: Snapshot
  private listeners = new Set<() => void>()
  private readonly storage: StorageLike
  private readonly clock: () => number
  private readonly onCompleted?: ControllerOptions['onCompleted']
  private written: Record<string, string | null> = {}
  private lastKey = ''
  private timerId: ReturnType<typeof setInterval> | null = null

  constructor(opts: ControllerOptions) {
    this.storage = opts.storage
    this.clock = opts.clock ?? Date.now
    this.onCompleted = opts.onCompleted
    const now = this.clock()
    this.settings = loadSettings(this.storage)
    this.log = loadLog(this.storage)
    this.timer = loadTimer(this.storage) ?? createPhase('focus', this.settings, now)
    this.snapshot = this.buildSnapshot(now)
    this.restore(now)
  }

  // ---- store plumbing -------------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): Snapshot => this.snapshot

  private buildSnapshot(now: number): Snapshot {
    return { timer: this.timer, settings: this.settings, log: this.log, now, notice: this.notice }
  }

  private publish(now = this.clock()) {
    this.snapshot = this.buildSnapshot(now)
    this.lastKey = this.displayKey(now)
    this.listeners.forEach((l) => l())
  }

  private displayKey(now: number): string {
    const sec = Math.ceil(getRemaining(this.timer, now) / 1000)
    return `${this.timer.phaseId}|${this.timer.status}|${sec}|${dayKey(now)}`
  }

  private persistTimer() {
    this.write(KEYS.timer, this.timer)
  }

  private write(key: string, value: unknown) {
    const json = JSON.stringify(value)
    if (this.written[key] === json) return
    const out = save(this.storage, key, value)
    if (out !== null) this.written[key] = out
  }

  // ---- restore and sync -----------------------------------------------

  /** Runs once at construction. Never plays sounds or auto-starts anything. */
  private restore(now: number) {
    const before = this.timer
    if (before.status === 'running') {
      const res = evaluate(before, now, { silent: true })
      if (res.event) {
        this.applyCompletion(res.state, res.event, now)
        this.notice = 'Your session finished while LumaFlow was closed.'
      } else {
        this.timer = touch(before, now)
        this.notice = 'Welcome back. Your session kept running while you were away.'
      }
    } else if (before.status === 'paused') {
      this.notice = 'Welcome back. Your session is paused where you left it.'
    } else if (before.status === 'completed') {
      this.notice = null
    }
    this.persistTimer()
    this.write(KEYS.settings, this.settings)
    this.publish(now)
  }

  /** Adopts changes made by another tab. */
  private onStorage = (e: StorageEvent) => {
    if (e.storageArea && e.storageArea !== (globalThis as { localStorage?: Storage }).localStorage) return
    const now = this.clock()
    if (e.key === KEYS.timer || e.key === null) {
      const t = sanitizeTimer(this.parse(e.newValue))
      if (t) {
        this.written[KEYS.timer] = e.newValue
        this.timer = t
      }
    }
    if (e.key === KEYS.settings || e.key === null) {
      this.settings = sanitizeSettings(this.parse(e.newValue))
      this.written[KEYS.settings] = e.newValue
    }
    if (e.key === KEYS.log || e.key === null) {
      this.log = sanitizeLog(this.parse(e.newValue))
      this.written[KEYS.log] = e.newValue
    }
    this.publish(now)
  }

  private parse(v: string | null): unknown {
    try {
      return v === null ? null : JSON.parse(v)
    } catch {
      return null
    }
  }

  // ---- ticking --------------------------------------------------------

  /** Attach clock-driven updates and page lifecycle listeners. Returns a cleanup. */
  attach(): () => void {
    if (this.timerId !== null) return () => {}
    this.timerId = setInterval(() => this.tick(), TICK_MS)
    const wake = () => this.tick(true)
    const hide = () => {
      if (document.visibilityState === 'hidden') this.flush()
    }
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('focus', wake)
    window.addEventListener('pageshow', wake)
    window.addEventListener('online', wake)
    document.addEventListener('visibilitychange', hide)
    window.addEventListener('pagehide', this.flush)
    window.addEventListener('storage', this.onStorage)
    return () => {
      if (this.timerId !== null) clearInterval(this.timerId)
      this.timerId = null
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('focus', wake)
      window.removeEventListener('pageshow', wake)
      window.removeEventListener('online', wake)
      document.removeEventListener('visibilitychange', hide)
      window.removeEventListener('pagehide', this.flush)
      window.removeEventListener('storage', this.onStorage)
    }
  }

  private flush = () => {
    this.timer = touch(this.timer, this.clock())
    this.persistTimer()
  }

  /**
   * Re-derives everything from the clock. Correctness never depends on how
   * often this runs: it only decides when to tell the UI.
   */
  tick(force = false) {
    const now = this.clock()
    const res = evaluate(this.timer, now)
    if (res.event) {
      this.applyCompletion(res.state, res.event, now)
      this.persistTimer()
      this.publish(now)
      return
    }
    if (this.timer.status === 'running' && now - this.timer.lastSeenAt >= HEARTBEAT_MS) {
      this.timer = touch(this.timer, now)
      this.persistTimer()
    }
    if (force || this.displayKey(now) !== this.lastKey) this.publish(now)
  }

  // ---- completion -----------------------------------------------------

  private applyCompletion(state: TimerState, event: CompletedEvent, now: number) {
    this.timer = state
    if (event.entry) this.recordEntry(event.entry)
    if (!event.silent) {
      this.notice = null
      this.onCompleted?.(event, this.settings)
    } else if (event.away) {
      this.notice = 'Your session finished while you were away.'
    }
    if (shouldAutoAdvance(state, this.settings, event)) {
      this.timer = beginNext(state, this.settings, now, { startNow: true, auto: true })
    }
  }

  private recordEntry(entry: LogEntry) {
    const next = appendEntry(this.log, entry)
    if (next !== this.log) {
      this.log = next
      this.write(KEYS.log, this.log)
    }
  }

  // ---- actions --------------------------------------------------------

  private act(next: TimerState, opts: { entry?: LogEntry | null } = {}) {
    if (opts.entry) this.recordEntry(opts.entry)
    this.timer = next
    this.notice = null
    this.persistTimer()
    this.publish()
  }

  start = () => {
    const now = this.clock()
    if (this.timer.status === 'completed') {
      this.act(beginNext(this.timer, this.settings, now, { startNow: true }))
      return
    }
    this.act(start(this.timer, now))
  }

  pause = () => this.act(pause(this.timer, this.clock()))

  toggle = () => {
    if (this.timer.status === 'running') this.pause()
    else this.start()
  }

  /** Abandons the current phase. Focus time already spent is logged as ended early. */
  reset = () => {
    const now = this.clock()
    this.act(reset(this.timer, this.settings, now), { entry: earlyEntry(this.timer, now) })
  }

  switchMode = (mode: Mode) => {
    const now = this.clock()
    if (mode === this.timer.mode && this.timer.status !== 'completed') return
    this.act(switchMode(this.timer, mode, this.settings, now), { entry: earlyEntry(this.timer, now) })
  }

  /** From a completed phase: start a specific next phase. */
  startNext = (mode?: Mode) => {
    const now = this.clock()
    this.act(beginNext(this.timer, this.settings, now, { mode, startNow: true }))
  }

  /** From a completed phase: stop here and return to an idle focus phase. */
  finish = () => {
    this.act(beginNext(this.timer, this.settings, this.clock(), { mode: 'focus' }))
  }

  setTopic = (topic: string) => {
    this.timer = { ...this.timer, topic: topic.slice(0, 200) }
    this.persistTimer()
    this.publish()
  }

  updateSettings = (patch: Partial<Settings>) => {
    const settings = sanitizeSettings({ ...this.settings, ...patch })
    this.settings = settings
    this.write(KEYS.settings, settings)
    this.timer = applySettingsToPhase(this.timer, settings)
    this.persistTimer()
    this.publish()
  }

  setReviewNext = (id: string, text: string) => {
    const value = text.slice(0, 300)
    this.log = this.log.map((e) => {
      if (e.id !== id) return e
      const { reviewNext: _old, ...rest } = e
      return value.trim() ? { ...rest, reviewNext: value } : rest
    })
    this.write(KEYS.log, this.log)
    this.publish()
  }

  deleteEntry = (id: string) => {
    this.log = this.log.filter((e) => e.id !== id)
    this.write(KEYS.log, this.log)
    this.publish()
  }

  clearLog = () => {
    this.log = []
    this.write(KEYS.log, this.log)
    this.publish()
  }

  dismissNotice = () => {
    if (this.notice === null) return
    this.notice = null
    this.publish()
  }
}
