import { DurableObject } from 'cloudflare:workers'
import { normalizeCode, usernameKey, usernameProblem, type ClientMessage, type CreateRoomRequest, type DropPlay, type ServerMessage } from '../src/net/protocol'
import { dropInfo, playDrop } from '../server/drop'
import { PROFILE_MAX_BYTES, applyLoad, applySave, checkProfileRequest, type ProfileRecord, type ProfileRequest } from '../server/profiles'
import { applyClaim, checkClaimRequest, isAvailable, type ClaimRequest, type UsernameRecord } from '../server/usernames'
import { hashSecret } from '../server/rooms'
import { Hub, type Peer } from '../server/hub'
import { Room, RoomError, newRoomRecord, randomCode, type RoomRecord } from '../server/rooms'
import { computeStats, eventFromClient, recordEvent, roomMilestone, sameKey, serverEvent, type EventKind, type EventRow, type Sql } from '../server/stats'

/**
 * WordX on Cloudflare. The Worker serves the built app and routes the API; every friends
 * game is its own Durable Object holding the room, its players' live sockets and its storage.
 * Room behaviour is the same Hub the Node server uses (server/hub.ts).
 */
export interface Env {
  ROOMS: DurableObjectNamespace<RoomObject>
  PROFILES: DurableObjectNamespace<ProfileObject>
  USERNAMES: DurableObjectNamespace<UsernameObject>
  ASSETS: Fetcher
  /** Secret for daily-drop answers: `npx wrangler secret put DROP_SALT`. */
  DROP_SALT?: string
  /** Anonymous usage events for the stats page. */
  STATS?: D1Database
  /** Unlocks /admin: `npx wrangler secret put ADMIN_KEY`. */
  ADMIN_KEY?: string
}

const GRACE_MS = 20_000
const ROOM_TTL_MS = 14 * 24 * 3_600_000
const MAX_BODY = 2_048
const MSG_RATE = 15
const MSG_BURST = 30

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

const roomStub = (env: Env, code: string) => env.ROOMS.get(env.ROOMS.idFromName(code))

const d1 = (db: D1Database): Sql => ({
  all: async <T,>(sql: string, params: unknown[] = []) => (await db.prepare(sql).bind(...params).all()).results as T[],
  run: async (sql: string, params: unknown[] = []) => void (await db.prepare(sql).bind(...params).run()),
})

