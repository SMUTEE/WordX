import type { Guess, Mark } from '../engine/types'
import { BAND } from './theme'

const SAY: Record<Mark, string> = { correct: 'right spot', present: 'wrong spot', absent: 'not in word' }

/** What a screen reader hears after a guess lands, e.g. "CRANE: C right spot, R not in word…". */
export function describeGuess(g: Guess, by?: string): string {
  const who = by ? `${by} played ` : ''
  if (g.feedback.kind === 'meter') {
    return `${who}${g.word}: ${Math.round(g.feedback.value * 100)} degrees, ${BAND[g.feedback.band].label.toLowerCase()}.`
  }
  const marks = g.feedback.marks
  return `${who}${g.word}: ${[...g.word].map((c, i) => `${c} ${SAY[marks[i]]}`).join(', ')}.`
}
