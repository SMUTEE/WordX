import { describe, expect, it } from 'vitest'
import { POOLS } from '../data/pools.generated'
import { createRng } from '../engine/random'
import { scoreMarks } from '../engine/scoring'
import { LEVELS, levelGame } from '../journey/levels'

/**
 * Liar must stay deducible: a player who keeps only words where exactly one tile per row
 * could be lying should still crack it within the level's tries.
 */
describe('liar solvability', () => {
  it('a logical player wins level 20 within 7 tries', () => {
    const universe = [...new Set([...POOLS.five_easy.split(' '), ...POOLS.five_common.split(' '), ...POOLS.five_medium.split(' ')])]
    const def = LEVELS.find((l) => l.n === 20)!
    const differs = (a: string[], b: string[]) => a.reduce((n, x, i) => n + (x !== b[i] ? 1 : 0), 0)
    let wins = 0
    const trials = 25
    for (let t = 0; t < trials; t++) {
      const game = levelGame(def, t, 'solver')
      let state = game.newState()
      let cands = [...new Set([...universe, game.puzzle.answer.word])]
      const rows: { word: string; shown: string[] }[] = []
      const rng = createRng(t)
      for (let k = 0; k < def.maxGuesses && state.status === 'playing'; k++) {
        const guess = k === 0 ? 'SLATE' : cands[rng.int(Math.min(cands.length, 3))]
        const r = game.submit(state, guess)
        if (!r.accepted) {
          cands = cands.filter((c) => c !== guess)
          k--
          continue
        }
        state = r.state
        if (r.guess.feedback.kind === 'tiles') rows.push({ word: guess, shown: r.guess.feedback.marks })
        cands = cands.filter((c) => c !== guess && rows.every((row) => differs(scoreMarks(row.word, c), row.shown) === 1))
      }
      if (state.status === 'won') wins++
    }
    expect(wins / trials).toBeGreaterThanOrEqual(0.8)
  })
})
