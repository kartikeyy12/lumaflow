import { useState } from 'react'
import type { Task } from '../core/tasks'
import { MAX_TASKS, MAX_TASK_LENGTH } from '../core/tasks'
import { IconClose } from './icons'
import { Modal } from './Modal'

interface Props {
  open: boolean
  onClose: () => void
  tasks: Task[]
  onAdd: (text: string) => void
  onToggle: (id: string) => void
  onRemove: (id: string) => void
  onClearDone: () => void
  /** Puts the task in the "Studying" field and closes the panel. */
  onFocusOn: (text: string) => void
}

export function TasksDialog({ open, onClose, tasks, onAdd, onToggle, onRemove, onClearDone, onFocusOn }: Props) {
  const [draft, setDraft] = useState('')
  const open_ = tasks.filter((t) => !t.done)
  const done = tasks.filter((t) => t.done)
  const full = tasks.length >= MAX_TASKS

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!draft.trim() || full) return
    onAdd(draft)
    setDraft('')
  }

  return (
    <Modal open={open} title="Tasks" onClose={onClose}>
      <form className="task-add" onSubmit={submit}>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={MAX_TASK_LENGTH}
          placeholder={full ? 'The list is full' : 'Add a task and press Enter'}
          aria-label="New task"
          autoComplete="off"
          spellCheck={false}
          disabled={full}
          autoFocus
        />
      </form>

      {tasks.length === 0 ? (
        <p className="muted task-empty">Nothing here yet. Add what you want to get through today.</p>
      ) : (
        <>
          <ul className="tasks" data-testid="tasks">
            {[...open_, ...done].map((t) => (
              <li key={t.id} className={`task${t.done ? ' task-done' : ''}`}>
                <input
                  id={`task-${t.id}`}
                  type="checkbox"
                  checked={t.done}
                  onChange={() => onToggle(t.id)}
                  aria-label={t.text}
                />
                <label htmlFor={`task-${t.id}`} className="task-text">
                  {t.text}
                </label>
                {!t.done && (
                  <button type="button" className="btn btn-sm btn-quiet" onClick={() => onFocusOn(t.text)} aria-label={`Study this: ${t.text}`}>
                    Study this
                  </button>
                )}
                <button type="button" className="icon-btn icon-btn-sm" onClick={() => onRemove(t.id)} aria-label={`Delete ${t.text}`}>
                  <IconClose />
                </button>
              </li>
            ))}
          </ul>
          <div className="task-foot">
            <span className="muted small" role="status">
              {open_.length} to do{done.length > 0 ? `, ${done.length} done` : ''}
            </span>
            {done.length > 0 && (
              <button type="button" className="btn btn-sm btn-quiet" onClick={onClearDone}>
                Clear done
              </button>
            )}
          </div>
        </>
      )}
    </Modal>
  )
}
