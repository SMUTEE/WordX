import { createHash } from 'node:crypto'
import schedule from '../src/data/schedule.json'
import { defaultDictionary } from '../src/engine/dictionary'
import { createGame, type Game } from '../src/engine/engine'
import { resolvePuzzle, type ScheduleConfig } from '../src/engine/schedule'
import type { GameState, HintReveal } from '../src/engine/types'
import { TIME_LIMITS } from '../src/engine/engine'
import { currentSlot } from '../src/engine/schedule'
import { MAX_PLAYERS, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, safeName, type RoomView } from '../src/net/protocol'
import { registry } from '../src/rules'

export interface PlayerRecord {
  id: string
  name: string
  secretHash: string
  seat: number
  joinedAt: number
}

/** A hint, and how many guesses had been made when it was taken (for exact replay). */
export interface HintRecord {
  after: number
  reveal: HintReveal
}

export interface GuessRecord {
  word: string
  playerId: string
  clientId: string
  at: number
}

/** Everything persisted about a room. The answer isn't stored; it's re-derived from the code. */
export interface RoomRecord {
  code: string
  ruleId: string
  ruleVersion: number
  slot: string
  createdAt: number
  players: PlayerRecord[]
  guesses: GuessRecord[]
  hints: HintRecord[]
  turn: string | null
  /** Time limit in ms, if the creator set one. The clock starts when the first player joins. */
  timeLimit: number | null
  deadline: number | null
  /** Set when the game ended early: time ran out or someone gave up. */
  ended: { reason: 'time' | 'gave-up'; at: number } | null
}

export type Outcome = { ok: true; duplicate?: boolean } | { ok: false; code: string; message: string }

export class RoomError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

export const hashSecret = (secret: string) => createHash('sha256').update(secret).digest('hex')

/** Rules a room may use: registered and not switched off by a flag. */
export function playableRule(ruleId: string) {
  const rule = registry.get(ruleId)
  if (!rule || (schedule as ScheduleConfig).flags[ruleId] === false) return undefined
  return rule
}

/** A random room code from an alphabet with no look-alikes (no 0/O, 1/I/L). */
export function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH))
  return Array.from(bytes, (b) => ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length]).join('')
}

/** Validates a create request and builds the new room's record. */
export function newRoomRecord(code: string, ruleId: unknown, minutes: unknown, now: number): { record: RoomRecord } | { error: string } {
  const rule = playableRule(String(ruleId ?? ''))
  if (!rule) return { error: 'Unknown rule' }
  const m = minutes == null ? null : Number(minutes)
  if (m !== null && !(TIME_LIMITS as readonly number[]).includes(m)) return { error: 'Pick 4, 5 or 10 minutes' }
  const record: RoomRecord = {
    code,
    ruleId: rule.id,
    ruleVersion: rule.version,
    slot: currentSlot(now),
    createdAt: now,
    players: [],
    guesses: [],
    hints: [],
    turn: null,
    timeLimit: m ? m * 60_000 : null,
    deadline: null,
    ended: null,
  }
  new Room(record) // fail fast if the puzzle can't be built
  return { record }
}

/**
 * One co-op room, in memory. Pure game logic, no sockets or storage: callers persist the
 * record after each successful change. Players take turns; every guess is checked and scored
 * here with the same engine the app uses.
 */
export class Room {
  readonly record: RoomRecord
  readonly game: Game
  private state: GameState
  private online = new Map<string, number>()

