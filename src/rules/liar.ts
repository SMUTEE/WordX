import { hashString, createRng } from '../engine/random'
import { scoreMarks } from '../engine/scoring'
import type { GameRule, Mark } from '../engine/types'

const MARKS: Mark[] = ['correct', 'present', 'absent']

/** Behind a schedule flag until solver testing proves every day is deducible. */
export const liar: GameRule = {
  id: 'liar',
  version: 1,
  capabilities: ['setup', 'scoring', 'keyboard'],
  presentation: {
    legend: [{ swatch: 'correct', label: 'Right spot' }, { swatch: 'present', label: 'Wrong spot' }, { swatch: 'absent', label: 'Not in word' }],
    name: 'Liar',
    tagline: 'One tile in every row is lying.',
    instructions: [
      'Exactly one tile per guess shows the wrong colour.',
      'It never tells you which one.',
      'The keyboard won’t help — you get 7 tries.',
    ],
    example: {
      word: 'CRANE',
      feedback: { kind: 'tiles', marks: ['correct', 'present', 'present', 'absent', 'absent'] },
      caption: 'One of these five is false. Cross-check your rows.',
    },
    theme: { bg: '#FF3B5C', ink: 'dark' },
    motion: 'glitch',
  },

  setup: () => ({ maxGuesses: 7 }),

  scoreGuess(word, answer, { puzzle, guessIndex }) {
    const truth = scoreMarks(word, answer)
    if (word === answer) return { kind: 'tiles', marks: truth }
    // Seeded by puzzle and row, so a reload shows the same lie.
    const rng = createRng(hashString(`${puzzle.seed}:${guessIndex}`))
    const index = rng.int(truth.length)
    const others = MARKS.filter((m) => m !== truth[index])
    const marks = truth.slice()
    marks[index] = others[rng.int(others.length)]
    return { kind: 'tiles', marks }
  },

  keyStates(state) {
    const out: Record<string, 'used'> = {}
    for (const g of state.guesses) for (const c of g.word) out[c] = 'used'
    return out
  },
}
