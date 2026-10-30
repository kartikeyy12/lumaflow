import type { MiniData } from '../pip/mini'
import { STATUS_TEXT } from '../pip/mini'
import { IconPause, IconPlay } from './icons'

/** The small floating timer: the clock and one button. */
export function MiniTimer({ data, onAction }: { data: MiniData; onAction: () => void }) {
  return (
    <div className="mini" data-scene={data.scene} data-status={data.status} data-testid="mini-timer">
      <div className="mini-label">{data.label}</div>
      <div className="mini-clock" role="timer" aria-label={data.spoken}>
        {data.clock}
      </div>
      <div className="mini-status">{STATUS_TEXT[data.status]}</div>
      <button type="button" className="btn btn-primary mini-btn" onClick={onAction}>
        {data.running ? <IconPause /> : <IconPlay />}
        <span>{data.action}</span>
      </button>
    </div>
  )
}
