import type { Mode } from '../core/types'

export type Tab = Mode | 'stopwatch'

const TABS: Array<{ id: Tab; label: string; short: string; key: string }> = [
  { id: 'focus', label: 'Focus', short: 'Focus', key: '1' },
  { id: 'short', label: 'Short break', short: 'Short', key: '2' },
  { id: 'long', label: 'Long break', short: 'Long', key: '3' },
  { id: 'stopwatch', label: 'Stopwatch', short: 'Stopwatch', key: '4' },
]

interface Props {
  tab: Tab
  onSelect: (tab: Tab) => void
}

export function ModeTabs({ tab, onSelect }: Props) {
  return (
    <div className="tabs" role="group" aria-label="Mode">
      {TABS.map((t) => (
        <span key={t.id} className="tab-slot">
          {t.id === 'stopwatch' && <span className="tab-sep" aria-hidden="true" />}
          <button
            type="button"
            className="tab"
            aria-pressed={tab === t.id}
            aria-label={t.label}
            aria-keyshortcuts={t.key}
            onClick={() => onSelect(t.id)}
          >
            <span className="tab-long" aria-hidden="true">
              {t.label}
            </span>
            <span className="tab-short" aria-hidden="true">
              {t.short}
            </span>
            <kbd aria-hidden="true">{t.key}</kbd>
          </button>
        </span>
      ))}
    </div>
  )
}