/** Stats must never break the game: failures are logged and dropped. */
async function track(env: Env, e: EventRow) {
  if (!env.STATS) return
  try {
    await recordEvent(d1(env.STATS), e)
  } catch (err) {
    console.error('stats', err)
  }
}
const trackServer = (env: Env, kind: EventKind, player: string, fields: Partial<EventRow> = {}) => track(env, serverEvent(kind, player, Date.now(), fields))

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    if (path === '/api/health') return json(200, { ok: true, runtime: 'cloudflare' })

    if (path === '/api/event' && request.method === 'POST') {
      const text = await request.text()
      if (text.length > MAX_BODY) return json(413, { error: 'Too large' })
      let body: unknown
      try {
        body = JSON.parse(text || '{}')
      } catch {
        return json(400, { error: 'Bad request' })
      }
      const e = eventFromClient(body)
      if ('error' in e) return json(400, e)
      ctx.waitUntil(track(env, e))
      return new Response(null, { status: 204 })
    }
    if (path === '/api/admin/stats' && request.method === 'GET') {
      const given = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
      if (!sameKey(given, env.ADMIN_KEY)) return json(401, { error: 'Wrong key' })
      if (!env.STATS) return json(503, { error: 'Stats database not configured' })
      return json(200, await computeStats(d1(env.STATS)))
    }

    if (path === '/api/drop' && request.method === 'GET') {
      if (!env.DROP_SALT) return json(503, { error: 'Daily drop isn’t configured yet' })
      const r = dropInfo(url.searchParams.get('slot'), env.DROP_SALT)
      return 'error' in r ? json(r.status, { error: r.error }) : json(200, r)
    }
    if (path === '/api/drop/play' && request.method === 'POST') {
      if (!env.DROP_SALT) return json(503, { error: 'Daily drop isn’t configured yet' })
      const text = await request.text()
      if (text.length > MAX_BODY) return json(413, { error: 'Too large' })
      let body: DropPlay
      try {
        body = JSON.parse(text || '{}')
      } catch {
        return json(400, { error: 'Bad request' })
      }
      const r = playDrop(body, env.DROP_SALT)
      return 'error' in r ? json(r.status, { error: r.error }) : json(200, r)
    }

    if (path === '/api/username' && request.method === 'GET') {
      const name = String(url.searchParams.get('name') ?? '').trim()
      const problem = usernameProblem(name)
      if (problem) return json(200, { available: false, error: problem })
      const res = await env.USERNAMES.get(env.USERNAMES.idFromName(usernameKey(name))).fetch('https://name/get')
      const existing = (await res.json()) as UsernameRecord | null
      return json(200, { available: isAvailable(existing, url.searchParams.get('id') ?? undefined) })
    }
    if (path === '/api/username/claim' && request.method === 'POST') {
      let body: Partial<ClaimRequest>
      try {
        body = JSON.parse((await request.text()) || '{}')
      } catch {
        return json(400, { error: 'Bad request' })
      }
      const check = checkClaimRequest(body)
      if (!check.ok) return json(check.status, { error: check.error })
      const nameStub = env.USERNAMES.get(env.USERNAMES.idFromName(check.key))
      const claimed = await nameStub.fetch('https://name/claim', { method: 'POST', body: JSON.stringify({ id: check.id, secret: check.secret, display: check.username }) })
      if (claimed.status !== 200) return claimed
      // Record it on the player's profile, which proves the device and tells us their old name.
      const prof = await env.PROFILES.get(env.PROFILES.idFromName(check.id)).fetch('https://profile/username', {
        method: 'POST',
        body: JSON.stringify({ secret: check.secret, username: check.username }),
      })
      if (prof.status !== 200) {
        await nameStub.fetch('https://name/release', { method: 'POST', body: JSON.stringify({ id: check.id }) })
        return prof
      }
      const { previous } = (await prof.json()) as { previous: string | null }
      if (previous && usernameKey(previous) !== check.key) {
        await env.USERNAMES.get(env.USERNAMES.idFromName(usernameKey(previous))).fetch('https://name/release', { method: 'POST', body: JSON.stringify({ id: check.id }) })
      }
      return json(200, { username: check.username })
    }

    if ((path === '/api/profile/save' || path === '/api/profile/load') && request.method === 'POST') {
      const text = await request.text()
      if (text.length > PROFILE_MAX_BYTES + 512) return json(413, { error: 'Too large' })
      let body: Partial<ProfileRequest>
      try {
        body = JSON.parse(text || '{}')
      } catch {
        return json(400, { error: 'Bad request' })
      }
      const check = checkProfileRequest(body)
      if (!check.ok) return json(check.status, { error: check.error })
      const stub = env.PROFILES.get(env.PROFILES.idFromName(check.id))
      return stub.fetch(`https://profile/${path.endsWith('/save') ? 'save' : 'load'}`, { method: 'POST', body: JSON.stringify(body) })
    }

    if (path === '/api/rooms' && request.method === 'POST') {
      const text = await request.text()
      if (text.length > MAX_BODY) return json(413, { error: 'Too large' })
      let body: CreateRoomRequest
      try {
        body = JSON.parse(text || '{}')
      } catch {
        return json(400, { error: 'Bad request' })
      }
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = randomCode()
        const made = newRoomRecord(code, body, Date.now())
        if ('error' in made) return json(400, { error: made.error })
        const res = await roomStub(env, code).fetch('https://room/init', { method: 'POST', body: JSON.stringify(made.record) })
        if (res.status === 201) {
          if (made.record.creatorId) ctx.waitUntil(trackServer(env, 'room_created', made.record.creatorId, { ref: code, rule: made.record.ruleId, mode: 'friends' }))
          return json(201, { code })
        }
        if (res.status !== 409) return json(500, { error: 'Couldn’t create a game' })
      }
      return json(503, { error: 'Couldn’t create a game. Try again.' })
    }

    const info = /^\/api\/rooms\/([A-Za-z0-9]+)$/.exec(path)
    if (info && request.method === 'GET') return roomStub(env, normalizeCode(info[1])).fetch('https://room/info')

    if (path === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') return json(426, { error: 'Expected a WebSocket' })
      const code = normalizeCode(url.searchParams.get('room') ?? '')
      if (!code) return json(400, { error: 'Missing room' })
      return roomStub(env, code).fetch(request)
    }

    if (path.startsWith('/api/')) return json(404, { error: 'Not found' })
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>

