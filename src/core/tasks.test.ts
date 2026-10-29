import { describe, expect, it } from 'vitest'
import { KEYS, memoryStorage } from './storage'
import { TaskStore } from './taskStore'
import { MAX_TASKS, MAX_TASK_LENGTH, addTask, clearDone, cleanTaskText, openCount, removeTask, sanitizeTasks, toggleTask } from './tasks'

const NOW = 1_700_000_000_000

describe('task list logic', () => {
  it('adds to the end and trims and collapses whitespace', () => {
    let t = addTask([], '  Read chapter\n 4  ', NOW, 'a')
    t = addTask(t, 'Past paper', NOW + 1, 'b')
    expect(t.map((x) => x.text)).toEqual(['Read chapter 4', 'Past paper'])
    expect(t[0]).toEqual({ id: 'a', text: 'Read chapter 4', done: false, createdAt: NOW, doneAt: null })
  })

  it('ignores empty text and keeps the same array', () => {
    const t = addTask([], 'x', NOW, 'a')
    expect(addTask(t, '   \n ', NOW)).toBe(t)
  })

  it('caps the length of one task and the number of tasks', () => {
    expect(cleanTaskText('a'.repeat(500))).toHaveLength(MAX_TASK_LENGTH)
    let t = [] as ReturnType<typeof addTask>
    for (let i = 0; i < MAX_TASKS + 5; i++) t = addTask(t, `task ${i}`, NOW, `id${i}`)
    expect(t).toHaveLength(MAX_TASKS)
  })

  it('toggles done with a timestamp, and back', () => {
    let t = addTask([], 'x', NOW, 'a')
    t = toggleTask(t, 'a', NOW + 5)
    expect(t[0]).toMatchObject({ done: true, doneAt: NOW + 5 })
    t = toggleTask(t, 'a', NOW + 9)
    expect(t[0]).toMatchObject({ done: false, doneAt: null })
  })

  it('an unknown id changes nothing', () => {
    const t = addTask([], 'x', NOW, 'a')
    expect(toggleTask(t, 'zzz', NOW)).toBe(t)
    expect(removeTask(t, 'zzz')).toBe(t)
  })

  it('removes one task, and clears only the finished ones', () => {
    let t = addTask(addTask(addTask([], 'a', NOW, '1'), 'b', NOW, '2'), 'c', NOW, '3')
    t = toggleTask(t, '2', NOW)
    expect(clearDone(t).map((x) => x.id)).toEqual(['1', '3'])
    expect(removeTask(t, '1').map((x) => x.id)).toEqual(['2', '3'])
    expect(openCount(t)).toBe(2)
    const none = addTask([], 'a', NOW, '1')
    expect(clearDone(none)).toBe(none)
  })
})

describe('reading tasks from storage', () => {
  it('keeps valid tasks and drops everything else', () => {
    const out = sanitizeTasks([
      { id: 'a', text: ' fine ', done: true, createdAt: 5, doneAt: 9 },
      { id: 'a', text: 'duplicate id' },
      { id: 'b', text: '   ' },
      { id: 'c' },
      { text: 'no id' },
      null,
      'nope',
      { id: 'd', text: 'x', done: 'yes', createdAt: 'later', doneAt: 4 },
    ])
    expect(out.map((t) => t.id)).toEqual(['a', 'd'])
    expect(out[0]).toEqual({ id: 'a', text: 'fine', done: true, createdAt: 5, doneAt: 9 })
    expect(out[1]).toEqual({ id: 'd', text: 'x', done: false, createdAt: 0, doneAt: null })
  })

  it('returns an empty list for anything that is not an array', () => {
    expect(sanitizeTasks(null)).toEqual([])
    expect(sanitizeTasks({ a: 1 })).toEqual([])
    expect(sanitizeTasks('x')).toEqual([])
  })

  it('never loads more than the cap', () => {
    const many = Array.from({ length: MAX_TASKS + 20 }, (_, i) => ({ id: `i${i}`, text: `t${i}` }))
    expect(sanitizeTasks(many)).toHaveLength(MAX_TASKS)
  })
})

describe('TaskStore', () => {
  const make = (storage = memoryStorage()) => {
    let now = NOW
    return { storage, store: new TaskStore({ storage, clock: () => now }), tick: (ms: number) => (now += ms) }
  }

  it('saves every change and restores it', () => {
    const h = make()
    h.store.add('Revise filters')
    h.store.add('Do problem set')
    const id = h.store.getSnapshot()[0].id
    h.store.toggle(id)
    const again = new TaskStore({ storage: h.storage })
    expect(again.getSnapshot().map((t) => [t.text, t.done])).toEqual([
      ['Revise filters', true],
      ['Do problem set', false],
    ])
  })

  it('notifies subscribers, and not for a change that does nothing', () => {
    const h = make()
    let calls = 0
    const off = h.store.subscribe(() => calls++)
    h.store.add('one')
    h.store.add('   ')
    h.store.remove('missing')
    h.store.clearDone()
    expect(calls).toBe(1)
    off()
    h.store.add('two')
    expect(calls).toBe(1)
  })

  it('gives a new array only when something changed', () => {
    const h = make()
    h.store.add('one')
    const before = h.store.getSnapshot()
    h.store.clearDone()
    expect(h.store.getSnapshot()).toBe(before)
  })

  it('survives corrupt storage', () => {
    const storage = memoryStorage()
    storage.setItem(KEYS.tasks, '{not json')
    expect(new TaskStore({ storage }).getSnapshot()).toEqual([])
  })

  it('still works when storage refuses to save', () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('full')
      },
      removeItem: () => {},
    }
    const store = new TaskStore({ storage })
    store.add('kept in memory')
    expect(store.getSnapshot()).toHaveLength(1)
  })
})
