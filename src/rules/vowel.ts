import { COMMON_ANSWERS } from '../data/words'
import { nthOfPermutation, saltedKey } from '../engine/random'
import type { GameRule } from '../engine/types'

/** Y is always a consonant on Vowel day. */
export const VOWELS = new Set(['A', 'E', 'I', 'O', 'U'])

const vowelCount = (w: string) => [...w].filter((c) => VOWELS.has(c)).length
const POOL = COMMON_ANSWERS.filter((e) => vowelCount(e.word) >= 1 && vowelCount(e.word) <= 2)

export const vowel: GameRule = {
  id: 'vowel',
  version: 1,
  capabilities: ['answer', 'setup', 'validation', 'keyboard'],
  presentation: {
    legend: [{ swatch: 'locked', label: 'Given' }, { swatch: 'correct', label: 'Right spot' }, { swatch: 'present', label: 'Wrong spot' }, { swatch: 'absent', label: 'Not in word' }],
    name: 'Vowels',
    tagline: 'Every vowel is placed. Find the rest.',
    instructions: [
      'All vowels in the answer are locked in place.',
      'You only type the consonants. Y counts as one.',
      'Colours work like Classic.',
    ],
    example: {
      word: 'MAPLE',
      feedback: { kind: 'tiles', marks: ['absent', 'correct', 'present', 'correct', 'correct'] },
      caption: 'A and E were given. P is in the word, elsewhere.',
    },
    theme: { bg: '#16C7C0', ink: 'dark' },
    motion: 'lock',
  },

  pickAnswer: ({ occurrence, salt }) => ({ entry: nthOfPermutation(POOL, saltedKey('vowel', salt), occurrence) }),

  setup(puzzle) {
    const locked: Record<number, string> = {}
    ;[...puzzle.answer.word].forEach((c, i) => {
      if (VOWELS.has(c)) locked[i] = c
    })
    return { locked }
  },

  validateGuess(word, _state, { setup }) {
    const stray = [...word].filter((c, i) => VOWELS.has(c) && setup.locked[i] !== c)
    if (stray.length) return { ok: false, code: 'vowel', message: 'Vowels are already placed', letters: stray }
    return { ok: true }
  },

  keyStates(_state, _ctx, base) {
    const out = { ...base }
    for (const v of VOWELS) out[v] = 'disabled'
    return out
  },
}
