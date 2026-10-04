import type { BoardSetup, GameState } from '../engine/types'
import { DIFFICULTIES, LEVEL_COUNT, difficultyOf, type Difficulty } from './levels'

export interface JourneyProgress {
  /** Highest level you can play. Starts at 1. */
  unlocked: number
  /** Best stars per cleared level. */
  stars: Record<number, number>
  /** Finished attempts per level; the next attempt gets a fresh word. */
  attempts: Record<number, number>
  /** Best points per level. Replaying on a harder difficulty can raise it. */
  points: Record<number, number>
  /** The hardest difficulty each level has been cleared on. */
  cleared: Record<number, Difficulty>
}

const KEY = 'wordx:v1:journey'
const EMPTY: JourneyProgress = { unlocked: 1, stars: {}, attempts: {}, points: {}, cleared: {} }

export function loadJourney(): JourneyProgress {
  try {
    return { ...EMPTY, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return { ...EMPTY }
  }
}

function save(p: JourneyProgress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    // Progress lives on this device; without storage it lasts this visit only.
  }
}

/**
 * 3 stars: solved in half the tries or fewer, with no hints.
 * 2 stars: at most one hint and a try to spare. 1 star: solved.
 */
export function starsFor(state: GameState, setup: BoardSetup): number {
  if (state.status !== 'won') return 0
  const hints = state.hints?.length ?? 0
  const tries = state.guesses.length
  if (hints === 0 && tries <= Math.ceil(setup.maxGuesses / 2)) return 3
  if (hints <= 1 && tries < setup.maxGuesses) return 2
  return 1
}

/**
 * Points for a win: a base that grows with the level, plus 20 for every try to spare, minus 25
 * per hint (never below 50). Scholar multiplies it by 1.6, rounded to the nearest 10. A loss scores 0.
 */
export function pointsFor(n: number, state: GameState, setup: BoardSetup, difficulty: Difficulty): number {
  if (state.status !== 'won') return 0
  const spare = setup.maxGuesses - state.guesses.length
  const base = Math.max(50, 100 + 5 * n + 20 * spare - 25 * (state.hints?.length ?? 0))
  return Math.round((base * difficultyOf(difficulty).multiplier) / 10) * 10
}

const rank = (d: Difficulty) => DIFFICULTIES.findIndex((x) => x.id === d)

/** Records a finished level attempt. Winning unlocks the next level. */
export function recordLevel(n: number, state: GameState, setup: BoardSetup, difficulty: Difficulty = 'scholar'): JourneyProgress {
  const p = loadJourney()
  const stars = starsFor(state, setup)
  const points = pointsFor(n, state, setup, difficulty)
  const was = p.cleared[n]
  const next: JourneyProgress = {
    unlocked: stars > 0 ? Math.max(p.unlocked, Math.min(LEVEL_COUNT, n + 1)) : p.unlocked,
    stars: stars > (p.stars[n] ?? 0) ? { ...p.stars, [n]: stars } : p.stars,
    attempts: { ...p.attempts, [n]: (p.attempts[n] ?? 0) + 1 },
    points: points > (p.points[n] ?? 0) ? { ...p.points, [n]: points } : p.points,
    cleared: stars > 0 && (!was || rank(difficulty) > rank(was)) ? { ...p.cleared, [n]: difficulty } : p.cleared,
  }
  save(next)
  return next
}

export const totalPoints = (p: JourneyProgress) => Object.values(p.points).reduce((a, b) => a + b, 0)

const DIFF_KEY = 'wordx:v1:difficulty'
export function loadDifficulty(): Difficulty {
  try {
    const v = localStorage.getItem(DIFF_KEY)
    return v === 'easy' ? 'easy' : 'scholar'
  } catch {
    return 'scholar'
  }
}
export function saveDifficulty(d: Difficulty) {
  try {
    localStorage.setItem(DIFF_KEY, d)
  } catch {
    // Just a preference.
  }
}

export const totalStars = (p: JourneyProgress) => Object.values(p.stars).reduce((a, b) => a + b, 0)
export const journeyComplete = (p: JourneyProgress) => !!p.stars[LEVEL_COUNT]
