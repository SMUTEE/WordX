import { getMe, saveMe } from './identity'
import { usernameProblem } from './protocol'

export type Availability = { state: 'idle' | 'checking' | 'available' } | { state: 'taken' | 'invalid' | 'offline'; message: string }

/** Is this username free (or already yours)? */
export async function checkUsername(name: string): Promise<Availability> {
  const problem = usernameProblem(name)
  if (problem) return { state: 'invalid', message: problem }
  try {
    const res = await fetch(`/api/username?name=${encodeURIComponent(name)}&id=${encodeURIComponent(getMe().id)}`)
    const body = await res.json()
    if (body.error) return { state: 'invalid', message: body.error }
    return body.available ? { state: 'available' } : { state: 'taken', message: 'That username is taken' }
  } catch {
    return { state: 'offline', message: 'You’re offline' }
  }
}

/** Reserves the username for this device. Your old one, if any, is released. */
export async function claimUsername(name: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = getMe()
  try {
    const res = await fetch('/api/username/claim', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: me.id, secret: me.secret, username: name }),
    })
    const body = await res.json()
    if (!res.ok) return { ok: false, error: body.error ?? 'Couldn’t save that username' }
    saveMe({ ...me, name: body.username, claimed: true })
    return { ok: true }
  } catch {
    return { ok: false, error: 'You’re offline. Try again when you’re connected' }
  }
}
