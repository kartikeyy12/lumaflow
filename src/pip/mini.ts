import type { SceneId, Status } from '../core/types'

/** Everything the small floating timer shows. */
export interface MiniData {
  label: string
  clock: string
  /** What a screen reader announces for the clock. */
  spoken: string
  status: Status
  /** Text of the one button: Start, Pause, Resume, or the next phase once one ends. */
  action: string
  /** True when the button should show a pause symbol. */
  running: boolean
  scene: SceneId
}

export const STATUS_TEXT: Record<Status, string> = {
  idle: 'Ready',
  running: 'Running',
  paused: 'Paused',
  completed: 'Complete',
}
