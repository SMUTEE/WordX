/** What /api/admin/stats returns: shared by the server (server/stats.ts) and the stats page. */
export interface DayCount {
  day: string
  n: number
}

export interface StatsView {
  generatedAt: number
  totals: { players: number; named: number; activeToday: number; active7: number; gamesFinished: number; gamesToday: number }
  newPlayers: DayCount[]
  activePlayers: DayCount[]
  retention: { day1: { cohort: number; back: number }; day7: { cohort: number; back: number } }
  modes: { mode: string; games: number; won: number }[]
  drop: { day: string; plays: number; won: number; gaveUp: number; avgTries: number | null }[]
  rules: { rule: string; games: number; won: number; avgTries: number | null }[]
  journey: {
    reached: { level: number; players: number }[]
    stuck: { level: number; losses: number; wins: number }[]
    difficulty: { difficulty: string; games: number; won: number }[]
    topPoints: { name: string | null; player: string; points: number; levels: number }[]
  }
  friends: { created: number; started: number; finished: { reason: string; n: number }[] }
  recent: { at: number; name: string | null; kind: string; mode: string | null; rule: string | null; level: number | null; result: string | null }[]
}
