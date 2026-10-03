/**
 * Who you are to the game server: a random id plus a secret only this device knows,
 * so nobody else can play as you in a room. Your display name travels with it.
 */
export interface Me {
  id: string
  secret: string
  name: string
}

const KEY = 'wordx:v1:me'

const random = (bytes: number) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => (b % 36).toString(36)).join('')

export function getMe(): Me {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Me> | null
    if (saved?.id && saved.secret) return { id: saved.id, secret: saved.secret, name: saved.name ?? '' }
    if (saved?.id) {
      // Upgrade an identity from before secrets existed.
      const upgraded = { id: saved.id, secret: random(24), name: saved.name ?? '' }
      saveMe(upgraded)
      return upgraded
    }
  } catch {
    // Fall through to a fresh identity.
  }
  const me = { id: random(10), secret: random(24), name: '' }
  saveMe(me)
  return me
}

export function saveMe(me: Me) {
  try {
    localStorage.setItem(KEY, JSON.stringify(me))
  } catch {
    // Without storage you get a fresh identity next visit; the game still works now.
  }
}
