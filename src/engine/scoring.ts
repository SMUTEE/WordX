import type { Feedback, Mark } from './types'

/** Standard positional scoring with correct duplicate-letter handling. */
export function scoreMarks(guess: string, answer: string): Mark[] {
  const marks: Mark[] = Array(guess.length).fill('absent')
  const remaining = new Map<string, number>()

  for (let i = 0; i < answer.length; i++) {
    if (guess[i] === answer[i]) marks[i] = 'correct'
    else remaining.set(answer[i], (remaining.get(answer[i]) ?? 0) + 1)
  }
  for (let i = 0; i < guess.length; i++) {
    if (marks[i] === 'correct') continue
    const left = remaining.get(guess[i]) ?? 0
    if (left > 0) {
      marks[i] = 'present'
      remaining.set(guess[i], left - 1)
    }
  }
  return marks
}

export function standardFeedback(guess: string, answer: string): Feedback {
  return { kind: 'tiles', marks: scoreMarks(guess, answer) }
}

const MARK_RANK: Record<Mark, number> = { absent: 1, present: 2, correct: 3 }

export function bestMark(a: Mark | undefined, b: Mark): Mark {
  return !a || MARK_RANK[b] > MARK_RANK[a] ? b : a
}
