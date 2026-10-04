/**
 * Anonymous usage stats: the events the app reports, and the numbers on the private /admin page.
 * Plain SQL, so the same code runs on Cloudflare D1 and on Node's built-in SQLite.
 */
import { USERNAME_RE } from '../src/net/protocol'
import type { Room } from './rooms'
import type { DayCount, StatsView } from '../src/net/statsView'

export type { DayCount, StatsView }

/** The database, whatever runs it. */
export interface Sql {
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>
  run(sql: string, params?: unknown[]): Promise<void>
}

export type EventKind = 'open' | 'finish' | 'room_created' | 'room_started' | 'room_finished'
/** What the app itself may report; room events come from the server. */
const CLIENT_KINDS = new Set<EventKind>(['open', 'finish'])

export interface EventRow {
  at: number
  day: string
  player: string
  name: string | null
  kind: EventKind
  ref: string | null
  mode: string | null
  rule: string | null
  level: number | null
  difficulty: string | null
  result: string | null
  reason: string | null
  tries: number | null
  max_tries: number | null
  hints: number | null
  points: number | null
}

const pick = <T extends string>(v: unknown, allowed: readonly T[]): T | null => (allowed.includes(v as T) ? (v as T) : null)
const int = (v: unknown, lo: number, hi: number): number | null => (Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi ? (v as number) : null)
const str = (v: unknown, re: RegExp): string | null => (typeof v === 'string' && re.test(v) ? v : null)
export const utcDay = (at: number) => new Date(at).toISOString().slice(0, 10)

/** Validates an event from the app. Anything unexpected is dropped, never stored. */
export function eventFromClient(body: unknown, now = Date.now()): EventRow | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>
  const kind = pick(b.kind, [...CLIENT_KINDS])
  const player = str(b.player, /^[a-z0-9]{6,32}$/)
  if (!kind || !player) return { error: 'Bad event' }
  return serverEvent(kind, player, now, {
    name: typeof b.name === 'string' && USERNAME_RE.test(b.name) ? b.name : null,
    ref: str(b.ref, /^[\w:|@.-]{1,64}$/),
    mode: pick(b.mode, ['drop', 'journey', 'friends', 'practice'] as const),
    rule: str(b.rule, /^[a-z]{2,16}$/),
    level: int(b.level, 1, 999),
    difficulty: pick(b.difficulty, ['easy', 'scholar'] as const),
    result: pick(b.result, ['won', 'lost'] as const),
    reason: pick(b.reason, ['tries', 'time', 'gave-up', 'ended'] as const),
    tries: int(b.tries, 0, 12),
    max_tries: int(b.maxTries, 1, 12),
    hints: int(b.hints, 0, 4),
    points: int(b.points, 0, 5000),
  })
}

export function serverEvent(kind: EventKind, player: string, now: number, fields: Partial<EventRow> = {}): EventRow {
  return {
    at: now, day: utcDay(now), player, kind,
    name: null, ref: null, mode: null, rule: null, level: null, difficulty: null, result: null, reason: null, tries: null, max_tries: null, hints: null, points: null,
    ...fields,
  }
}

const COLS = ['at', 'day', 'player', 'kind', 'ref', 'mode', 'rule', 'level', 'difficulty', 'result', 'reason', 'tries', 'max_tries', 'hints', 'points'] as const

/** Stores an event and keeps the player's row current. A game reported twice is counted once. */
export async function recordEvent(db: Sql, e: EventRow): Promise<void> {
  await db.run(
    `INSERT INTO stat_players (id, name, first_seen, first_day, last_seen) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET last_seen = excluded.last_seen, name = COALESCE(excluded.name, stat_players.name)`,
    [e.player, e.name, e.at, e.day, e.at],
  )
  await db.run(`INSERT OR IGNORE INTO stat_events (${COLS.join(', ')}) VALUES (${COLS.map(() => '?').join(', ')})`, COLS.map((c) => e[c]))
}

