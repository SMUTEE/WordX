import { scoreMarks } from '../engine/scoring'
import type { Feedback, GameRule, TemperatureBand } from '../engine/types'

/** Normalised positional similarity: a green is worth two yellows. 1 means solved. */
export function temperature(guess: string, answer: string): number {
  if (guess === answer) return 1
  const marks = scoreMarks(guess, answer)
  const points = marks.reduce((sum, m) => sum + (m === 'correct' ? 2 : m === 'present' ? 1 : 0), 0)
  // Cap below 1 so only the answer itself reads 100°.
  return Math.min(points / (2 * answer.length), 0.99)
}

export function bandFor(value: number): TemperatureBand {
  if (value >= 1) return 'solved'
  if (value >= 0.8) return 'blazing'
  if (value >= 0.6) return 'hot'
  if (value >= 0.4) return 'warm'
  if (value >= 0.2) return 'cold'
  return 'freezing'
}

export const fog: GameRule = {
  id: 'fog',
  version: 1,
  capabilities: ['setup', 'scoring'],
  presentation: {
    legend: [{ swatch: 'cold', label: 'Cold' }, { swatch: 'warm', label: 'Warm' }, { swatch: 'hot', label: 'Hot' }, { swatch: 'solved', label: '100° wins' }],
    name: 'Fog',
    tagline: 'No colours. Only temperature.',
    instructions: [
      'You won’t see which letters are right.',
      'Each guess gets a temperature: green letters count double.',
      'Hit 100° to win. You get 8 tries.',
    ],
    example: {
      word: 'CLOUD',
      feedback: { kind: 'meter', value: 0.7, band: 'hot' },
      caption: '70° and hot. You’re close.',
    },
    theme: { bg: '#FF5A1F', ink: 'dark' },
    motion: 'fog',
  },

  setup: () => ({ maxGuesses: 8, feedbackKind: 'meter' }),

  scoreGuess(word, answer): Feedback {
    const value = temperature(word, answer)
    return { kind: 'meter', value, band: bandFor(value) }
  },
}
