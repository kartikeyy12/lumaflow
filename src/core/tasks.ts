import { newId } from './timer'

export interface Task {
  id: string
  text: string
  done: boolean
  createdAt: number
  doneAt: number | null
}

export const MAX_TASKS = 100
export const MAX_TASK_LENGTH = 200

/** Collapses whitespace so a pasted line with breaks still reads as one task. */
export function cleanTaskText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_TASK_LENGTH)
}

/** Adds to the end of the list. Empty text, or a full list, changes nothing. */
export function addTask(tasks: Task[], text: string, now: number, id: string = newId()): Task[] {
  const clean = cleanTaskText(text)
  if (!clean || tasks.length >= MAX_TASKS) return tasks
  return [...tasks, { id, text: clean, done: false, createdAt: now, doneAt: null }]
}

export function toggleTask(tasks: Task[], id: string, now: number): Task[] {
  if (!tasks.some((t) => t.id === id)) return tasks
  return tasks.map((t) => (t.id === id ? { ...t, done: !t.done, doneAt: t.done ? null : now } : t))
}

export function removeTask(tasks: Task[], id: string): Task[] {
  return tasks.some((t) => t.id === id) ? tasks.filter((t) => t.id !== id) : tasks
}

export function clearDone(tasks: Task[]): Task[] {
  return tasks.some((t) => t.done) ? tasks.filter((t) => !t.done) : tasks
}

export const openCount = (tasks: Task[]) => tasks.filter((t) => !t.done).length

/** Reads whatever was in storage and keeps only what is a valid task. */
export function sanitizeTasks(raw: unknown): Task[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: Task[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const r = item as Record<string, unknown>
    if (typeof r.id !== 'string' || !r.id || seen.has(r.id)) continue
    if (typeof r.text !== 'string') continue
    const text = cleanTaskText(r.text)
    if (!text) continue
    const done = r.done === true
    const createdAt = typeof r.createdAt === 'number' && Number.isFinite(r.createdAt) ? r.createdAt : 0
    const doneAt = done && typeof r.doneAt === 'number' && Number.isFinite(r.doneAt) ? r.doneAt : null
    seen.add(r.id)
    out.push({ id: r.id.slice(0, 80), text, done, createdAt, doneAt })
    if (out.length >= MAX_TASKS) break
  }
  return out
}
