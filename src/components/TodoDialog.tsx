import type { Task } from '../core/tasks'
import { Modal } from './Modal'
import { TodoList, type TodoHandlers } from './TodoList'

interface Props extends TodoHandlers {
  open: boolean
  onClose: () => void
  tasks: Task[]
}

/** The same list in a dialog, for screens too narrow to keep it beside the timer. */
export function TodoDialog({ open, onClose, tasks, ...handlers }: Props) {
  return (
    <Modal open={open} title="To-do" onClose={onClose}>
      <TodoList tasks={tasks} autoFocus {...handlers} />
    </Modal>
  )
}
