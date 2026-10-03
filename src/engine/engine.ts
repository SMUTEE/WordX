import { createRng } from './random'
import { bestMark, standardFeedback } from './scoring'
import type {
  BoardSetup,
  Dictionary,
  EndReason,
  GameRule,
  GameState,
  Guess,
  HintReveal,
  KeyState,
  Puzzle,
  PuzzleContext,
  ValidationResult,
} from './types'

/** Hints unlock after this many tries, so the colours get a chance first. */
export const HINT_AFTER = 2
export const MAX_HINTS = 2

export type HintResult = { ok: true; state: GameState; hint: HintReveal } | { ok: false; message: string }

export const DEFAULT_SETUP: BoardSetup = { length: 5, maxGuesses: 6, locked: {}, feedbackKind: 'tiles', maxHints: MAX_HINTS }

/** Time limits a player can pick before starting, in minutes. */
export const TIME_LIMITS = [4, 5, 10] as const

export type SubmitResult =
  | { accepted: true; state: GameState; guess: Guess }
  | { accepted: false; state: GameState; error: Extract<ValidationResult, { ok: false }> }

export interface Game {
  rule: GameRule
  puzzle: Puzzle
  setup: BoardSetup
  context: PuzzleContext
  newState(now?: number): GameState
  validate(word: string, state: GameState): ValidationResult
  submit(state: GameState, word: string, now?: number): SubmitResult
  keyStates(state: GameState): Record<string, KeyState>
  locks(state: GameState): Record<number, string>
  /** Whether a hint can be taken now, and if not, why. */
  hintStatus(state: GameState): { available: boolean; reason?: string }
  hint(state: GameState): HintResult
  /** Ends the game as a loss: the player gave up, or time ran out. */
  forfeit(state: GameState, reason: Exclude<EndReason, 'tries'>, now?: number): GameState
  /** Starts the clock. A game can only be timed once, before its first guess. */
  withTimer(state: GameState, minutes: number, now?: number): GameState
}

export interface GameOptions {
  /** A co-op client gets its whole board setup from the server, which alone knows the answer. */
  setup?: BoardSetup
  /** Tweaks on top of the rule's setup, e.g. a Journey level's tries and hints. */
  adjust?: Partial<BoardSetup>
}

/**
 * The core loop. It owns the lifecycle — validate, score, update — and asks the rule
 * only for the stages it overrides. Nothing in here knows any rule by name.
 */
