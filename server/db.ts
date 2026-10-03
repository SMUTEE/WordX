import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { ProfileRecord } from './profiles'
import type { UsernameRecord } from './usernames'
import type { GuessRecord, PlayerRecord, RoomRecord } from './rooms'

/** Newer room fields, kept in one JSON column so adding more never needs a migration. */
const extra = (r: RoomRecord) =>
  JSON.stringify({ creatorId: r.creatorId, turnLimit: r.turnLimit, turnDeadline: r.turnDeadline, startedAt: r.startedAt, gaveUp: r.gaveUp, absent: r.absent })

/**
 * SQLite persistence (Node's built-in driver, no extra dependency). Rooms survive restarts:
 * only the words are stored, and each room re-derives its puzzle and feedback on load.
 */
export class Store {
  private db: DatabaseSync

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.db = new DatabaseSync(path)
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS rooms (
        code TEXT PRIMARY KEY,
        rule_id TEXT NOT NULL,
        rule_version INTEGER NOT NULL,
        slot TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        turn TEXT
      );
      CREATE TABLE IF NOT EXISTS players (
        room_code TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
        id TEXT NOT NULL,
        name TEXT NOT NULL,
        secret_hash TEXT NOT NULL,
        seat INTEGER NOT NULL,
        joined_at INTEGER NOT NULL,
        PRIMARY KEY (room_code, id)
      );
      CREATE TABLE IF NOT EXISTS guesses (
        room_code TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
        idx INTEGER NOT NULL,
        word TEXT NOT NULL,
        player_id TEXT NOT NULL,
        client_id TEXT NOT NULL,
        at INTEGER NOT NULL,
        PRIMARY KEY (room_code, idx),
        UNIQUE (room_code, client_id)
      );
      CREATE INDEX IF NOT EXISTS rooms_updated ON rooms(updated_at);
      CREATE TABLE IF NOT EXISTS usernames (
        name_key TEXT PRIMARY KEY,
        display TEXT NOT NULL,
        player_id TEXT NOT NULL UNIQUE,
        secret_hash TEXT NOT NULL,
        claimed_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        secret_hash TEXT NOT NULL,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `)
    // Migrations: add columns introduced after a database was first created.
    const columns = (this.db.prepare('PRAGMA table_info(rooms)').all() as { name: string }[]).map((c) => c.name)
    if (!columns.includes('hints')) this.db.exec("ALTER TABLE rooms ADD COLUMN hints TEXT NOT NULL DEFAULT '[]'")
    if (!columns.includes('time_limit')) this.db.exec('ALTER TABLE rooms ADD COLUMN time_limit INTEGER')
    if (!columns.includes('deadline')) this.db.exec('ALTER TABLE rooms ADD COLUMN deadline INTEGER')
    if (!columns.includes('ended')) this.db.exec('ALTER TABLE rooms ADD COLUMN ended TEXT')
    if (!columns.includes('extra')) this.db.exec("ALTER TABLE rooms ADD COLUMN extra TEXT NOT NULL DEFAULT '{}'")
  }

  roomExists(code: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM rooms WHERE code = ?').get(code)
  }

  createRoom(r: RoomRecord) {
    this.db
      .prepare('INSERT INTO rooms (code, rule_id, rule_version, slot, created_at, updated_at, turn, time_limit, extra) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(r.code, r.ruleId, r.ruleVersion, r.slot, r.createdAt, r.createdAt, r.turn, r.timeLimit, extra(r))
  }

  loadRoom(code: string): RoomRecord | null {
    const row = this.db.prepare('SELECT * FROM rooms WHERE code = ?').get(code) as Record<string, unknown> | undefined
    if (!row) return null
    const players = (this.db.prepare('SELECT * FROM players WHERE room_code = ? ORDER BY seat').all(code) as Record<string, unknown>[]).map(
      (p): PlayerRecord => ({
        id: String(p.id),
        name: String(p.name),
        secretHash: String(p.secret_hash),
        seat: Number(p.seat),
        joinedAt: Number(p.joined_at),
      }),
    )
    const guesses = (this.db.prepare('SELECT * FROM guesses WHERE room_code = ? ORDER BY idx').all(code) as Record<string, unknown>[]).map(
      (g): GuessRecord => ({ word: String(g.word), playerId: String(g.player_id), clientId: String(g.client_id), at: Number(g.at) }),
    )
    return {
      code,
      ruleId: String(row.rule_id),
      ruleVersion: Number(row.rule_version),
      slot: String(row.slot),
      createdAt: Number(row.created_at),
      turn: row.turn == null ? null : String(row.turn),
      hints: JSON.parse(String(row.hints ?? '[]')),
      timeLimit: row.time_limit == null ? null : Number(row.time_limit),
      deadline: row.deadline == null ? null : Number(row.deadline),
      ended: row.ended == null ? null : JSON.parse(String(row.ended)),
      ...JSON.parse(String(row.extra ?? '{}')),
      players,
      guesses,
    }
  }





  /** Writes the whole room in one transaction. Rooms are tiny (≤ 8 players, ≤ 8 guesses). */
  saveRecord(r: RoomRecord, now = Date.now()) {
    this.tx(() => {
      this.db
        .prepare('UPDATE rooms SET turn = ?, deadline = ?, ended = ?, hints = ?, extra = ?, updated_at = ? WHERE code = ?')
        .run(r.turn, r.deadline, r.ended ? JSON.stringify(r.ended) : null, JSON.stringify(r.hints), extra(r), now, r.code)
      const player = this.db.prepare(
        `INSERT INTO players (room_code, id, name, secret_hash, seat, joined_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (room_code, id) DO UPDATE SET name = excluded.name`,
      )
      for (const p of r.players) player.run(r.code, p.id, p.name, p.secretHash, p.seat, p.joinedAt)
      const guess = this.db.prepare('INSERT OR IGNORE INTO guesses (room_code, idx, word, player_id, client_id, at) VALUES (?, ?, ?, ?, ?, ?)')
      r.guesses.forEach((g, i) => guess.run(r.code, i, g.word, g.playerId, g.clientId, g.at))
    })
  }

  loadProfile(id: string): ProfileRecord | null {
    const row = this.db.prepare('SELECT * FROM profiles WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return row ? { secretHash: String(row.secret_hash), data: String(row.data), updatedAt: Number(row.updated_at) } : null
  }

  saveProfile(id: string, r: ProfileRecord) {
    this.db
      .prepare(
        `INSERT INTO profiles (id, secret_hash, data, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      )
      .run(id, r.secretHash, r.data, r.updatedAt)
  }

  getUsername(key: string): UsernameRecord | null {
    const row = this.db.prepare('SELECT * FROM usernames WHERE name_key = ?').get(key) as Record<string, unknown> | undefined
    return row ? { playerId: String(row.player_id), secretHash: String(row.secret_hash), display: String(row.display), claimedAt: Number(row.claimed_at) } : null
  }

  /** The name a player currently holds, if any. */
  usernameOf(playerId: string): (UsernameRecord & { key: string }) | null {
    const row = this.db.prepare('SELECT * FROM usernames WHERE player_id = ?').get(playerId) as Record<string, unknown> | undefined
    return row
      ? { key: String(row.name_key), playerId: String(row.player_id), secretHash: String(row.secret_hash), display: String(row.display), claimedAt: Number(row.claimed_at) }
      : null
  }

  /** Takes a name, releasing the player's previous one, in one transaction. */
  setUsername(key: string, r: UsernameRecord) {
    this.tx(() => {
      this.db.prepare('DELETE FROM usernames WHERE player_id = ? AND name_key <> ?').run(r.playerId, key)
      this.db
        .prepare(
          `INSERT INTO usernames (name_key, display, player_id, secret_hash, claimed_at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (name_key) DO UPDATE SET display = excluded.display`,
        )
        .run(key, r.display, r.playerId, r.secretHash, r.claimedAt)
    })
  }

  /** Deletes rooms untouched since `before`. Returns how many went. */
  purge(before: number): number {
    return Number(this.db.prepare('DELETE FROM rooms WHERE updated_at < ?').run(before).changes)
  }

  stats() {
    const rooms = Number((this.db.prepare('SELECT COUNT(*) AS n FROM rooms').get() as { n: number }).n)
    return { rooms }
  }

  close() {
    this.db.close()
  }



  private tx(fn: () => void) {
    this.db.exec('BEGIN')
    try {
      fn()
      this.db.exec('COMMIT')
    } catch (e) {
      this.db.exec('ROLLBACK')
      throw e
    }
  }
}
