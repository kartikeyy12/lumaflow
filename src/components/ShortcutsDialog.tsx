import { Modal } from './Modal'

export const SHORTCUTS: Array<{ keys: string; action: string }> = [
  { keys: 'Space', action: 'Start, pause or resume' },
  { keys: 'R', action: 'Reset, or finish the stopwatch (press twice mid-session)' },
  { keys: '1', action: 'Focus' },
  { keys: '2', action: 'Short break' },
  { keys: '3', action: 'Long break' },
  { keys: '4', action: 'Stopwatch' },
  { keys: 'B', action: 'Next background' },
  { keys: 'M', action: 'Background sound on or off' },
  { keys: 'T', action: 'To-do list: open it and start typing' },
  { keys: 'P', action: 'Small floating timer, to see the clock while you work in another window' },
  { keys: 'F', action: 'Toggle full screen' },
  { keys: '?', action: 'Show this list' },
  { keys: 'Esc', action: 'Cancel a pending reset or close a panel' },
]

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} title="Keyboard shortcuts" onClose={onClose}>
      <table className="shortcuts">
        <tbody>
          {SHORTCUTS.map((s) => (
            <tr key={s.keys}>
              <th scope="row">
                <kbd>{s.keys}</kbd>
              </th>
              <td>{s.action}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">
        Shortcuts pause while you type in a field. When a button has focus, Space presses that button instead.
      </p>
    </Modal>
  )
}
