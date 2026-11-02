import { KEYS, save, type StorageLike } from './storage'
import { mergeTasks } from './backup'
import { addTask, clearDone, removeTask, sanitizeTasks, toggleTask, type Task } from './tasks'

interface Options {
  storage: StorageLike
  clock?: () => number
}

/** The to-do list. Small, framework-agnostic, and saved on every change. */
export class TaskStore {
  private tasks: Task[]
  private listeners = new Set<() => void>()
  private lastWritten: string | null = null
  private readonly storage: StorageLike
  private readonly clock: () => number

  constructor({ storage, clock = Date.now }: Options) {
    this.storage = storage
    this.clock = clock
    let parsed: unknown = null
    try {
      const raw = storage.getItem(KEYS.tasks)
      this.lastWritten = raw
      parsed = raw === null ? null : JSON.parse(raw)
    } catch {
      parsed = null
    }
    this.tasks = sanitizeTasks(parsed)
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => void this.listeners.delete(listener)
  }

  getSnapshot = () => this.tasks

  add = (text: string) => this.set(addTask(this.tasks, text, this.clock()))
  toggle = (id: string) => this.set(toggleTask(this.tasks, id, this.clock()))
  remove = (id: string) => this.set(removeTask(this.tasks, id))
  clearDone = () => this.set(clearDone(this.tasks))
  clearAll = () => this.set([])

  /** Adds items from a backup that are not here yet. Returns how many were added. */
  importTasks = (incoming: Task[]): number => {
    const { tasks, added } = mergeTasks(this.tasks, incoming)
    if (added > 0) this.set(tasks)
    return added
  }

  /** Follows changes made in another tab. Returns the cleanup function. */
  attach = () => {
    const onStorage = (e: StorageEvent) => {
      if (e.storageArea && e.storageArea !== (globalThis as { localStorage?: Storage }).localStorage) return
      if (e.key !== KEYS.tasks && e.key !== null) return
      if (e.newValue === this.lastWritten) return
      this.lastWritten = e.newValue
      let parsed: unknown = null
      try {
        parsed = e.newValue === null ? null : JSON.parse(e.newValue)
      } catch {
        parsed = null
      }
      this.tasks = sanitizeTasks(parsed)
      this.emit()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }

  private set(next: Task[]) {
    if (next === this.tasks) return
    this.tasks = next
    const written = save(this.storage, KEYS.tasks, next)
    if (written !== null) this.lastWritten = written
    this.emit()
  }

  private emit() {
    for (const l of this.listeners) l()
  }
}
