import { useEffect, useRef, useState } from 'react'
import type { Task } from '../core/tasks'
import { MAX_TASKS, MAX_TASK_LENGTH } from '../core/tasks'
import { IconClose } from './icons'

export interface TodoHandlers {
  onAdd: (text: string) => void
  onToggle: (id: string) => void
  onRemove: (id: string) => void
  onClearDone: () => void
  /** Puts the item in the "Studying" field. */
  onFocusOn: (task: Task) => void
}

interface Props extends TodoHandlers {
  tasks: Task[]
  autoFocus?: boolean
  inputId?: string
}

/** The to-do list itself: an input, the items, and a footer. Used inline on wide screens and in a dialog on narrow ones. */
export function TodoList({ tasks, autoFocus, inputId, onAdd, onToggle, onRemove, onClearDone, onFocusOn }: Props) {
  const [draft, setDraft] = useState('')
  const field = useRef<HTMLInputElement>(null)
  // A dialog moves focus itself when it opens, so ask for it a moment later.
  useEffect(() => {
    if (!autoFocus) return
    const id = window.setTimeout(() => field.current?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [autoFocus])
  const left = tasks.filter((t) => !t.done)
  const done = tasks.filter((t) => t.done)
  const full = tasks.length >= MAX_TASKS

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!draft.trim() || full) return
    onAdd(draft)
    setDraft('')
  }

  return (
    <div className="todo-body">
      <form className="todo-add" onSubmit={submit}>
        <input
          id={inputId}
          ref={field}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Hand the keyboard back to the timer shortcuts. What you typed stays.
            if (e.key === 'Escape') e.currentTarget.blur()
          }}
          maxLength={MAX_TASK_LENGTH}
          placeholder={full ? 'The list is full' : 'Add something to do'}
          aria-label="New to-do"
          autoComplete="off"
          spellCheck={false}
          disabled={full}
        />
      </form>

      {tasks.length === 0 ? (
        <p className="muted todo-empty">Nothing on your list yet. Add what you want to get through today.</p>
      ) : (
        <>
          <ul className="todo-items" data-testid="todo-items">
            {[...left, ...done].map((t) => (
              <li key={t.id} className={`todo-item${t.done ? ' todo-done' : ''}`}>
                <input
                  id={`todo-${t.id}`}
                  type="checkbox"
                  checked={t.done}
                  onChange={() => onToggle(t.id)}
                  // After a mouse click, hand the keyboard back so Space starts the timer instead of unticking this.
                  onClick={(e) => {
                    if (e.detail > 0) e.currentTarget.blur()
                  }}
                />
                <label htmlFor={`todo-${t.id}`} className="todo-text">
                  {t.text}
                </label>
                {!t.done && (
                  <button
                    type="button"
                    className="todo-study"
                    onClick={() => onFocusOn(t)}
                    aria-label={`Study this: ${t.text}`}
                    title="Put this in the Studying field"
                  >
                    Study
                  </button>
                )}
                <button type="button" className="icon-btn icon-btn-sm todo-del" onClick={() => onRemove(t.id)} aria-label={`Delete ${t.text}`}>
                  <IconClose />
                </button>
              </li>
            ))}
          </ul>
          <div className="todo-foot">
            <span className="muted small" role="status">
              {left.length === 0 ? 'All done' : `${left.length} left`}
              {done.length > 0 && left.length > 0 ? `, ${done.length} done` : ''}
            </span>
            {done.length > 0 && (
              <button type="button" className="btn btn-sm btn-quiet" onClick={onClearDone}>
                Clear done
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
