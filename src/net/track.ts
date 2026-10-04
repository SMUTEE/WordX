import { getMe } from './identity'

/**
 * Anonymous usage events for the stats page: the device's random id, the username if one was
 * claimed, and what happened in the game. Fire-and-forget; it never gets in the way of playing.
 */
export function track(kind: 'open' | 'finish', data: Record<string, unknown> = {}) {
  try {
    const me = getMe()
    const body = JSON.stringify({ kind, player: me.id, name: me.claimed ? me.name : undefined, ...data })
    if (navigator.sendBeacon?.('/api/event', new Blob([body], { type: 'application/json' }))) return
    void fetch('/api/event', { method: 'POST', body, keepalive: true, headers: { 'content-type': 'application/json' } }).catch(() => {})
  } catch {
    // Stats are optional.
  }
}

/** One "open" per visit (per tab session). */
export function trackOpen() {
  try {
    if (sessionStorage.getItem('wordx:opened')) return
    sessionStorage.setItem('wordx:opened', '1')
  } catch {
    // Without session storage, count every load.
  }
  track('open')
}
