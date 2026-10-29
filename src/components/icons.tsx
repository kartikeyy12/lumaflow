import type { SVGProps } from 'react'

const base: SVGProps<SVGSVGElement> = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
}

export const IconSettings = () => (
  <svg {...base}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </svg>
)

export const IconKeyboard = () => (
  <svg {...base}>
    <rect x="3" y="6" width="18" height="12" rx="2.5" />
    <path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10" />
  </svg>
)

export const IconExpand = () => (
  <svg {...base}>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </svg>
)

export const IconCollapse = () => (
  <svg {...base}>
    <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
  </svg>
)

export const IconHistory = () => (
  <svg {...base}>
    <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" />
    <path d="M12 8v4l2.5 2" />
  </svg>
)

export const IconSound = () => (
  <svg {...base}>
    <path d="M4 10v4h3.5L12 18V6L7.5 10H4z" />
    <path d="M15.5 9.2a4 4 0 0 1 0 5.6M18 7a7 7 0 0 1 0 10" />
  </svg>
)

export const IconScene = () => (
  <svg {...base}>
    <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
    <path d="M3.5 15l4.2-4 3.6 3.4 2.6-2.4 6.6 5.6" />
    <circle cx="16.5" cy="9.5" r="1.1" />
  </svg>
)

export const IconCheck = () => (
  <svg {...base} width={16} height={16}>
    <path d="M5 12.5l4.2 4.2L19 7" />
  </svg>
)

export const IconClose = () => (
  <svg {...base} width={16} height={16}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)

export const IconPlay = () => (
  <svg {...base} fill="currentColor" stroke="none" width={16} height={16}>
    <path d="M8 5.5v13l11-6.5z" />
  </svg>
)

export const IconPause = () => (
  <svg {...base} fill="currentColor" stroke="none" width={16} height={16}>
    <rect x="6.5" y="5" width="4" height="14" rx="1.2" />
    <rect x="13.5" y="5" width="4" height="14" rx="1.2" />
  </svg>
)

export const IconReset = () => (
  <svg {...base} width={16} height={16}>
    <path d="M4 12a8 8 0 1 0 2.5-5.8M4 4.5V9h4.5" />
  </svg>
)

export function StateGlyph({ status }: { status: 'idle' | 'running' | 'paused' | 'completed' }) {
  if (status === 'running')
    return (
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className="glyph glyph-run">
        <circle cx="5" cy="5" r="3.2" fill="currentColor" />
      </svg>
    )
  if (status === 'paused')
    return (
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className="glyph">
        <rect x="2" y="1.5" width="2" height="7" rx="0.6" fill="currentColor" />
        <rect x="6" y="1.5" width="2" height="7" rx="0.6" fill="currentColor" />
      </svg>
    )
  if (status === 'completed')
    return (
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className="glyph">
        <path d="M1.8 5.4l2.2 2.2 4.2-4.8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className="glyph">
      <circle cx="5" cy="5" r="3" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

export const IconTasks = () => (
  <svg {...base}>
    <path d="M4.5 7.5l1.6 1.6 2.9-3.1M4.5 16.5l1.6 1.6 2.9-3.1" />
    <path d="M12.5 7.5H20M12.5 16.5H20" />
  </svg>
)
