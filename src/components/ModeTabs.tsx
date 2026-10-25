import { MODE_LABEL } from '../core/format'
import type { Mode } from '../core/types'

const ORDER: Mode[] = ['focus', 'short', 'long']
const KEY: Record<Mode, string> = { focus: '1', short: '2', long: '3' }

interface Props {
  mode: Mode
  onSelect: (mode: Mode) => void
}

export function ModeTabs({ mode, onSelect }: Props) {
  return (
    <div className="tabs" role="group" aria-label="Timer mode">
      {ORDER.map((m) => (
        <button
          key={m}
          type="button"
          className="tab"
          aria-pressed={mode === m}
          aria-keyshortcuts={KEY[m]}
          onClick={() => onSelect(m)}
        >
          <span>{MODE_LABEL[m]}</span>
          <kbd aria-hidden="true">{KEY[m]}</kbd>
        </button>
      ))}
    </div>
  )
}
