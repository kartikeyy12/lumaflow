import { useEffect, useSyncExternalStore } from 'react'
import { getBrowserStorage } from '../core/storage'
import { TaskStore } from '../core/taskStore'

export function createTaskStore(): TaskStore {
  return new TaskStore({ storage: getBrowserStorage() })
}

export function useTasks(store: TaskStore) {
  const tasks = useSyncExternalStore(store.subscribe, store.getSnapshot)
  useEffect(() => store.attach(), [store])
  return tasks
}
