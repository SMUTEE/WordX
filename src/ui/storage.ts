import { addDays } from '../engine/schedule'
import type { GameState, Puzzle } from '../engine/types'

const PREFIX = 'wordx:v1:'

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Private mode or storage full — the game still works for this visit.
  }
}

export const loadSession = (puzzleId: string) => read<GameState>(`session:${puzzleId}`)
export const saveSession = (state: GameState) => write(`session:${state.puzzleId}`, state)

export interface Stats {
  played: number
  won: number
  currentStreak: number
  maxStreak: number
  lastWonDate?: string
  /** guesses-to-win → count */
  distribution: Record<number, number>
  recorded: string[]
}

const EMPTY: Stats = { played: 0, won: 0, currentStreak: 0, maxStreak: 0, distribution: {}, recorded: [] }

export const loadStats = (): Stats => ({ ...EMPTY, ...read<Stats>('stats') })

/** Records a finished drop once. Previews and relays never count. */
export function recordResult(puzzle: Puzzle, state: GameState): Stats {
  const stats = loadStats()
  if (puzzle.preview || state.status === 'playing' || stats.recorded.includes(puzzle.id)) return stats

  const won = state.status === 'won'
  // A streak is days in a row with at least one solved drop; a miss never breaks it.
  let currentStreak = liveStreak(stats, puzzle.date)
  if (won && stats.lastWonDate !== puzzle.date) currentStreak += 1
  const next: Stats = {
    played: stats.played + 1,
    won: stats.won + (won ? 1 : 0),
    currentStreak,
    maxStreak: Math.max(stats.maxStreak, currentStreak),
    lastWonDate: won ? puzzle.date : stats.lastWonDate,
    distribution: won
      ? { ...stats.distribution, [state.guesses.length]: (stats.distribution[state.guesses.length] ?? 0) + 1 }
      : stats.distribution,
    recorded: [...stats.recorded.slice(-200), puzzle.id],
  }
  write('stats', next)
  return next
}

/** The streak as of `today`: it lapses once a whole day passes without a solve. */
export function liveStreak(stats: Stats, today: string): number {
  if (!stats.lastWonDate) return 0
  return stats.lastWonDate === today || stats.lastWonDate === addDays(today, -1) ? stats.currentStreak : 0
}

export const hasSeenHelp = () => read<boolean>('seen-help') === true
export const markSeenHelp = () => write('seen-help', true)

/** The player's last timer choice in minutes (null = no timer). */
export function loadTimerPref(): number | null {
  const v = read<number>('timer')
  return v === 4 || v === 5 || v === 10 ? v : null
}
export const saveTimerPref = (minutes: number | null) => write('timer', minutes ?? 0)

// ---------- Activity: what the home page's streak and week view are built from ----------

export interface DayActivity {
  played: number
  won: number
}

/** Your local calendar day, e.g. "2026-10-03". Streaks follow your day, not UTC. */
export const localDay = (d: Date = new Date()) => d.toLocaleDateString('en-CA')

const shiftDay = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00`)
  d.setDate(d.getDate() + n)
  return localDay(d)
}

export const loadActivity = (): Record<string, DayActivity> => read<Record<string, DayActivity>>('activity') ?? {}

/** Any finished game, in any mode, counts toward the streak. */
export function recordActivity(won: boolean, day = localDay()) {
  const all = loadActivity()
  const today = all[day] ?? { played: 0, won: 0 }
  all[day] = { played: today.played + 1, won: today.won + (won ? 1 : 0) }
  // Keep a year.
  const keep = Object.keys(all).sort().slice(-370)
  write('activity', Object.fromEntries(keep.map((k) => [k, all[k]])))
}

export interface StreakSummary {
  current: number
  best: number
  playedToday: boolean
  /** The last 7 days, oldest first. */
  week: { day: string; label: string; played: boolean; today: boolean }[]
  totalPlayed: number
  totalWon: number
}

/** Days in a row with at least one finished game. Today still counts as "alive" until midnight. */
export function streakSummary(today = localDay()): StreakSummary {
  const all = loadActivity()
  const played = (d: string) => (all[d]?.played ?? 0) > 0
  let current = 0
  for (let d = played(today) ? today : shiftDay(today, -1); played(d); d = shiftDay(d, -1)) current++
  let best = 0
  let run = 0
  let prev: string | null = null
  for (const d of Object.keys(all).sort()) {
    if (!played(d)) continue
    run = prev && shiftDay(prev, 1) === d ? run + 1 : 1
    best = Math.max(best, run)
    prev = d
  }
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = shiftDay(today, i - 6)
    const label = new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' })
    return { day, label, played: played(day), today: day === today }
  })
  const totals = Object.values(all).reduce((a, x) => ({ p: a.p + x.played, w: a.w + x.won }), { p: 0, w: 0 })
  return { current, best: Math.max(best, current), playedToday: played(today), week, totalPlayed: totals.p, totalWon: totals.w }
}

export const hasOnboarded = () => read<boolean>('onboarded') === true
export const markOnboarded = () => write('onboarded', true)

export const loadContrast = () => read<boolean>('contrast') === true
export const saveContrast = (on: boolean) => write('contrast', on)
