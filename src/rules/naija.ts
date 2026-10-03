import { NAIJA_WORDS } from '../data/words'
import { nthOfPermutation } from '../engine/random'
import type { GameRule } from '../engine/types'

export const naija: GameRule = {
  id: 'naija',
  version: 1,
  capabilities: ['answer', 'setup', 'vocabulary'],
  presentation: {
    legend: [{ swatch: 'correct', label: 'Right spot' }, { swatch: 'present', label: 'Wrong spot' }, { swatch: 'absent', label: 'Not in word' }],
    name: 'Naija',
    tagline: 'Today the word speaks Pidgin or Yoruba.',
    instructions: [
      'The answer is a Pidgin or Yoruba word in everyday Nigerian use.',
      'English words still count as guesses.',
      'Colours work like Classic. You’ll learn what it means at the end.',
    ],
    example: {
      word: 'OKADA',
      feedback: { kind: 'tiles', marks: ['correct', 'absent', 'correct', 'absent', 'present'] },
      caption: 'Okada: a motorcycle taxi. Words like this count.',
    },
    theme: { bg: '#0E9F5A', ink: 'light' },
    motion: 'drum',
  },

  pickAnswer: ({ occurrence }) => ({ entry: nthOfPermutation(NAIJA_WORDS, 'naija', occurrence) }),

  setup: () => ({ hint: { kind: 'language', label: 'Pidgin and Yoruba', prompt: 'Today’s language' } }),

  inVocabulary: (word, { dictionary }) => dictionary.has(word) || NAIJA_WORDS.some((e) => e.word === word),
}
