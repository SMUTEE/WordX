import schedule from '../src/data/schedule.json'
import { defaultDictionary } from '../src/engine/dictionary'
import { createGame, type Game } from '../src/engine/engine'
import { addSlots, currentSlot, normalizeSlot, resolvePuzzle, type ScheduleConfig } from '../src/engine/schedule'
import type { GameState } from '../src/engine/types'
import type { DropPlay, DropView } from '../src/net/protocol'
import { registry } from '../src/rules'

/**
 * The daily drop, scored on the server. The answer is picked with a secret salt, so it can't be
 * computed from the app's code; the app sends its words and gets colours back. Stateless: every
 * call replays the whole game from the words, so there's nothing to store per player.
 */

/** How far back a drop can still be played, so a game started before rollover can finish. */
const GRACE_SLOTS = 4

const cache = new Map<string, Game>()

export function dropGame(slot: string, salt: string): Game {
  const key = `${slot}|${salt}`
  let game = cache.get(key)
  if (!game) {
    const dictionary = defaultDictionary()
    const puzzle = resolvePuzzle({ slot, schedule: schedule as ScheduleConfig, registry, dictionary, salt })
    game = createGame(registry.get(puzzle.ruleId)!, puzzle, dictionary)
    if (cache.size > 16) cache.clear()
    cache.set(key, game)
  }
  return game
}

/** Accepts the current drop or a recent one; never a future one (no peeking). */
export function playableSlot(input: unknown, now = Date.now()): string | null {
  const current = currentSlot(now)
  if (input == null || input === '') return current
  let slot: string
  try {
    slot = normalizeSlot(String(input))
  } catch {
    return null
  }
  return slot <= current && slot >= addSlots(current, -GRACE_SLOTS) ? slot : null
}

function view(game: Game, state: GameState): DropView {
  const over = state.status !== 'playing'
  return {
    slot: game.puzzle.slot,
    number: game.puzzle.number,
    ruleId: game.rule.id,
    ruleVersion: game.rule.version,
    setup: game.setup,
    meta: game.puzzle.meta,
    guesses: state.guesses.map((g) => ({ word: g.word, feedback: g.feedback })),
    hints: state.hints ?? [],
    status: state.status,
    endReason: state.endReason,
    answer: over ? game.puzzle.answer : undefined,
  }
}

export type DropResult = { view: DropView; rejected?: { index: number; code: string; message: string } } | { error: string; status: number }

/** Replays a player's game: their words, the hints they took (and when), and how it ended. */
export function playDrop(play: Partial<DropPlay>, salt: string, now = Date.now()): DropResult {
  const slot = playableSlot(play.slot, now)
  if (!slot) return { error: 'That drop isn’t available', status: 404 }
  const words = Array.isArray(play.words) ? play.words.slice(0, 12).map((w) => String(w).toUpperCase()) : []
  const hintsAfter = Array.isArray(play.hintsAfter) ? play.hintsAfter.slice(0, 4).map(Number).filter(Number.isInteger) : []
  if (words.some((w) => !/^[A-Z]{1,12}$/.test(w))) return { error: 'Letters only', status: 400 }

  const game = dropGame(slot, salt)
  let state = game.newState(now)
  const takeHints = (at: number): string | null => {
    const due = hintsAfter.filter((h) => h === at).length
    for (let k = 0; k < due; k++) {
      const r = game.hint(state)
      if (!r.ok) return r.message
      state = r.state
    }
    return null
  }

  for (let i = 0; i < words.length; i++) {
    const hintError = takeHints(i)
    if (hintError) return { view: view(game, state), rejected: { index: i, code: 'hint', message: hintError } }
    // Solo timers run on the device; the server judges each word by the rules alone.
    const r = game.submit({ ...state, deadline: undefined }, words[i], now)
    if (!r.accepted) return { view: view(game, state), rejected: { index: i, code: r.error.code, message: r.error.message } }
    state = { ...r.state, deadline: state.deadline, timeLimit: state.timeLimit }
  }
  const hintError = takeHints(words.length)
  if (hintError) return { view: view(game, state), rejected: { index: words.length, code: 'hint', message: hintError } }
  if (play.end === 'gave-up' || play.end === 'time') state = game.forfeit(state, play.end, now)
  return { view: view(game, state) }
}

/** The drop as the app sees it before playing: rule, board, number. Never the answer. */
export function dropInfo(slotInput: unknown, salt: string, now = Date.now()): DropResult {
  return playDrop({ slot: slotInput as string, words: [] }, salt, now)
}
