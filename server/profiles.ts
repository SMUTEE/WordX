import { hashSecret } from './rooms'

/**
 * Progress backups: a player's Journey, stats, streak and settings, stored under their
 * anonymous id and protected by their device secret. No email, no account — the "save code"
 * (id + secret) is what moves progress to another device.
 */
export interface ProfileRecord {
  secretHash: string
  data: string
  updatedAt: number
}

export const PROFILE_MAX_BYTES = 64 * 1024

export interface ProfileRequest {
  id: string
  secret: string
  data?: unknown
}

export type ProfileCheck = { ok: true; id: string; secret: string } | { ok: false; status: number; error: string }

export function checkProfileRequest(body: Partial<ProfileRequest>): ProfileCheck {
  const id = String(body.id ?? '')
  const secret = String(body.secret ?? '')
  if (!/^[a-z0-9]{6,32}$/.test(id) || secret.length < 16 || secret.length > 128) return { ok: false, status: 400, error: 'Bad save code' }
  return { ok: true, id, secret }
}

/** Saving: the first save claims the id; later saves must carry the same secret. */
export function applySave(existing: ProfileRecord | null, secret: string, data: unknown, now: number): { record: ProfileRecord } | { status: number; error: string } {
  if (existing && existing.secretHash !== hashSecret(secret)) return { status: 403, error: 'That save code doesn’t match' }
  const text = JSON.stringify(data ?? {})
  if (text.length > PROFILE_MAX_BYTES) return { status: 413, error: 'Too much data' }
  return { record: { secretHash: hashSecret(secret), data: text, updatedAt: now } }
}

export function applyLoad(existing: ProfileRecord | null, secret: string): { data: unknown; updatedAt: number } | { status: number; error: string } {
  if (!existing) return { status: 404, error: 'No progress saved for that code yet' }
  if (existing.secretHash !== hashSecret(secret)) return { status: 403, error: 'That save code doesn’t match' }
  return { data: JSON.parse(existing.data), updatedAt: existing.updatedAt }
}
