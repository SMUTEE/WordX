import type { BoardSetup, GameState } from '../engine/types'
import { LEVEL_COUNT } from './levels'

export interface JourneyProgress {
  /** Highest level you can play. Starts at 1. */
  unlocked: number
  /** Best stars per cleared level. */
  stars: Record<number, number>
  /** Finished attempts per level; the next attempt gets a fresh word. */
  attempts: Record<number, number>
}

const KEY = 'wordx:v1:journey'
const EMPTY: JourneyProgress = { unlocked: 1, stars: {}, attempts: {} }

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

/** Records a finished level attempt. Winning unlocks the next level. */
export function recordLevel(n: number, state: GameState, setup: BoardSetup): JourneyProgress {
  const p = loadJourney()
  const stars = starsFor(state, setup)
  const next: JourneyProgress = {
    unlocked: stars > 0 ? Math.max(p.unlocked, Math.min(LEVEL_COUNT, n + 1)) : p.unlocked,
    stars: stars > (p.stars[n] ?? 0) ? { ...p.stars, [n]: stars } : p.stars,
    attempts: { ...p.attempts, [n]: (p.attempts[n] ?? 0) + 1 },
  }
  save(next)
  return next
}

export const totalStars = (p: JourneyProgress) => Object.values(p.stars).reduce((a, b) => a + b, 0)
export const journeyComplete = (p: JourneyProgress) => !!p.stars[LEVEL_COUNT]
