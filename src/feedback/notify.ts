import { MODE_LABEL } from '../core/format'
import type { Mode } from '../core/types'

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return notificationsSupported() ? Notification.permission : 'unsupported'
}

/** Must be called from a user gesture. Resolves to the resulting permission. */
export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported'
  try {
    return await Notification.requestPermission()
  } catch {
    return Notification.permission
  }
}

/**
 * Shows at most one notification per phase (the tag replaces duplicates), and
 * only when the page is not already in front of the user.
 */
export function notifyCompleted(mode: Mode, phaseId: string) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return
  if (document.visibilityState === 'visible' && document.hasFocus()) return
  try {
    const title = mode === 'focus' ? 'Focus session complete' : `${MODE_LABEL[mode]} over`
    const body = mode === 'focus' ? 'Time for a break whenever you are ready.' : 'Ready for the next session when you are.'
    new Notification(title, { body, tag: `lumaflow-${phaseId}`, silent: true })
  } catch {
    // Some browsers throw outside a secure context. Visual feedback still applies.
  }
}
