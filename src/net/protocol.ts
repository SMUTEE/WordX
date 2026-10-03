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
  /** Revealed only once the game is over. */
  answer?: WordEntry
}

export type ClientMessage =
  | { t: 'join'; room: string; playerId: string; secret: string; name: string }
  | { t: 'typing'; letters: string[] }
  | { t: 'guess'; word: string; clientId: string }
  | { t: 'pass' }
  | { t: 'hint' }
  | { t: 'giveup' }
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
  /** Optional time limit in minutes: 4, 5 or 10. */
  minutes?: number
}

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
