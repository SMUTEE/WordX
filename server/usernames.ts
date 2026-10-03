import { usernameKey, usernameProblem } from '../src/net/protocol'
import { hashSecret } from './rooms'

/**
 * Unique usernames. A name belongs to one player id, proven by that device's secret.
 * Names are unique regardless of case ("Ada" and "ada" are the same name).
 */
export interface UsernameRecord {
  playerId: string
  secretHash: string
  display: string
  claimedAt: number
}

export interface ClaimRequest {
  id: string
  secret: string
  username: string
}

export function checkClaimRequest(body: Partial<ClaimRequest>): { ok: true; id: string; secret: string; username: string; key: string } | { ok: false; status: number; error: string } {
  const id = String(body.id ?? '')
  const secret = String(body.secret ?? '')
  const username = String(body.username ?? '').trim()
  if (!/^[a-z0-9]{6,32}$/.test(id) || secret.length < 16 || secret.length > 128) return { ok: false, status: 400, error: 'Bad identity' }
  const problem = usernameProblem(username)
  if (problem) return { ok: false, status: 400, error: problem }
  return { ok: true, id, secret, username, key: usernameKey(username) }
}

/** Taking a name: free names can be claimed; your own name can be re-claimed (e.g. new capitals). */
export function applyClaim(existing: UsernameRecord | null, id: string, secret: string, display: string, now: number): { record: UsernameRecord } | { status: number; error: string } {
  if (existing && existing.playerId !== id) return { status: 409, error: 'That username is taken' }
  if (existing && existing.secretHash !== hashSecret(secret)) return { status: 403, error: 'That username is taken' }
  return { record: { playerId: id, secretHash: hashSecret(secret), display, claimedAt: existing?.claimedAt ?? now } }
}

export function isAvailable(existing: UsernameRecord | null, forPlayer?: string) {
  return !existing || existing.playerId === forPlayer
}
