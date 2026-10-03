import { COMMON_ANSWERS, type WordEntry } from '../data/words'
import { nthOfPermutation, shuffled } from '../engine/random'
import type { Dictionary, GameRule } from '../engine/types'

const signature = (word: string) => [...word].sort().join('')

let uniqueCache: WordEntry[] | undefined

/** Answers whose letters spell no other word in the dictionary, so there is one true order. */
export function uniqueAnagramAnswers(dictionary: Dictionary): WordEntry[] {
  if (uniqueCache) return uniqueCache
  const counts = new Map<string, number>()
  for (const w of dictionary.words) counts.set(signature(w), (counts.get(signature(w)) ?? 0) + 1)
  uniqueCache = COMMON_ANSWERS.filter((e) => counts.get(signature(e.word)) === 1 && new Set(e.word).size >= 4)
  return uniqueCache
}

const isPermutationOf = (word: string, letters: string[]) => signature(word) === [...letters].sort().join('')

export const anagram: GameRule = {
  id: 'anagram',
  version: 1,
  capabilities: ['answer', 'setup', 'vocabulary', 'validation', 'keyboard'],
  presentation: {
    legend: [{ swatch: 'correct', label: 'Right spot' }, { swatch: 'present', label: 'Move it' }],
    name: 'Anagram',
    tagline: 'You have the letters. Find the order.',
    instructions: [
      'Every try uses exactly today’s five letters.',
      'Any arrangement counts, even if it isn’t a word.',
      'Green: in place. Yellow: needs moving.',
    ],
    example: {
      word: 'NOMEL',
      feedback: { kind: 'tiles', marks: ['present', 'present', 'present', 'correct', 'present'] },
      caption: 'E is in place. Shuffle the rest.',
    },
    theme: { bg: '#9B7BFF', ink: 'dark' },
    motion: 'spin',
  },

  pickAnswer({ occurrence, dictionary }) {
    return { entry: nthOfPermutation(uniqueAnagramAnswers(dictionary), 'anagram', occurrence) }
  },

  setup(puzzle) {
    const answer = puzzle.answer.word
    let letters = shuffled([...answer], puzzle.seed)
    for (let salt = 1; letters.join('') === answer; salt++) letters = shuffled([...answer], puzzle.seed + salt)
    return { hint: { kind: 'letters', letters } }
  },

  validateGuess(word, _state, { setup }) {
    const letters = setup.hint?.kind === 'letters' ? setup.hint.letters : []
    if (!isPermutationOf(word, letters)) {
      return { ok: false, code: 'letters', message: 'Use exactly today’s letters' }
    }
    return { ok: true }
  },

  // Any arrangement of the letters is a legal move — the puzzle is the order.
  inVocabulary: () => true,

  keyStates(_state, { setup }) {
    const allowed = new Set(setup.hint?.kind === 'letters' ? setup.hint.letters : [])
    const out: Record<string, 'idle' | 'disabled'> = {}
    for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') out[c] = allowed.has(c) ? 'idle' : 'disabled'
    return out
  },
}