  constructor(record: RoomRecord) {
    const rule = registry.get(record.ruleId)
    if (!rule) throw new RoomError('expired', 'This game uses a rule that no longer exists.')
    if (rule.version !== record.ruleVersion) throw new RoomError('expired', 'This game was made with an older version of the rule.')

    const dictionary = defaultDictionary()
    const puzzle = resolvePuzzle({
      slot: record.slot,
      schedule: schedule as ScheduleConfig,
      registry,
      dictionary,
      forceRuleId: record.ruleId,
      variant: `room:${record.code}`,
    })
    this.record = record
    this.game = createGame(rule, puzzle, dictionary)
    this.state = this.game.newState(record.createdAt)
    if (record.timeLimit && record.deadline) {
      this.state = { ...this.state, timeLimit: record.timeLimit, deadline: record.deadline }
    }
    // Rebuild from the stored words; scoring is deterministic, so feedback comes out identical.
    const hintsAt = (n: number) => {
      const due = record.hints.filter((h) => h.after === n).map((h) => h.reveal)
      if (due.length) this.state = { ...this.state, hints: [...(this.state.hints ?? []), ...due] }
    }
    record.guesses.forEach((g, i) => {
      hintsAt(i)
      const r = this.game.submit(this.state, g.word, g.at)
      if (!r.accepted) throw new RoomError('corrupt', 'This game’s history could not be replayed.')
      this.state = r.state
    })
    hintsAt(record.guesses.length)
    if (record.ended) this.state = this.game.forfeit(this.state, record.ended.reason, record.ended.at)
  }

  get code() {
    return this.record.code
  }

  get status() {
    return this.state.status
  }

  isOnline(playerId: string) {
    return (this.online.get(playerId) ?? 0) > 0
  }

  player(playerId: string) {
    return this.record.players.find((p) => p.id === playerId)
  }

  /** Adds a new player or re-admits a returning one. Returns the player if anything changed. */
  join(playerId: string, secret: string, name: string, now: number): { ok: true; changed: boolean } | { ok: false; code: string; message: string } {
    const clean = safeName(name)
    const existing = this.player(playerId)
    if (existing) {
      if (existing.secretHash !== hashSecret(secret)) {
        return { ok: false, code: 'identity', message: 'That player is already in this game on another device.' }
      }
      const changed = existing.name !== clean
      existing.name = clean
      return { ok: true, changed }
    }
    if (this.record.players.length >= MAX_PLAYERS) {
      return { ok: false, code: 'full', message: `This game is full (${MAX_PLAYERS} players).` }
    }
    this.record.players.push({ id: playerId, name: clean, secretHash: hashSecret(secret), seat: this.record.players.length, joinedAt: now })
    return { ok: true, changed: true }
  }

  rename(playerId: string, name: string): boolean {
    const p = this.player(playerId)
    const clean = safeName(name)
    if (!p || p.name === clean) return false
    p.name = clean
    return true
  }

  /** Counts a socket as connected without side effects (rebuilding state after hibernation). */
  markOnline(playerId: string) {
    this.online.set(playerId, (this.online.get(playerId) ?? 0) + 1)
  }

  /** A socket for this player opened. Returns true if the turn or clock changed. */
  connect(playerId: string, now = Date.now()): boolean {
    this.online.set(playerId, (this.online.get(playerId) ?? 0) + 1)
    let changed = false
    if (this.record.timeLimit && !this.record.deadline && this.state.status === 'playing') {
      this.record.deadline = now + this.record.timeLimit
      this.state = { ...this.state, timeLimit: this.record.timeLimit, deadline: this.record.deadline }
      changed = true
    }
    if (this.state.status === 'playing' && (this.record.turn === null || !this.player(this.record.turn))) {
      this.record.turn = playerId
      changed = true
    }
    return changed
  }

  /** Ends the game if its clock has run out. Returns true if it just ended. */
  expire(now = Date.now()): boolean {
    if (this.state.status !== 'playing' || !this.record.deadline || now < this.record.deadline) return false
    return this.end('time', now)
  }

  /** Anyone in the game can give up for the team. */
  giveUp(playerId: string, now = Date.now()): boolean {
    if (!this.player(playerId)) return false
    return this.end('gave-up', now)
  }

  private end(reason: 'time' | 'gave-up', now: number): boolean {
    if (this.state.status !== 'playing') return false
    this.state = this.game.forfeit(this.state, reason, now)
    this.record.ended = { reason, at: now }
    this.record.turn = null
    return true
  }