/** The schema, for Node's SQLite (D1 applies migrations/0001_stats.sql). */
export const STATS_SCHEMA = `
CREATE TABLE IF NOT EXISTS stat_players (id TEXT PRIMARY KEY, name TEXT, first_seen INTEGER NOT NULL, first_day TEXT NOT NULL, last_seen INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS stat_events (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, day TEXT NOT NULL, player TEXT NOT NULL, kind TEXT NOT NULL, ref TEXT, mode TEXT, rule TEXT, level INTEGER, difficulty TEXT, result TEXT, reason TEXT, tries INTEGER, max_tries INTEGER, hints INTEGER, points INTEGER);
CREATE INDEX IF NOT EXISTS stat_events_day ON stat_events (day);
CREATE INDEX IF NOT EXISTS stat_events_kind_day ON stat_events (kind, day);
CREATE INDEX IF NOT EXISTS stat_players_first_day ON stat_players (first_day);
CREATE UNIQUE INDEX IF NOT EXISTS stat_events_once ON stat_events (player, kind, ref) WHERE ref IS NOT NULL;
`

const days = (from: number, count: number) => Array.from({ length: count }, (_, i) => utcDay(from - (count - 1 - i) * 86_400_000))
/** Fills missing days with 0 so charts have a bar for every day. */
const series = (rows: DayCount[], from: number, count: number): DayCount[] => {
  const m = new Map(rows.map((r) => [r.day, Number(r.n)]))
  return days(from, count).map((day) => ({ day, n: m.get(day) ?? 0 }))
}

