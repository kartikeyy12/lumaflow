import { useRef, useState } from 'react'
import {
  MAX_BACKUP_BYTES,
  backupFileName,
  buildBackup,
  csvFileName,
  mergeLogs,
  mergeTasks,
  parseBackup,
  sessionsToCsv,
  type Backup,
} from '../core/backup'
import type { Task } from '../core/tasks'
import type { LogEntry, Settings } from '../core/types'
import { downloadText } from '../feedback/download'

interface Props {
  settings: Settings
  tasks: Task[]
  log: LogEntry[]
  now: number
  /** Applies a backup and returns how many sessions and to-do items it added. */
  onRestore: (backup: Backup) => { sessions: number; todos: number }
  /** Clears history, to-dos and the timer. Settings only when asked. */
  onStartFresh: (opts: { settings: boolean }) => void
}

type Status =
  | { kind: 'none' }
  | { kind: 'error'; text: string }
  | { kind: 'done'; text: string }
  | { kind: 'confirm'; backup: Backup; sessions: number; todos: number }
  | { kind: 'fresh' }

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export function DataSection({ settings, tasks, log, now, onRestore, onStartFresh }: Props) {
  const [status, setStatus] = useState<Status>({ kind: 'none' })
  const [alsoSettings, setAlsoSettings] = useState(false)
  const picker = useRef<HTMLInputElement>(null)

  const choose = async (file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_BACKUP_BYTES) {
      setStatus({ kind: 'error', text: 'That file is too large to be a LumaFlow backup.' })
      return
    }
    let text: string
    try {
      text = await file.text()
    } catch {
      setStatus({ kind: 'error', text: 'That file could not be read.' })
      return
    }
    const parsed = parseBackup(text)
    if (!parsed.ok) {
      setStatus({ kind: 'error', text: parsed.error })
      return
    }
    const { backup } = parsed
    setStatus({
      kind: 'confirm',
      backup,
      sessions: mergeLogs(log, backup.log).added,
      todos: mergeTasks(tasks, backup.tasks).added,
    })
  }

  return (
    <section className="set-group" aria-labelledby="set-data">
      <h3 id="set-data">Your data</h3>
      <p className="muted small">
        Everything is kept in this browser only. Clearing site data removes it, so download a backup now and then.
      </p>
      <div className="data-actions">
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => downloadText(backupFileName(now), JSON.stringify(buildBackup(settings, tasks, log, now), null, 2), 'application/json')}
        >
          Download backup
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => downloadText(csvFileName(now), sessionsToCsv(log), 'text/csv')}
          disabled={log.length === 0}
        >
          Sessions as CSV
        </button>
        <button type="button" className="btn btn-sm btn-quiet" onClick={() => picker.current?.click()}>
          Restore from backup
        </button>
        <button
          type="button"
          className="btn btn-sm btn-quiet"
          onClick={() => {
            setAlsoSettings(false)
            setStatus({ kind: 'fresh' })
          }}
        >
          Start fresh
        </button>
        <input
          ref={picker}
          type="file"
          accept=".json,application/json"
          className="sr-only"
          tabIndex={-1}
          aria-label="Backup file"
          onChange={(e) => {
            void choose(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </div>

      <div role="status" aria-live="polite" className="data-status">
        {status.kind === 'error' && <p className="small data-error">{status.text}</p>}
        {status.kind === 'done' && <p className="small">{status.text}</p>}
        {status.kind === 'fresh' && (
          <div className="data-confirm">
            <p className="small">
              This clears your history, your to-do list and the timer, so everything starts again from zero. It cannot be undone, so download a
              backup first if you might want any of it back.
            </p>
            <label className="check-line small">
              <input type="checkbox" checked={alsoSettings} onChange={(e) => setAlsoSettings(e.target.checked)} />
              <span>Also put settings back to their defaults (session lengths, daily goal, sound)</span>
            </label>
            <div className="data-actions">
              <button
                type="button"
                className="btn btn-sm btn-warn"
                onClick={() => {
                  onStartFresh({ settings: alsoSettings })
                  setStatus({ kind: 'done', text: alsoSettings ? 'Everything is back to zero, settings included.' : 'Everything is back to zero. Your settings were kept.' })
                }}
              >
                Yes, start fresh
              </button>
              <button type="button" className="btn btn-sm btn-quiet" onClick={() => setStatus({ kind: 'none' })}>
                Cancel
              </button>
            </div>
          </div>
        )}
        {status.kind === 'confirm' && (
          <div className="data-confirm">
            <p className="small">
              {status.sessions + status.todos === 0
                ? 'Everything in this backup is already here. Your settings would be replaced by the ones in the file.'
                : `This adds ${plural(status.sessions, 'session')} and ${plural(status.todos, 'to-do item')} that are not here yet. Your settings will be replaced by the ones in the file.`}
            </p>
            <div className="data-actions">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  const r = onRestore(status.backup)
                  setStatus({ kind: 'done', text: `Restored. Added ${plural(r.sessions, 'session')} and ${plural(r.todos, 'to-do item')}.` })
                }}
              >
                Restore
              </button>
              <button type="button" className="btn btn-sm btn-quiet" onClick={() => setStatus({ kind: 'none' })}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
