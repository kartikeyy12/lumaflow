export type Mode = 'focus' | 'short' | 'long'

export type Status = 'idle' | 'running' | 'paused' | 'completed'

export type Outcome = 'completed' | 'early'

export interface Settings {
  focusMin: number
  shortMin: number
  longMin: number
  /** A long break is suggested after this many completed focus sessions. */
  longBreakEvery: number
  /** Start the next phase automatically (capped, see MAX_AUTO_CHAIN). */
  autoAdvance: boolean
  sound: boolean
  /** 0 to 1, kept low by default. */
  volume: number
  notifications: boolean
  /** Daily focus goal in minutes. 0 means no goal. */
  dailyGoalMin: number
}

export interface TimerState {
  mode: Mode
  status: Status
  /** Total length of this phase, snapshotted when the phase is created. */
  durationMs: number
  /** Authoritative while idle, paused or completed. Ignored while running. */
  remainingMs: number
  /** Epoch ms at which a running phase ends. Null unless running. */
  targetAt: number | null
  /** Unique per phase instance. Used to de-duplicate completion records. */
  phaseId: string
  topic: string
  /** Focus sessions completed since the last long break. */
  cycle: number
  /** Consecutive automatic phase starts since the last user action. */
  autoChain: number
  /** Last time the app was known to be alive (heartbeat). */
  lastSeenAt: number
  /** Set when status is completed. */
  completedAt: number | null
  /** How the last phase ended, when completed. */
  endedBy: 'finished' | 'away' | null
}

export interface LogEntry {
  /** Same as the phaseId of the focus phase it records. */
  id: string
  endedAt: number
  /** Focus time credited, in ms. */
  durationMs: number
  plannedMs: number
  outcome: Outcome
  topic: string
  /** True when the timer ran out while the app was closed or the device asleep. */
  away?: boolean
  /** Optional note on what to review next, added after the session. */
  reviewNext?: string
}

export type TimerEvent =
  | {
      type: 'completed'
      mode: Mode
      /** The app was not running when the phase ended. */
      away: boolean
      /** No sound, notification or auto-advance should follow this event. */
      silent: boolean
      entry: LogEntry | null
    }
