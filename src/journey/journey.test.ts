import { beforeEach, describe, expect, it } from 'vitest'
import { LEVELS, levelGame, poolSize } from './levels'
import { loadJourney, recordLevel, starsFor } from './progress'

// A tiny in-memory localStorage for progress tests.
beforeEach(() => {
  const store = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
})

describe('journey levels', () => {
  it('builds a playable puzzle for every level, and the answer is accepted', () => {
    for (const def of LEVELS) {
      const game = levelGame(def, 0, 'player-one')
      expect(game.setup.maxGuesses).toBe(def.maxGuesses)
      expect(game.setup.maxHints).toBe(def.maxHints)
      expect(game.setup.length).toBe(game.puzzle.answer.word.length)
      expect(game.validate(game.puzzle.answer.word, game.newState())).toEqual({ ok: true })
    }
  })

  it('has 20 levels in four stages, ramping word length from 4 to 6', () => {
    expect(LEVELS).toHaveLength(20)
    expect(LEVELS.map((l) => l.n)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1))
    expect(levelGame(LEVELS[0], 0, 'p').setup.length).toBe(4)
    expect(levelGame(LEVELS[18], 0, 'p').setup.length).toBe(6)
  })

  it('never shares a word between two levels that use the same pool', () => {
    const groups = new Map<string, Set<string>[]>()
    for (const def of LEVELS.filter((l) => l.part)) {
      const words = new Set(Array.from({ length: 40 }, (_, a) => levelGame(def, a, 'p').puzzle.answer.word))
      groups.set(def.pool, [...(groups.get(def.pool) ?? []), words])
    }
    for (const sets of groups.values()) {
      for (let i = 0; i < sets.length; i++) for (let j = i + 1; j < sets.length; j++) {
        expect([...sets[i]].filter((w) => sets[j].has(w))).toEqual([])
      }
    }
  })

  it('has hundreds of words for every level except the curated Naija list', () => {
    for (const def of LEVELS) if (def.pool !== 'naija') expect(poolSize(def)).toBeGreaterThan(100)
  })

  it('gives different players different words at the same level', () => {
    const words = new Set(Array.from({ length: 20 }, (_, i) => levelGame(LEVELS[1], 0, `player-${i}`).puzzle.answer.word))
    expect(words.size).toBeGreaterThan(15)
  })

  it('never repeats a word for one player until the pool runs out', () => {
    const def = LEVELS[9]
    const seen = new Set<string>()
    for (let a = 0; a < poolSize(def) - 1; a++) {
      const w = levelGame(def, a, 'repeat-check').puzzle.answer.word
      expect(seen.has(w)).toBe(false)
      seen.add(w)
    }
  })
})

describe('journey progress', () => {
  it('unlocks the next level on a win and gives a new word on retry', () => {
    const def = LEVELS[0]
    const game = levelGame(def, 0, 'p')
    const won = game.submit(game.newState(), game.puzzle.answer.word).state
    expect(starsFor(won, game.setup)).toBe(3)
    const p = recordLevel(1, won, game.setup)
    expect(p.unlocked).toBe(2)
    expect(p.attempts[1]).toBe(1)
    expect(levelGame(def, 1, 'p').puzzle.answer.word).not.toBe(game.puzzle.answer.word)
  })

  it('a loss or give-up keeps the level locked ahead', () => {
    const game = levelGame(LEVELS[0], 0, 'p')
    const gaveUp = game.forfeit(game.newState(), 'gave-up')
    expect(gaveUp.status).toBe('lost')
    expect(recordLevel(1, gaveUp, game.setup).unlocked).toBe(1)
    expect(loadJourney().stars[1]).toBeUndefined()
  })

  it('times out: a guess after the deadline is refused', () => {
    const game = levelGame(LEVELS[0], 0, 'p')
    const timed = game.withTimer(game.newState(0), 4, 0)
    expect(timed.deadline).toBe(4 * 60_000)
    const late = game.submit(timed, game.puzzle.answer.word, 5 * 60_000)
    expect(late.accepted).toBe(false)
  })
})
