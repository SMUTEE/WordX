import { DurableObject } from 'cloudflare:workers'
import { normalizeCode, type ClientMessage, type CreateRoomRequest, type DropPlay, type ServerMessage } from '../src/net/protocol'
import { dropInfo, playDrop } from '../server/drop'
import { PROFILE_MAX_BYTES, applyLoad, applySave, checkProfileRequest, type ProfileRecord, type ProfileRequest } from '../server/profiles'
import { Hub, type Peer } from '../server/hub'
import { Room, RoomError, newRoomRecord, randomCode, type RoomRecord } from '../server/rooms'

/**
 * WordX on Cloudflare. The Worker serves the built app and routes the API; every friends
 * game is its own Durable Object holding the room, its players' live sockets and its storage.
 * Room behaviour is the same Hub the Node server uses (server/hub.ts).
 */
export interface Env {
  ROOMS: DurableObjectNamespace<RoomObject>
  PROFILES: DurableObjectNamespace<ProfileObject>
  ASSETS: Fetcher
  /** Secret for daily-drop answers: `npx wrangler secret put DROP_SALT`. */
  DROP_SALT?: string
}

const GRACE_MS = 20_000
const ROOM_TTL_MS = 14 * 24 * 3_600_000
const MAX_BODY = 2_048
const MSG_RATE = 15
const MSG_BURST = 30

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

const roomStub = (env: Env, code: string) => env.ROOMS.get(env.ROOMS.idFromName(code))

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    if (path === '/api/health') return json(200, { ok: true, runtime: 'cloudflare' })

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
        const made = newRoomRecord(code, body.ruleId, body.minutes, Date.now())
        if ('error' in made) return json(400, { error: made.error })
        const res = await roomStub(env, code).fetch('https://room/init', { method: 'POST', body: JSON.stringify(made.record) })
        if (res.status === 201) return json(201, { code })
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

  private async wakeAt(at: number) {
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
    await this.hub?.tick()
    await this.wakeAt(touched + ROOM_TTL_MS)
  }
}

/** One player's progress backup. */
export class ProfileObject extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const body = (await request.json()) as ProfileRequest
    const existing = (await this.ctx.storage.get<ProfileRecord>('profile')) ?? null
    if (new URL(request.url).pathname === '/save') {
      const r = applySave(existing, body.secret, body.data, Date.now())
      if ('error' in r) return json(r.status, { error: r.error })
      await this.ctx.storage.put('profile', r.record)
      return json(200, { ok: true, updatedAt: r.record.updatedAt })
    }
    const r = applyLoad(existing, body.secret)
    return 'error' in r ? json(r.status, { error: r.error }) : json(200, r)
  }
}
