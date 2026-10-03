import { getMe, saveMe, type Me } from './identity'

/**
 * Progress backup. Everything that makes up "your game" on this device is sent to the server
 * under your anonymous id after each game, so a save code can bring it back on another phone.
 */
const PREFIX = 'wordx:v1:'
/** Progress and settings — not per-game sessions, which are only useful on the device they started on. */
const KEYS = ['journey', 'stats', 'activity', 'contrast', 'timer', 'onboarded']

function snapshot(me: Me) {
  const data: Record<string, unknown> = { name: me.name }
  for (const k of KEYS) {
    try {
      const raw = localStorage.getItem(PREFIX + k)
      if (raw != null) data[k] = JSON.parse(raw)
    } catch {
      // Skip anything unreadable.
    }
  }
  return data
}

let pending: number | undefined

/** Backs up shortly after a game ends (batched, and silent if offline). */
export function scheduleBackup() {
  window.clearTimeout(pending)
  pending = window.setTimeout(() => void backupNow(), 1500)
}

export async function backupNow(): Promise<boolean> {
  const me = getMe()
  try {
    const res = await fetch('/api/profile/save', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: me.id, secret: me.secret, data: snapshot(me) }),
    })
    return res.ok
  } catch {
    return false
  }
}

/** "WX-" + id + "-" + secret, split into easy-to-read chunks. */
export function saveCode(me: Me = getMe()): string {
  return `WX-${me.id}-${me.secret}`.toUpperCase().replace(/(.{4})(?=.)/g, '$1 ').trim()
}

function parseCode(code: string): { id: string; secret: string } | null {
  const m = /^WX-?([a-z0-9]{6,32})-([a-z0-9]{16,128})$/.exec(code.toLowerCase().replace(/\s+/g, ''))
  return m ? { id: m[1], secret: m[2] } : null
}

/** Replaces this device's progress with the progress behind a save code. */
export async function restoreFromCode(code: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = parseCode(code)
  if (!parsed) return { ok: false, error: 'That doesn’t look like a save code' }
  try {
    const res = await fetch('/api/profile/load', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(parsed),
    })
    const body = await res.json()
    if (!res.ok) return { ok: false, error: body.error ?? 'Couldn’t restore' }
    const data = body.data as Record<string, unknown>
    for (const k of KEYS) {
      if (k in data) localStorage.setItem(PREFIX + k, JSON.stringify(data[k]))
      else localStorage.removeItem(PREFIX + k)
    }
    saveMe({ id: parsed.id, secret: parsed.secret, name: typeof data.name === 'string' ? data.name : '' })
    return { ok: true }
  } catch {
    return { ok: false, error: 'You’re offline' }
  }
}
