import type { WordEntry } from '../data/words'
import type { BoardSetup, EndReason, Feedback, GameStatus, HintReveal } from '../engine/types'

/**
 * The co-op wire protocol, shared by the server and the app.
 * The server is authoritative: it alone knows the answer, checks turns, scores guesses,
 * and broadcasts a full room snapshot after every change.
 */

export const MAX_PLAYERS = 8
export const ROOM_CODE_LENGTH = 6
export const NAME_MAX = 16

export interface PlayerView {
  id: string
  name: string
  online: boolean
  /** Gave up: out of the rotation, watching. */
  gaveUp?: boolean
  /** Seat order, used for turns and colours. */
  seat: number
}

export interface GuessView {
  word: string
  feedback: Feedback
  playerId: string
  at: number
}

export interface RoomView {
  code: string
  ruleId: string
  ruleVersion: number
  slot: string
  setup: BoardSetup
  /** Public puzzle metadata (e.g. the category). Never the answer. */
  meta: Record<string, string | number>
  players: PlayerView[]
  guesses: GuessView[]
  status: GameStatus
  /** Whose turn it is; null once the game is over. */
  turn: string | null
  createdAt: number
  /** Hints the team has taken. */
  hints: HintReveal[]
  /** Optional time limit (ms) and when it runs out (server clock). */
  timeLimit?: number
  deadline?: number
  endReason?: EndReason
  /** Who made the game; only they can end it early. */
  creatorId?: string
  /** Optional per-turn limit (ms) and when the current turn runs out. */
  turnLimit?: number
  turnDeadline?: number
  /** True until a second player joins: nobody can play alone. */
  waiting: boolean
  /** You gave up: you see the answer, your friends play on. */
  youGaveUp?: boolean
  /** Revealed only once the game is over. */
  answer?: WordEntry
}

export type ClientMessage =
  | { t: 'join'; room: string; playerId: string; secret: string; name: string }
  | { t: 'typing'; letters: string[] }
  | { t: 'guess'; word: string; clientId: string }
  | { t: 'pass' }
  | { t: 'hint' }
  /** Give up just for yourself. */
  | { t: 'giveup' }
  /** End the game for everyone (creator only). */
  | { t: 'end' }
  | { t: 'rename'; name: string }
  | { t: 'ping' }

export type ServerMessage =
  | { t: 'room'; room: RoomView; you: string; /** Server time, so clients can correct their clocks. */ now: number }
  | { t: 'typing'; playerId: string; letters: string[] }
  | { t: 'accepted'; clientId: string }
  | { t: 'rejected'; clientId?: string; code: string; message: string }
  | { t: 'error'; code: string; message: string }
  | { t: 'pong' }

export interface CreateRoomRequest {
  ruleId: string
  /** Optional game time limit in minutes: 4, 5 or 10. */
  minutes?: number | null
  /** Optional per-turn limit in seconds: 30, 60 or 90. */
  turnSeconds?: number | null
  /** The creating player's id; they go first and can end the game. */
  creatorId?: string
}

export const TURN_LIMITS = [30, 60, 90] as const

export interface CreateRoomResponse {
  code: string
}

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ROOM_CODE_LENGTH)
}

export function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX)
}

/**
 * Names other players will see. Matched on a squashed form (lower case, look-alike digits
 * mapped, separators removed) so "s.h.1.t" and "SH1T" are caught too. Kept short on purpose:
 * slurs and the most common profanity, in English, Pidgin and Yoruba.
 */
const BLOCKED = [
  'fuck', 'shit', 'cunt', 'bitch', 'whore', 'slut', 'dick', 'cock', 'pussy', 'penis', 'vagina', 'porn', 'rape',
  'nigger', 'nigga', 'faggot', 'fag', 'retard', 'kike', 'chink', 'spic', 'tranny', 'nazi', 'hitler',
  'asshole', 'bastard', 'wanker', 'twat', 'motherf', 'mofo',
  'ashawo', 'olosho', 'ode', 'mumu', 'werey', 'oloshi', 'ashewo', 'pikin of',
]
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', $: 's', '!': 'i' }

export function nameProblem(name: string): string | null {
  const squashed = [...name.toLowerCase()].map((c) => LEET[c] ?? c).join('').replace(/[^a-z]/g, '')
  const words = name.toLowerCase().split(/[^a-z0-9@$!]+/).map((w) => [...w].map((c) => LEET[c] ?? c).join(''))
  // Short stems only match whole words ("ode" shouldn't block "Odeyemi"); long ones match anywhere.
  const hit = BLOCKED.some((b) => (b.length <= 4 ? words.includes(b) : squashed.includes(b.replace(/\s+/g, ''))))
  return hit ? 'Pick a different name — friends will see it' : null
}

/** A name safe to show to others: cleaned, and replaced if it's offensive. */
export function safeName(name: string): string {
  const clean = cleanName(name)
  return clean && !nameProblem(clean) ? clean : 'Player'
}

// ---------- The daily drop (scored on the server) ----------

/** Everything the server needs to replay a solo drop: the words, and when hints were taken. */
export interface DropPlay {
  slot: string
  words: string[]
  /** For each hint taken, how many guesses had been made at the time. */
  hintsAfter: number[]
  end?: 'gave-up' | 'time'
}

export interface DropView {
  slot: string
  number: number
  ruleId: string
  ruleVersion: number
  setup: BoardSetup
  meta: Record<string, string | number>
  guesses: { word: string; feedback: Feedback }[]
  hints: HintReveal[]
  status: GameStatus
  endReason?: EndReason
  /** Only once the game is over. */
  answer?: WordEntry
}

export interface DropResponse {
  view: DropView
  /** Set when the last word (or hint) was refused; nothing after `index` was applied. */
  rejected?: { index: number; code: string; message: string }
}

// ---------- Usernames ----------

export const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/

/** Why a username can't be used, or null if it's fine to try claiming. */
export function usernameProblem(name: string): string | null {
  if (name.length < 3) return 'At least 3 characters'
  if (name.length > 16) return 'At most 16 characters'
  if (!USERNAME_RE.test(name)) return 'Letters, numbers and _ only'
  if (nameProblem(name)) return 'Pick a different username'
  return null
}

export const usernameKey = (name: string) => name.toLowerCase()