export async function computeStats(db: Sql, now = Date.now()): Promise<StatsView> {
  const today = utcDay(now)
  const since30 = utcDay(now - 29 * 86_400_000)
  const since14 = utcDay(now - 13 * 86_400_000)
  const since7 = utcDay(now - 6 * 86_400_000)
  const one = async <T>(sql: string, params: unknown[] = []) => (await db.all<T>(sql, params))[0]
  const n = (v: unknown) => Number(v ?? 0)

  const [players, named, activeToday, active7, games, gamesToday] = await Promise.all([
    one<{ n: number }>('SELECT COUNT(*) AS n FROM stat_players'),
    one<{ n: number }>('SELECT COUNT(*) AS n FROM stat_players WHERE name IS NOT NULL'),
    one<{ n: number }>('SELECT COUNT(DISTINCT player) AS n FROM stat_events WHERE day = ?', [today]),
    one<{ n: number }>('SELECT COUNT(DISTINCT player) AS n FROM stat_events WHERE day >= ?', [since7]),
    one<{ n: number }>("SELECT COUNT(*) AS n FROM stat_events WHERE kind = 'finish'"),
    one<{ n: number }>("SELECT COUNT(*) AS n FROM stat_events WHERE kind = 'finish' AND day = ?", [today]),
  ])

  const newPlayers = series(await db.all<DayCount>('SELECT first_day AS day, COUNT(*) AS n FROM stat_players WHERE first_day >= ? GROUP BY first_day', [since30]), now, 30)
  const activePlayers = series(await db.all<DayCount>('SELECT day, COUNT(DISTINCT player) AS n FROM stat_events WHERE day >= ? GROUP BY day', [since30]), now, 30)

  // Retention: of players who started at least N days ago, how many played again exactly N days later.
  const retention = async (k: number) => {
    const r = await one<{ cohort: number; back: number }>(
      `SELECT COUNT(*) AS cohort,
              SUM(CASE WHEN EXISTS (SELECT 1 FROM stat_events e WHERE e.player = p.id AND e.day = date(p.first_day, '+${k} day')) THEN 1 ELSE 0 END) AS back
       FROM stat_players p WHERE p.first_day <= date(?, '-${k} day')`,
      [today],
    )
    return { cohort: n(r?.cohort), back: n(r?.back) }
  }

  const modes = await db.all<{ mode: string; games: number; won: number }>(
    "SELECT mode, COUNT(*) AS games, SUM(result = 'won') AS won FROM stat_events WHERE kind = 'finish' AND mode IS NOT NULL GROUP BY mode ORDER BY games DESC",
  )
  const drop = await db.all<{ day: string; plays: number; won: number; gaveUp: number; avgTries: number | null }>(
    `SELECT day, COUNT(*) AS plays, SUM(result = 'won') AS won, SUM(reason = 'gave-up') AS gaveUp,
            ROUND(AVG(CASE WHEN result = 'won' THEN tries END), 2) AS avgTries
     FROM stat_events WHERE kind = 'finish' AND mode = 'drop' AND day >= ? GROUP BY day ORDER BY day DESC`,
    [since14],
  )
  const rules = await db.all<{ rule: string; games: number; won: number; avgTries: number | null }>(
    `SELECT rule, COUNT(*) AS games, SUM(result = 'won') AS won, ROUND(AVG(CASE WHEN result = 'won' THEN tries END), 2) AS avgTries
     FROM stat_events WHERE kind = 'finish' AND rule IS NOT NULL GROUP BY rule ORDER BY games DESC`,
  )
  const reached = await db.all<{ level: number; players: number }>(
    `SELECT level, COUNT(*) AS players FROM (
       SELECT player, MAX(level) AS level FROM stat_events WHERE kind = 'finish' AND mode = 'journey' AND result = 'won' GROUP BY player
     ) GROUP BY level ORDER BY level`,
  )
  const stuck = await db.all<{ level: number; losses: number; wins: number }>(
    `SELECT level, SUM(result = 'lost') AS losses, SUM(result = 'won') AS wins FROM stat_events
     WHERE kind = 'finish' AND mode = 'journey' GROUP BY level HAVING losses > 0 ORDER BY losses DESC, level LIMIT 10`,
  )
  const difficulty = await db.all<{ difficulty: string; games: number; won: number }>(
    "SELECT difficulty, COUNT(*) AS games, SUM(result = 'won') AS won FROM stat_events WHERE kind = 'finish' AND mode = 'journey' AND difficulty IS NOT NULL GROUP BY difficulty",
  )
  // Points the way the app counts them: each player's best per level, added up.
  const topPoints = await db.all<{ name: string | null; player: string; points: number; levels: number }>(
    `SELECT p.name AS name, b.player AS player, SUM(b.best) AS points, COUNT(*) AS levels FROM (
       SELECT player, level, MAX(points) AS best FROM stat_events WHERE kind = 'finish' AND mode = 'journey' AND result = 'won' GROUP BY player, level
     ) b JOIN stat_players p ON p.id = b.player GROUP BY b.player ORDER BY points DESC LIMIT 10`,
  )
  const [created, started] = await Promise.all([
    one<{ n: number }>("SELECT COUNT(*) AS n FROM stat_events WHERE kind = 'room_created'"),
    one<{ n: number }>("SELECT COUNT(*) AS n FROM stat_events WHERE kind = 'room_started'"),
  ])
  const finished = await db.all<{ reason: string; n: number }>(
    "SELECT COALESCE(reason, result) AS reason, COUNT(*) AS n FROM stat_events WHERE kind = 'room_finished' GROUP BY COALESCE(reason, result) ORDER BY n DESC",
  )
  const recent = await db.all<StatsView['recent'][number]>(
    `SELECT e.at AS at, p.name AS name, e.kind AS kind, e.mode AS mode, e.rule AS rule, e.level AS level, e.result AS result
     FROM stat_events e LEFT JOIN stat_players p ON p.id = e.player WHERE e.kind != 'open' ORDER BY e.at DESC LIMIT 25`,
  )

  const num = <T extends Record<string, unknown>>(rows: T[]) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v])) as T)
  return {
    generatedAt: now,
    totals: { players: n(players?.n), named: n(named?.n), activeToday: n(activeToday?.n), active7: n(active7?.n), gamesFinished: n(games?.n), gamesToday: n(gamesToday?.n) },
    newPlayers,
    activePlayers,
    retention: { day1: await retention(1), day7: await retention(7) },
    modes: num(modes),
    drop: num(drop),
    rules: num(rules),
    journey: { reached: num(reached), stuck: num(stuck), difficulty: num(difficulty), topPoints: num(topPoints) },
    friends: { created: n(created?.n), started: n(started?.n), finished: num(finished) },
    recent: num(recent),
  }
}

/** Constant-time compare for the admin key. */
export function sameKey(given: string | null, expected: string | undefined): boolean {
  if (!expected || !given || given.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

/**
 * Friends-game milestones from the hub's log: started (a friend joined) and finished (however it
 * ended). Credited to the game's creator; the unique index keeps one row per game.
 */
export function roomMilestone(what: string, room: Room, now = Date.now()): EventRow | null {
  const r = room.record
  const who = r.creatorId ?? r.players[0]?.id
  if (!who) return null
  const base = { mode: 'friends', rule: r.ruleId, ref: r.code }
  if (what === 'started') return serverEvent('room_started', who, now, base)
  if (room.status !== 'playing' && ['guess', 'time up', 'ended', 'gave up'].includes(what)) {
    return serverEvent('room_finished', who, now, {
      ...base,
      result: room.status,
      reason: r.ended?.reason ?? (room.status === 'won' ? null : 'tries'),
      tries: r.guesses.length,
      max_tries: room.game.setup.maxGuesses,
    })
  }
  return null
}