interface Attachment {
  playerId?: string
}

/** One friends game. Sleeps between messages (WebSocket hibernation) and wakes on alarms for timers. */
export class RoomObject extends DurableObject<Env> {
  private hub: Hub | null = null
  private failure: RoomError | null = null
  private peers = new WeakMap<WebSocket, Peer>()
  private buckets = new WeakMap<WebSocket, { tokens: number; at: number }>()

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    // Keep-alive pings are answered without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}'))
    ctx.blockConcurrencyWhile(async () => {
      const record = await ctx.storage.get<RoomRecord>('record')
      if (record) this.boot(record)
    })
  }

  private boot(record: RoomRecord) {
    try {
      this.hub = new Hub(
        new Room(record),
        {
          save: async (r) => {
            await this.ctx.storage.put({ record: r, touched: Date.now() })
          },
          wakeAt: (at) => void this.wakeAt(at),
          log: (what) => this.roomEvent(String(what)),
        },
        GRACE_MS,
      )
    } catch (e) {
      this.failure = e instanceof RoomError ? e : new RoomError('expired', 'This game is no longer available')
      return
    }
    // After hibernation, re-attach the sockets that are still open.
    for (const ws of this.ctx.getWebSockets()) this.hub.restore(this.peer(ws))
  }

  /** While an alarm runs, wake-up requests are collected here and set once it finishes. */
  private pendingWake: number | null = null
  private inAlarm = false

  /** Friends-game milestones for the stats page (see roomMilestone). */
  private roomEvent(what: string) {
    const e = this.hub && roomMilestone(what, this.hub.room)
    if (e) this.ctx.waitUntil(track(this.env, e))
  }

  private async wakeAt(at: number) {
    if (this.inAlarm) {
      this.pendingWake = Math.min(this.pendingWake ?? at, at)
      return
    }
    const current = await this.ctx.storage.getAlarm()
    if (current === null || at < current) await this.ctx.storage.setAlarm(at)
  }

  private peer(ws: WebSocket): Peer {
    let p = this.peers.get(ws)
    if (!p) {
      const att = (ws.deserializeAttachment() ?? {}) as Attachment
      p = { playerId: att.playerId, send: (m: ServerMessage) => ws.send(JSON.stringify(m)) }
      this.peers.set(ws, p)
    }
    return p
  }

  private allow(ws: WebSocket): boolean {
    const now = Date.now()
    const b = this.buckets.get(ws) ?? { tokens: MSG_BURST, at: now }
    b.tokens = Math.min(MSG_BURST, b.tokens + ((now - b.at) / 1000) * MSG_RATE)
    b.at = now
    this.buckets.set(ws, b)
    if (b.tokens < 1) return false
    b.tokens -= 1
    return true
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/init') {
      if (this.hub || (await this.ctx.storage.get('record'))) return json(409, { error: 'Code in use' })
      const record = (await request.json()) as RoomRecord
      await this.ctx.storage.put({ record, touched: Date.now() })
      await this.wakeAt(Date.now() + ROOM_TTL_MS)
      this.boot(record)
      return json(201, { code: record.code })
    }

    if (url.pathname === '/info') {
      if (this.failure) return json(410, { error: this.failure.message })
      if (!this.hub) return json(404, { error: 'No game with that code' })
      const v = this.hub.room.view()
      return json(200, { code: v.code, ruleId: v.ruleId, players: v.players.length, status: v.status })
    }

    // WebSocket: accept it either way, so the app gets a readable error instead of a failed handshake.
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    this.ctx.acceptWebSocket(server)
    if (!this.hub) {
      const error = this.failure
        ? { t: 'error', code: 'expired', message: this.failure.message }
        : { t: 'error', code: 'not-found', message: 'No game with that code. Check it and try again.' }
      server.send(JSON.stringify(error))
      server.close(4004, 'no room')
    }
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer) {
    if (!this.hub) return
    const peer = this.peer(ws)
    if (!this.allow(ws)) return peer.send({ t: 'error', code: 'rate', message: 'Slow down a little' })
    if (typeof data !== 'string' || data.length > 4_096) return
    let msg: ClientMessage
    try {
      msg = JSON.parse(data)
    } catch {
      return peer.send({ t: 'error', code: 'bad', message: 'Bad message' })
    }
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return
    const wasJoined = !!peer.playerId
    await this.hub.message(peer, msg)
    // Remember who this socket is, so it survives the object hibernating.
    if (!wasJoined && peer.playerId) ws.serializeAttachment({ playerId: peer.playerId } satisfies Attachment)
  }

  async webSocketClose(ws: WebSocket) {
    await this.hub?.leave(this.peer(ws))
  }

  async webSocketError(ws: WebSocket) {
    await this.hub?.leave(this.peer(ws))
  }

  /** Timers (turn hand-off, the game clock) and clean-up of rooms untouched for two weeks. */
  async alarm() {
    const touched = (await this.ctx.storage.get<number>('touched')) ?? 0
    if (Date.now() - touched > ROOM_TTL_MS && !this.ctx.getWebSockets().length) {
      await this.ctx.storage.deleteAll()
      this.hub = null
      return
    }
    // The alarm that is running still counts as set until it returns, so collect what the
    // tick asks for and set the next alarm explicitly afterwards.
    this.inAlarm = true
    this.pendingWake = null
    try {
      await this.hub?.tick()
    } finally {
      this.inAlarm = false
    }
    const latest = (await this.ctx.storage.get<number>('touched')) ?? touched
    await this.ctx.storage.setAlarm(Math.min(this.pendingWake ?? Infinity, latest + ROOM_TTL_MS))
  }
}

