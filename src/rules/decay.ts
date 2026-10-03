import type { GameRule, GameState } from '../engine/types'

/** Letters played that turned out not to be in the answer at all. */
export function burnedLetters(state: GameState): Set<string> {
  const hit = new Set<string>()
  const miss = new Set<string>()
  for (const g of state.guesses) {
    if (g.feedback.kind !== 'tiles') continue
    const marks = g.feedback.marks
    ;[...g.word].forEach((c, i) => (marks[i] === 'absent' ? miss : hit).add(c))
  }
  return new Set([...miss].filter((c) => !hit.has(c)))
}

export const decay: GameRule = {
  id: 'decay',
  version: 1,
  capabilities: ['validation', 'keyboard'],
  presentation: {
    legend: [{ swatch: 'correct', label: 'Right spot' }, { swatch: 'present', label: 'Wrong spot' }, { swatch: 'burned', label: 'Burned' }],
    name: 'Decay',
    tagline: 'Miss a letter and it burns out.',
    instructions: [
      'Letters that aren’t in the word burn and can’t be typed again.',
      'Green and yellow letters stay alive.',
      'A word with a burned letter is refused and doesn’t use a try.',
    ],
    example: {
      word: 'STARE',
      feedback: { kind: 'tiles', marks: ['absent', 'correct', 'present', 'absent', 'absent'] },
      caption: 'S, R and E burn out. T and A live on.',
    },
    theme: { bg: '#2E5BFF', ink: 'light' },
    motion: 'burn',
  },

  validateGuess(word, state) {
    const burned = burnedLetters(state)
    const bad = [...new Set(word)].filter((c) => burned.has(c))
    if (bad.length) return { ok: false, code: 'burned', message: `${bad.join(', ')} burned out`, letters: bad }
    return { ok: true }
  },

  keyStates(state, _ctx, base) {
    const out = { ...base }
    for (const c of burnedLetters(state)) out[c] = 'burned'
    return out
  },
}
