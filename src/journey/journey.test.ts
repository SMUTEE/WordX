import { beforeEach, describe, expect, it } from 'vitest'
import { CLUES } from '../data/clues.generated'
import { compose } from '../ui/useGame'
import { LEVELS, STAGES, levelGame, levelPuzzleId, poolSize } from './levels'
import { loadJourney, pointsFor, recordLevel, starsFor, totalPoints } from './progress'

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

  it('has 100 levels in stages that cover every level once, ramping word length from 4 to 6', () => {
    expect(LEVELS).toHaveLength(100)
    expect(LEVELS.map((l) => l.n)).toEqual(Array.from({ length: 100 }, (_, i) => i + 1))
    expect(STAGES[0].from).toBe(1)
    STAGES.forEach((s, i) => i && expect(s.from).toBe(STAGES[i - 1].to + 1))
    expect(STAGES.at(-1)!.to).toBe(100)
    expect(levelGame(LEVELS[0], 0, 'p').setup.length).toBe(4)
    expect(levelGame(LEVELS[18], 0, 'p').setup.length).toBe(6)
  })

  it('later stages are never easier: tries and hints only go down (Fog and Liar get their usual extra tries)', () => {
    const base = (d: (typeof LEVELS)[number]) => d.maxGuesses - (d.ruleId === 'fog' ? 2 : d.ruleId === 'liar' ? 1 : 0)
    const later = LEVELS.slice(20)
    for (let i = 1; i < later.length; i++) {
      expect(later[i].maxHints).toBeLessThanOrEqual(Math.max(...later.slice(0, i).map((d) => d.maxHints)))
    }
    expect(Math.min(...later.slice(-10).map(base))).toBe(4)
  })

  it('has a clue for every word a level can pick, so Easy always works', () => {
    for (const def of LEVELS) {
      for (let a = 0; a < 5; a++) {
        const word = levelGame(def, a, 'clue-check', 'easy').puzzle.answer.word
        expect(CLUES[word], `${def.n} ${word}`).toBeTruthy()
        expect(CLUES[word].toUpperCase()).not.toContain(word)
      }
    }
  })

  it('Easy and Scholar play the same word with the same tries; only the id differs', () => {
    const def = LEVELS[7]
    const easy = levelGame(def, 0, 'p', 'easy')
    const scholar = levelGame(def, 0, 'p', 'scholar')
    expect(easy.puzzle.answer.word).toBe(scholar.puzzle.answer.word)
    expect(easy.setup.maxGuesses).toBe(scholar.setup.maxGuesses)
    expect(scholar.puzzle.id).toBe(levelPuzzleId(8, 0, 'scholar'))
    expect(easy.puzzle.id).not.toBe(scholar.puzzle.id)
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
    for (const def of LEVELS) if (def.pool !== 'naija') expect(poolSize(def)).toBeGreaterThan(75)
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

  it('scores points: Scholar is 1.6× Easy, rounded to 10, and the best per level counts', () => {
    const game = levelGame(LEVELS[0], 0, 'p')
    const won = game.submit(game.newState(), game.puzzle.answer.word).state
    // Level 1, 7 tries, solved in 1: 100 + 5 + 20 × 6 = 225.
    expect(pointsFor(1, won, game.setup, 'easy')).toBe(230)
    expect(pointsFor(1, won, game.setup, 'scholar')).toBe(360)
    recordLevel(1, won, game.setup, 'easy')
    expect(totalPoints(loadJourney())).toBe(230)
    recordLevel(1, won, game.setup, 'scholar')
    expect(totalPoints(loadJourney())).toBe(360)
    expect(loadJourney().cleared[1]).toBe('scholar')
    expect(pointsFor(1, game.forfeit(game.newState(), 'gave-up'), game.setup, 'scholar')).toBe(0)
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

describe('typing', () => {
  it('a cleared letter leaves a gap that the next letter fills, around locked letters', () => {
    expect(compose(5, {}, ['C', '', 'A'])).toEqual(['C', '', 'A', '', ''])
    expect(compose(5, { 1: 'R' }, ['C', 'A', '', 'E'])).toEqual(['C', 'R', 'A', '', 'E'])
  })
})