/** One player's progress backup, and the username they hold. */
export class ProfileObject extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const body = (await request.json()) as ProfileRequest & { username?: string }
    const existing = (await this.ctx.storage.get<ProfileRecord>('profile')) ?? null
    const path = new URL(request.url).pathname
    if (path === '/username') {
      // The device secret that first touched this profile owns it.
      const owner = existing?.secretHash ?? (await this.ctx.storage.get<string>('owner'))
      if (owner && owner !== hashSecret(body.secret)) return json(403, { error: 'That doesn’t match your device' })
      if (!owner) await this.ctx.storage.put('owner', hashSecret(body.secret))
      const previous = (await this.ctx.storage.get<string>('username')) ?? null
      await this.ctx.storage.put('username', String(body.username))
      return json(200, { previous })
    }
    if (path === '/save') {
      const r = applySave(existing, body.secret, body.data, Date.now())
      if ('error' in r) return json(r.status, { error: r.error })
      await this.ctx.storage.put('profile', r.record)
      return json(200, { ok: true, updatedAt: r.record.updatedAt })
    }
    const r = applyLoad(existing, body.secret)
    return 'error' in r ? json(r.status, { error: r.error }) : json(200, r)
  }
}

/** One username, and the player who holds it. Keyed by the lower-cased name, so names are unique regardless of case. */
export class UsernameObject extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname
    const existing = (await this.ctx.storage.get<UsernameRecord>('name')) ?? null
    if (path === '/get') return json(200, existing)
    const body = (await request.json()) as { id: string; secret?: string; display?: string }
    if (path === '/claim') {
      const r = applyClaim(existing, body.id, String(body.secret), String(body.display), Date.now())
      if ('error' in r) return json(r.status, { error: r.error })
      await this.ctx.storage.put('name', r.record)
      return json(200, { ok: true })
    }
    if (path === '/release') {
      if (existing?.playerId === body.id) await this.ctx.storage.delete('name')
      return json(200, { ok: true })
    }
    return json(404, { error: 'Not found' })
  }
}
