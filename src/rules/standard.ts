import type { GameRule } from '../engine/types'

/** The control condition. Overrides nothing. */
export const standard: GameRule = {
  id: 'standard',
  version: 1,
  capabilities: [],
  presentation: {
    legend: [{ swatch: 'correct', label: 'Right spot' }, { swatch: 'present', label: 'Wrong spot' }, { swatch: 'absent', label: 'Not in word' }],
    name: 'Classic',
    tagline: 'The game you know. Green, yellow, grey.',
    instructions: [
      'Green: right letter, right spot.',
      'Yellow: in the word, wrong spot.',
      'Grey: not in the word.',
    ],
    example: {
      word: 'CRANE',
      feedback: { kind: 'tiles', marks: ['correct', 'absent', 'present', 'absent', 'absent'] },
      caption: 'C is in place. A is in the word, just elsewhere.',
    },
    theme: { bg: '#F4F1EA', ink: 'dark' },
    motion: 'flip',
  },
}
