import { createHash } from 'node:crypto'
import schedule from '../src/data/schedule.json'
import { defaultDictionary } from '../src/engine/dictionary'
import { createGame, type Game } from '../src/engine/engine'
import { resolvePuzzle, type ScheduleConfig } from '../src/engine/schedule'
import type { GameState, HintReveal } from '../src/engine/types'
import { TIME_LIMITS } from '../src/engine/engine'
import { currentSlot } from '../src/engine/schedule'
import { MAX_PLAYERS, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, TURN_LIMITS, safeName, type CreateRoomRequest, type RoomView } from '../src/net/protocol'
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
  /** Game time limit in ms, if the creator set one. The clock starts with the game. */
  timeLimit: number | null
  deadline: number | null
  /** Set when the game ended early: time ran out, or the creator ended it. */
  ended: { reason: 'time' | 'gave-up' | 'ended'; at: number } | null
  /** Who made the game: they play first and can end it. */
  creatorId: string | null
  /** Per-turn limit in ms, and when the current turn runs out. */
  turnLimit: number | null
  turnDeadline: number | null
  /** When a second player joined and play began. Nobody can play alone. */
  startedAt: number | null
  /** Players who gave up: they see the word and sit out; the rest play on. */
  gaveUp: string[]
  /** When each absent player's last connection closed, so a turn holder's grace survives a server restart. */
  absent?: Record<string, number>
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
export function newRoomRecord(code: string, req: Partial<CreateRoomRequest>, now: number): { record: RoomRecord } | { error: string } {
  const rule = playableRule(String(req.ruleId ?? ''))
  if (!rule) return { error: 'Unknown rule' }
  const m = req.minutes == null ? null : Number(req.minutes)
  if (m !== null && !(TIME_LIMITS as readonly number[]).includes(m)) return { error: 'Pick 4, 5 or 10 minutes' }
  const t = req.turnSeconds == null ? null : Number(req.turnSeconds)
  if (t !== null && !(TURN_LIMITS as readonly number[]).includes(t)) return { error: 'Pick 30, 60 or 90 seconds a turn' }
  const creatorId = typeof req.creatorId === 'string' && /^[a-z0-9]{6,32}$/.test(req.creatorId) ? req.creatorId : null
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
    creatorId,
    turnLimit: t ? t * 1000 : null,
    turnDeadline: null,
    startedAt: null,
    gaveUp: [],
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
    // Rooms saved before these fields existed.
    record.creatorId ??= record.players.find((p) => p.seat === 0)?.id ?? null
    record.turnLimit ??= null
    record.turnDeadline ??= null
    record.startedAt ??= record.turn || record.guesses.length ? record.createdAt : null
    record.gaveUp ??= []
    record.absent ??= {}
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

  /** A socket for this player opened. Returns true if the game just started. */
  connect(playerId: string, now = Date.now()): boolean {
    this.online.set(playerId, (this.online.get(playerId) ?? 0) + 1)
    return this.maybeStart(now)
  }

  /** The creator, or whoever sat down first in rooms from before creators were recorded. */
  get creatorId(): string | null {
    const c = this.record.creatorId
    return c && this.player(c) ? c : (this.seats()[0]?.id ?? null)
  }

  /** Play begins once a second player is here: the creator goes first, and the clocks start. */
  private maybeStart(now: number): boolean {
    if (this.record.startedAt != null || this.state.status !== 'playing' || this.record.players.length < 2) return false
    this.record.startedAt = now
    if (this.record.timeLimit) {
      this.record.deadline = now + this.record.timeLimit
      this.state = { ...this.state, timeLimit: this.record.timeLimit, deadline: this.record.deadline }
    }
    this.setTurn(this.creatorId, now)
    return true
  }

  private setTurn(playerId: string | null, now: number) {
    this.record.turn = playerId
    this.record.turnDeadline = playerId && this.record.turnLimit ? now + this.record.turnLimit : null
  }

  private seats() {
    return [...this.record.players].sort((a, b) => a.seat - b.seat)
  }

  /** Players still in the game (not given up). */
  private active() {
    return this.seats().filter((p) => !this.record.gaveUp.includes(p.id))
  }

  /** Strict rotation among players still in: the next in seat order, online or not. Nobody plays twice in a row. */
  private nextInRotation(from: string | null): string | null {
    const seats = this.seats()
    if (!seats.length) return null
    const i = seats.findIndex((p) => p.id === from)
    for (let step = 1; step <= seats.length; step++) {
      const candidate = seats[(i + step) % seats.length]
      if (!this.record.gaveUp.includes(candidate.id)) return candidate.id
    }
    return null
  }

  /** The next player who is actually here — used only to skip someone who has gone away. */
  private nextOnline(from: string | null): string | null {
    const seats = this.seats()
    const start = Math.max(0, seats.findIndex((p) => p.id === from))
    for (let step = 1; step < seats.length; step++) {
      const candidate = seats[(start + step) % seats.length]
      if (this.isOnline(candidate.id) && !this.record.gaveUp.includes(candidate.id)) return candidate.id
    }
    return from && this.isOnline(from) && !this.record.gaveUp.includes(from) ? from : null
  }

  /** Give up just for yourself: you see the word and sit out. When nobody's left, the game ends. */
  giveUp(playerId: string, now = Date.now()): Outcome {
    if (!this.player(playerId)) return { ok: false, code: 'not-joined', message: 'Join the game first.' }
    if (this.state.status !== 'playing') return { ok: false, code: 'finished', message: 'This game is over.' }
    if (this.record.gaveUp.includes(playerId)) return { ok: true, duplicate: true }
    this.record.gaveUp.push(playerId)
    if (!this.active().length) {
      this.end('gave-up', now)
      return { ok: true }
    }
    if (this.record.turn === playerId) this.setTurn(this.nextInRotation(playerId), now)
    return { ok: true }
  }

  /** Ends the game if its clock has run out. Returns true if it just ended. */
  expire(now = Date.now()): boolean {
    if (this.state.status !== 'playing' || !this.record.deadline || now < this.record.deadline) return false
    return this.end('time', now)
  }

  /** Only the creator can end the game early; it ends for everyone and reveals the word. */
  endGame(playerId: string, now = Date.now()): Outcome {
    if (playerId !== this.creatorId) {
      const creator = this.creatorId ? this.player(this.creatorId)?.name : undefined
      return { ok: false, code: 'not-creator', message: creator ? `Only ${creator} can end the game` : 'Only the game’s creator can end it' }
    }
    return this.end('ended', now) ? { ok: true } : { ok: false, code: 'finished', message: 'This game is over.' }
  }

  /** The current turn ran out: it passes to the next player, and no try is used. */
  turnExpired(now = Date.now()): boolean {
    if (this.state.status !== 'playing' || !this.record.turnDeadline || now < this.record.turnDeadline) return false
    this.setTurn(this.nextInRotation(this.record.turn), now)
    return true
  }

  private end(reason: 'time' | 'gave-up' | 'ended', now: number): boolean {
    if (this.state.status !== 'playing') return false
    this.state = this.game.forfeit(this.state, reason, now)
    this.record.ended = { reason, at: now }
    this.setTurn(null, now)
    return true
  }

  /** A socket closed. Returns true if the player is now fully offline. */
  disconnect(playerId: string): boolean {
    const n = (this.online.get(playerId) ?? 1) - 1
    if (n <= 0) this.online.delete(playerId)
    else this.online.set(playerId, n)
    return n <= 0
  }

  guess(playerId: string, word: string, clientId: string, now: number): Outcome {
    // Idempotent: a resent guess (after a dropped connection) is acknowledged, not re-applied.
    if (this.record.guesses.some((g) => g.clientId === clientId)) return { ok: true, duplicate: true }
    if (this.expire(now)) return { ok: false, code: 'time', message: 'Time’s up' }
    if (this.state.status !== 'playing') return { ok: false, code: 'finished', message: 'This game is over.' }
    if (!this.player(playerId)) return { ok: false, code: 'not-joined', message: 'Join the game first.' }
    if (this.record.gaveUp.includes(playerId)) return { ok: false, code: 'gave-up', message: 'You gave up this game' }
    if (this.record.startedAt == null) return { ok: false, code: 'waiting', message: 'Wait for a friend to join' }
    if (this.record.turn !== playerId) {
      const holder = this.record.turn ? this.player(this.record.turn)?.name : undefined
      return { ok: false, code: 'turn', message: holder ? `It’s ${holder}’s turn` : 'It isn’t your turn' }
    }
    const result = this.game.submit(this.state, word.toUpperCase(), now)
    if (!result.accepted) return { ok: false, code: result.error.code, message: result.error.message }

    this.state = result.state
    this.record.guesses.push({ word: result.guess.word, playerId, clientId, at: now })
    this.setTurn(this.state.status === 'playing' ? this.nextInRotation(playerId) : null, now)
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
  pass(playerId: string, now = Date.now()): boolean {
    if (this.record.turn !== playerId || this.state.status !== 'playing') return false
    const next = this.nextInRotation(playerId)
    if (!next || next === playerId) return false
    this.setTurn(next, now)
    return true
  }

  /** Skips a turn holder who has gone away, so the game can't freeze. Returns true if it moved. */
  handOffIfAbsent(playerId: string, now = Date.now()): boolean {
    if (this.record.turn !== playerId || this.isOnline(playerId) || this.state.status !== 'playing') return false
    const next = this.nextOnline(playerId)
    if (!next || next === playerId) return false
    this.setTurn(next, now)
    return true
  }

  /** The room as one player sees it. A player who gave up also gets the answer. */
  view(forPlayer?: string): RoomView {
    const over = this.state.status !== 'playing'
    const youGaveUp = !!forPlayer && this.record.gaveUp.includes(forPlayer)
    return {
      code: this.code,
      ruleId: this.record.ruleId,
      ruleVersion: this.record.ruleVersion,
      slot: this.record.slot,
      setup: this.game.setup,
      meta: this.game.puzzle.meta,
      players: this.record.players.map((p) => ({ id: p.id, name: p.name, seat: p.seat, online: this.isOnline(p.id), gaveUp: this.record.gaveUp.includes(p.id) })),
      guesses: this.state.guesses.map((g, i) => ({ word: g.word, feedback: g.feedback, playerId: this.record.guesses[i].playerId, at: g.submittedAt })),
      status: this.state.status,
      turn: over ? null : this.record.turn,
      hints: this.state.hints ?? [],
      timeLimit: this.record.timeLimit ?? undefined,
      deadline: this.record.deadline ?? undefined,
      endReason: this.state.endReason,
      creatorId: this.creatorId ?? undefined,
      turnLimit: this.record.turnLimit ?? undefined,
      turnDeadline: over ? undefined : (this.record.turnDeadline ?? undefined),
      waiting: !over && this.record.startedAt == null,
      createdAt: this.record.createdAt,
      youGaveUp,
      answer: over || youGaveUp ? this.game.puzzle.answer : undefined,
    }
  }
}