  /** A socket closed. Returns true if the player is now fully offline. */
  disconnect(playerId: string): boolean {
    const n = (this.online.get(playerId) ?? 1) - 1
    if (n <= 0) this.online.delete(playerId)
    else this.online.set(playerId, n)
    return n <= 0
  }

  /** Next online player after `from`, in seat order. Stays with `from` if nobody else is here. */
  private nextTurn(from: string | null): string | null {
    const seats = [...this.record.players].sort((a, b) => a.seat - b.seat)
    if (!seats.length) return null
    const start = Math.max(0, seats.findIndex((p) => p.id === from))
    for (let step = 1; step <= seats.length; step++) {
      const candidate = seats[(start + step) % seats.length]
      if (candidate.id !== from && this.isOnline(candidate.id)) return candidate.id
    }
    return from && this.player(from) ? from : seats[0].id
  }

  guess(playerId: string, word: string, clientId: string, now: number): Outcome {
    // Idempotent: a resent guess (after a dropped connection) is acknowledged, not re-applied.
    if (this.record.guesses.some((g) => g.clientId === clientId)) return { ok: true, duplicate: true }
    if (this.expire(now)) return { ok: false, code: 'time', message: 'Time’s up' }
    if (this.state.status !== 'playing') return { ok: false, code: 'finished', message: 'This game is over.' }
    if (!this.player(playerId)) return { ok: false, code: 'not-joined', message: 'Join the game first.' }
    if (this.record.turn !== playerId) {
      const holder = this.record.turn ? this.player(this.record.turn)?.name : undefined
      return { ok: false, code: 'turn', message: holder ? `It’s ${holder}’s turn` : 'It isn’t your turn' }
    }
    const result = this.game.submit(this.state, word.toUpperCase(), now)
    if (!result.accepted) return { ok: false, code: result.error.code, message: result.error.message }

    this.state = result.state
    this.record.guesses.push({ word: result.guess.word, playerId, clientId, at: now })
    this.record.turn = this.state.status === 'playing' ? this.nextTurn(playerId) : null
    return { ok: true }
  }

  /** The turn holder asks for a hint; everyone sees it. */
  hint(playerId: string): Outcome {
    if (this.record.turn !== playerId) return { ok: false, code: 'turn', message: 'Only the player whose turn it is can take a hint' }
    const r = this.game.hint(this.state)
    if (!r.ok) return { ok: false, code: 'hint', message: r.message }
    this.state = r.state
    this.record.hints.push({ after: this.state.guesses.length, reveal: r.hint })
    return { ok: true }
  }

  /** The turn holder hands over voluntarily. */
  pass(playerId: string): boolean {
    if (this.record.turn !== playerId || this.state.status !== 'playing') return false
    const next = this.nextTurn(playerId)
    if (next === playerId) return false
    this.record.turn = next
    return true
  }

  /** Moves the turn on if its holder has gone away. Returns true if it moved. */
  handOffIfAbsent(playerId: string): boolean {
    if (this.record.turn !== playerId || this.isOnline(playerId) || this.state.status !== 'playing') return false
    const next = this.nextTurn(playerId)
    if (!next || next === playerId) return false
    this.record.turn = next
    return true
  }

  view(): RoomView {
    const over = this.state.status !== 'playing'
    return {
      code: this.code,
      ruleId: this.record.ruleId,
      ruleVersion: this.record.ruleVersion,
      slot: this.record.slot,
      setup: this.game.setup,
      meta: this.game.puzzle.meta,
      players: this.record.players.map((p) => ({ id: p.id, name: p.name, seat: p.seat, online: this.isOnline(p.id) })),
      guesses: this.state.guesses.map((g, i) => ({ word: g.word, feedback: g.feedback, playerId: this.record.guesses[i].playerId, at: g.submittedAt })),
      status: this.state.status,
      turn: over ? null : this.record.turn,
      hints: this.state.hints ?? [],
      timeLimit: this.record.timeLimit ?? undefined,
      deadline: this.record.deadline ?? undefined,
      endReason: this.state.endReason,
      createdAt: this.record.createdAt,
      answer: over ? this.game.puzzle.answer : undefined,
    }
  }
}