export function createGame(rule: GameRule, puzzle: Puzzle, dictionary: Dictionary, options: GameOptions = {}): Game {
  const setup: BoardSetup = options.setup ?? {
    ...DEFAULT_SETUP,
    // The board is as long as the answer: 4, 5 or 6 letters.
    length: puzzle.answer.word.length,
    ...rule.setup?.(puzzle, dictionary),
    ...options.adjust,
  }
  const context: PuzzleContext = { puzzle, setup, dictionary }
  const answer = puzzle.answer.word

  const hintLocks = (state: GameState) =>
    Object.fromEntries((state.hints ?? []).flatMap((h) => (h.kind === 'letter' ? [[h.index, h.letter]] : [])))
  const locks = (state: GameState) => ({ ...setup.locked, ...rule.dynamicLocks?.(state, context), ...hintLocks(state) })

  const hintStatus = (state: GameState) => {
    const used = state.hints?.length ?? 0
    if (state.status !== 'playing') return { available: false, reason: 'The game is over' }
    if (setup.maxHints <= 0) return { available: false, reason: 'No hints on this level' }
    if (used >= setup.maxHints) return { available: false, reason: 'No hints left' }
    if (state.guesses.length < HINT_AFTER) {
      const left = HINT_AFTER - state.guesses.length
      return { available: false, reason: `Hints unlock after ${left} more ${left === 1 ? 'try' : 'tries'}` }
    }
    return { available: true }
  }

  /** First a meaning clue if the word has one, then letters revealed in place. */
  const hint = (state: GameState): HintResult => {
    const status = hintStatus(state)
    if (!status.available) return { ok: false, message: status.reason! }
    const used = state.hints ?? []
    let reveal: HintReveal | undefined
    const gloss = puzzle.answer.gloss
    if (gloss && !used.some((h) => h.kind === 'clue')) {
      reveal = { kind: 'clue', text: gloss.replace(new RegExp(answer, 'gi'), '____') }
    } else {
      const known = new Set(Object.keys(locks(state)).map(Number))
      for (const g of state.guesses) {
        if (g.feedback.kind === 'tiles') g.feedback.marks.forEach((m, i) => m === 'correct' && known.add(i))
      }
      const open = [...answer].map((_, i) => i).filter((i) => !known.has(i))
      if (!open.length) return { ok: false, message: 'You already know every letter' }
      const index = open[createRng(puzzle.seed + used.length).int(open.length)]
      reveal = { kind: 'letter', index, letter: answer[index] }
    }
    return { ok: true, hint: reveal, state: { ...state, hints: [...used, reveal] } }
  }

  const validate = (word: string, state: GameState): ValidationResult => {
    if (state.status !== 'playing') return { ok: false, code: 'finished', message: 'This puzzle is finished' }
    if (word.length !== setup.length) return { ok: false, code: 'length', message: 'Not enough letters' }
    if (!/^[A-Z]+$/.test(word)) return { ok: false, code: 'charset', message: 'Letters only' }
    for (const [i, letter] of Object.entries(locks(state))) {
      if (word[Number(i)] !== letter) return { ok: false, code: 'locked', message: 'Locked letters stay put' }
    }
    if (state.guesses.some((g) => g.word === word)) return { ok: false, code: 'repeat', message: 'Already tried that' }

    const ruled = rule.validateGuess?.(word, state, context)
    if (ruled && !ruled.ok) return ruled

    const known = rule.inVocabulary ? rule.inVocabulary(word, context) : dictionary.has(word)
    if (!known) return { ok: false, code: 'vocabulary', message: 'Not in word list' }
    return { ok: true }
  }

  const submit = (state: GameState, word: string, now = Date.now()): SubmitResult => {
    // Judged by when the guess was made, so replaying a timed game later gives the same result.
    if (state.status === 'playing' && state.deadline && now > state.deadline) {
      return { accepted: false, state, error: { ok: false, code: 'time', message: 'Time’s up' } }
    }
    const result = validate(word, state)
    // Invalid guesses never consume an attempt.
    if (!result.ok) return { accepted: false, state, error: result }

    const feedback = rule.scoreGuess
      ? rule.scoreGuess(word, answer, { ...context, guessIndex: state.guesses.length, previous: state.guesses })
      : standardFeedback(word, answer)

    const guess: Guess = { word, feedback, submittedAt: now }
    const guesses = [...state.guesses, guess]
    const won = word === answer
    const status = won ? 'won' : guesses.length >= setup.maxGuesses ? 'lost' : 'playing'
    const next: GameState = {
      ...state,
      guesses,
      status,
      completedAt: status === 'playing' ? undefined : now,
      endReason: status === 'lost' ? 'tries' : undefined,
    }
    return { accepted: true, state: next, guess }
  }

  const keyStates = (state: GameState) => {
    const base: Record<string, KeyState> = {}
    for (const g of state.guesses) {
      if (g.feedback.kind === 'tiles') {
        const marks = g.feedback.marks
        ;[...g.word].forEach((letter, i) => {
          const prev = base[letter]
          const prevMark = prev === 'correct' || prev === 'present' || prev === 'absent' ? prev : undefined
          base[letter] = bestMark(prevMark, marks[i])
        })
      } else {
        for (const letter of g.word) base[letter] ??= 'used'
      }
    }
    return rule.keyStates ? rule.keyStates(state, context, base) : base
  }

  return {
    rule,
    puzzle,
    setup,
    context,
    newState: (now = Date.now()) => ({ puzzleId: puzzle.id, guesses: [], status: 'playing', startedAt: now }),
    validate,
    submit,
    keyStates,
    locks,
    hintStatus,
    hint,
    forfeit: (state, reason, now = Date.now()) =>
      state.status === 'playing' ? { ...state, status: 'lost', endReason: reason, completedAt: now } : state,
    withTimer: (state, minutes, now = Date.now()) =>
      state.guesses.length || state.deadline ? state : { ...state, timeLimit: minutes * 60_000, deadline: now + minutes * 60_000 },
  }
}
