import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { TimerController } from '../core/controller'
import { MODE_LABEL, formatClock, formatElapsed } from '../core/format'
import { getBrowserStorage } from '../core/storage'
import { swElapsed } from '../core/stopwatch'
import { getRemaining } from '../core/timer'
import { playChime } from '../feedback/chime'
import { notifyCompleted } from '../feedback/notify'

export function createAppController(): TimerController {
  return new TimerController({
    storage: getBrowserStorage(),
    onCompleted: (event, settings) => {
      if (settings.sound) playChime(settings.volume)
      if (settings.notifications) notifyCompleted(event.mode, event.entry?.id ?? event.mode)
    },
  })
}

export function useTimer(controller: TimerController) {
  const snap = useSyncExternalStore(controller.subscribe, controller.getSnapshot)

  useEffect(() => controller.attach(), [controller])

  // Keep the tab title useful when the window is in the background.
  const { timer, stopwatch, view, now } = snap
  const remaining = getRemaining(timer, now)
  const elapsed = swElapsed(stopwatch, now)
  useEffect(() => {
    if (view === 'stopwatch') {
      if (stopwatch.status === 'running') document.title = `${formatElapsed(elapsed)} · Stopwatch · LumaFlow`
      else if (stopwatch.status === 'paused') document.title = `Paused ${formatElapsed(elapsed)} · LumaFlow`
      else document.title = 'LumaFlow'
      return
    }
    const label = MODE_LABEL[timer.mode]
    if (timer.status === 'running') document.title = `${formatClock(remaining)} · ${label} · LumaFlow`
    else if (timer.status === 'paused') document.title = `Paused ${formatClock(remaining)} · LumaFlow`
    else if (timer.status === 'completed') document.title = `${label} complete · LumaFlow`
    else document.title = 'LumaFlow'
  }, [view, stopwatch.status, timer.status, timer.mode, remaining, elapsed])

  return useMemo(() => ({ ...snap, remaining, elapsed }), [snap, remaining, elapsed])
}
