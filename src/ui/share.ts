import type { GameRule, GameState, Puzzle } from '../engine/types'
import { BAND } from './theme'

const TILE = { correct: '🟩', present: '🟨', absent: '⬛' } as const

/** A result you can paste anywhere without spoiling the answer. */
export function shareText(puzzle: Puzzle, rule: GameRule, state: GameState, max: number, team?: { crew: string; link: string }): string {
  const hintCount = state.hints?.length ?? 0
  const score = `${state.status === 'won' ? `${state.guesses.length}/${max}` : `X/${max}`}${hintCount ? ` 💡${hintCount}` : ''}`
  const rows = state.guesses.map((g) =>
    g.feedback.kind === 'tiles'
      ? g.feedback.marks.map((m) => TILE[m]).join('')
      : `${BAND[g.feedback.band].emoji} ${Math.round(g.feedback.value * 100)}°`,
  )
  if (team) {
    return [`WordX with friends · ${rule.presentation.name.toUpperCase()} ${score}`, ...rows, `Played by ${team.crew}`, team.link].join('\n')
  }
  return [`WordX #${puzzle.number} · ${rule.presentation.name.toUpperCase()} ${score}`, ...rows, location.origin].join('\n')
}

export async function share(text: string, url?: string): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      await navigator.share(url ? { text, url } : { text })
      return 'shared'
    }
    await navigator.clipboard.writeText(url ? `${text}\n${url}` : text)
    return 'copied'
  } catch {
    return 'failed'
  }
}
