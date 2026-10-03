import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'
import { WebSocketServer, type WebSocket } from 'ws'
import { normalizeCode, type ClientMessage, type CreateRoomRequest, type DropPlay } from '../src/net/protocol'
import { dropInfo, playDrop } from './drop'
import { PROFILE_MAX_BYTES, applyLoad, applySave, checkProfileRequest, type ProfileRequest } from './profiles'
import { Store } from './db'
import { Hub, type Peer } from './hub'
import { Room, RoomError, newRoomRecord, randomCode } from './rooms'

export interface ServerOptions {
  port: number
  dbPath: string
  /** Built app to serve (production). Omit in development, where Vite serves it. */
  staticDir?: string
  /** Seconds a turn holder may be away before the turn moves on. */
  turnGraceSeconds?: number
  /** Secret mixed into daily-drop answers. Set WORDX_DROP_SALT in production. */
  dropSalt?: string
  log?: (...args: unknown[]) => void
}

/** A room loaded in this process, plus its timers. */
interface Live {
  hub: Hub
  wake?: NodeJS.Timeout
  wakeAt?: number
  idle?: NodeJS.Timeout
}

interface Client extends Peer {
  ws: WebSocket
  live?: Live
  alive: boolean
  /** Token bucket for message rate limiting. */
  tokens: number
  lastRefill: number
}

const MAX_BODY = 2_048
const ROOM_TTL_MS = 14 * 24 * 3_600_000
const IDLE_UNLOAD_MS = 10 * 60_000
const HEARTBEAT_MS = 25_000
const MSG_RATE = 15
const MSG_BURST = 30
const CREATE_LIMIT_PER_MIN = 20

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
}

/**
 * The self-hosted game server (local development, Docker). Room behaviour lives in Hub,
 * shared with the Cloudflare Durable Object in worker/.
 */
export function startServer(opts: ServerOptions): { server: Server; close(): Promise<void>; store: Store } {
  const log = opts.log ?? ((...a: unknown[]) => console.log(new Date().toISOString(), ...a))
  const store = new Store(opts.dbPath)
  const lives = new Map<string, Live>()
  const createHits = new Map<string, number[]>()
  const grace = (opts.turnGraceSeconds ?? 20) * 1000
  const salt = opts.dropSalt ?? 'dev-drop-salt'

  // ---------- Rooms in memory ----------

  function getLive(code: string): Live | null {
    const existing = lives.get(code)
    if (existing) return existing
    const record = store.loadRoom(code)
    if (!record) return null
    const live: Live = {} as Live
    live.hub = new Hub(
      new Room(record),
      {
        save: (r) => store.saveRecord(r),
        wakeAt: (at) => {
          if (live.wake && live.wakeAt !== undefined && live.wakeAt <= at) return
          clearTimeout(live.wake)
          live.wakeAt = at
          live.wake = setTimeout(() => {
            live.wake = undefined
            live.wakeAt = undefined
            void live.hub.tick()
          }, Math.max(0, at - Date.now()))
        },
        log,
      },
      grace,
    )
    lives.set(code, live)
    void live.hub.tick()
    return live
  }

  function scheduleUnload(live: Live) {
    clearTimeout(live.idle)
    if (live.hub.peers.size) return
    live.idle = setTimeout(() => {
      if (live.hub.peers.size) return
      clearTimeout(live.wake)
      lives.delete(live.hub.room.code)
    }, IDLE_UNLOAD_MS)
  }

  // ---------- HTTP ----------

  function json(res: ServerResponse, status: number, body: unknown) {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    res.end(JSON.stringify(body))
  }

  function readBody(req: IncomingMessage, limit = MAX_BODY): Promise<string> {
    return new Promise((ok, fail) => {
      let size = 0
      const chunks: Buffer[] = []
      req.on('data', (c: Buffer) => {
        size += c.length
        if (size > limit) {
          fail(new Error('too-large'))
          req.destroy()
        } else chunks.push(c)
      })
      req.on('end', () => ok(Buffer.concat(chunks).toString('utf8')))
      req.on('error', fail)
    })
  }

  function rateLimited(ip: string): boolean {
    const now = Date.now()
    const hits = (createHits.get(ip) ?? []).filter((t) => now - t < 60_000)
    hits.push(now)
    createHits.set(ip, hits)
    return hits.length > CREATE_LIMIT_PER_MIN
  }

  async function handleApi(req: IncomingMessage, res: ServerResponse, path: string) {
    if (req.method === 'GET' && path === '/api/health') {
      return json(res, 200, { ok: true, live: lives.size, ...store.stats() })
    }

    if (path === '/api/drop' && req.method === 'GET') {
      const r = dropInfo(new URL(req.url ?? '/', 'http://local').searchParams.get('slot'), salt)
      return 'error' in r ? json(res, r.status, { error: r.error }) : json(res, 200, r)
    }
    if (path === '/api/drop/play' && req.method === 'POST') {
      let body: DropPlay
      try {
        body = JSON.parse((await readBody(req)) || '{}')
      } catch {
        return json(res, 400, { error: 'Bad request' })
      }
      const r = playDrop(body, salt)
      return 'error' in r ? json(res, r.status, { error: r.error }) : json(res, 200, r)
    }

    if (req.method === 'POST' && (path === '/api/profile/save' || path === '/api/profile/load')) {
      let body: Partial<ProfileRequest>
      try {
        body = JSON.parse((await readBody(req, PROFILE_MAX_BYTES + 512)) || '{}')
      } catch {
        return json(res, 400, { error: 'Bad request' })
      }
      const check = checkProfileRequest(body)
      if (!check.ok) return json(res, check.status, { error: check.error })
      const existing = store.loadProfile(check.id)
      if (path.endsWith('/save')) {
        const r = applySave(existing, check.secret, body.data, Date.now())
        if ('error' in r) return json(res, r.status, { error: r.error })
        store.saveProfile(check.id, r.record)
        return json(res, 200, { ok: true, updatedAt: r.record.updatedAt })
      }
      const r = applyLoad(existing, check.secret)
      return 'error' in r ? json(res, r.status, { error: r.error }) : json(res, 200, r)
    }

    if (req.method === 'POST' && path === '/api/rooms') {
      const ip = req.socket.remoteAddress ?? 'unknown'
      if (rateLimited(ip)) return json(res, 429, { error: 'Too many new games. Try again in a minute.' })
      let body: CreateRoomRequest
      try {
        body = JSON.parse((await readBody(req)) || '{}')
      } catch {
        return json(res, 400, { error: 'Bad request' })
      }
      let code = randomCode()
      for (let i = 0; store.roomExists(code) && i < 20; i++) code = randomCode()
      const made = newRoomRecord(code, body.ruleId, body.minutes, Date.now())
      if ('error' in made) return json(res, 400, { error: made.error })
      store.createRoom(made.record)
      log('room created', code, made.record.ruleId)
      return json(res, 201, { code })
    }

    const match = /^\/api\/rooms\/([A-Za-z0-9]+)$/.exec(path)
    if (req.method === 'GET' && match) {
      const code = normalizeCode(match[1])
      try {
        const live = getLive(code)
        if (!live) return json(res, 404, { error: 'No game with that code' })
        const v = live.hub.room.view()
        return json(res, 200, { code, ruleId: v.ruleId, players: v.players.length, status: v.status })
      } catch (e) {
        return json(res, 410, { error: e instanceof RoomError ? e.message : 'This game is no longer available' })
      }
    }

    return json(res, 404, { error: 'Not found' })
  }

  function serveStatic(req: IncomingMessage, res: ServerResponse, path: string) {
    const root = resolve(opts.staticDir!)
    let file = normalize(join(root, decodeURIComponent(path)))
    if (!file.startsWith(root)) return json(res, 400, { error: 'Bad path' })
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html') // SPA fallback
    const type = MIME[extname(file)] ?? 'application/octet-stream'
    const immutable = file.includes(`${join(root, 'assets')}`)
    res.writeHead(200, { 'content-type': type, 'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache' })
    if (req.method === 'HEAD') return res.end()
    createReadStream(file).pipe(res)
  }

  const server = createServer(async (req, res) => {
    const path = new URL(req.url ?? '/', 'http://local').pathname
    try {
      if (path.startsWith('/api/')) return await handleApi(req, res, path)
      if (opts.staticDir) return serveStatic(req, res, path)
      json(res, 404, { error: 'Not found' })
    } catch (e) {
      log('http error', e)
      if (!res.headersSent) json(res, e instanceof Error && e.message === 'too-large' ? 413 : 500, { error: 'Something went wrong' })
    }
  })

  // ---------- WebSockets ----------

  const wss = new WebSocketServer({ noServer: true, maxPayload: 4_096 })

  server.on('upgrade', (req, socket, head) => {
    if (new URL(req.url ?? '/', 'http://local').pathname !== '/ws') return socket.destroy()
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws))
  })

  function allow(c: Client): boolean {
    const now = Date.now()
    c.tokens = Math.min(MSG_BURST, c.tokens + ((now - c.lastRefill) / 1000) * MSG_RATE)
    c.lastRefill = now
    if (c.tokens < 1) return false
    c.tokens -= 1
    return true
  }

  async function onMessage(c: Client, msg: ClientMessage) {
    if (msg.t === 'ping') return c.send({ t: 'pong' })
    if (msg.t === 'join' && !c.live) {
      let live: Live | null
      try {
        live = getLive(normalizeCode(String(msg.room)))
      } catch (e) {
        return c.send({ t: 'error', code: 'expired', message: e instanceof RoomError ? e.message : 'This game is no longer available' })
      }
      if (!live) return c.send({ t: 'error', code: 'not-found', message: 'No game with that code. Check it and try again.' })
      c.live = live
      clearTimeout(live.idle)
    }
    if (!c.live) return c.send({ t: 'error', code: 'not-joined', message: 'Join a game first' })
    await c.live.hub.message(c, msg)
  }

  wss.on('connection', (ws: WebSocket) => {
    const c: Client = {
      ws,
      alive: true,
      tokens: MSG_BURST,
      lastRefill: Date.now(),
      send: (m) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(m)),
    }
    const joinTimeout = setTimeout(() => !c.playerId && ws.close(4000, 'join timeout'), 10_000)
    ws.on('pong', () => (c.alive = true))
    ws.on('message', async (data) => {
      if (!allow(c)) return c.send({ t: 'error', code: 'rate', message: 'Slow down a little' })
      let msg: ClientMessage
      try {
        msg = JSON.parse(String(data))
      } catch {
        return c.send({ t: 'error', code: 'bad', message: 'Bad message' })
      }
      if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return
      try {
        await onMessage(c, msg)
      } catch (e) {
        log('ws error', e)
        c.send({ t: 'error', code: 'server', message: 'Something went wrong on our side' })
      }
    })
    ws.on('close', async () => {
      clearTimeout(joinTimeout)
      if (!c.live) return
      await c.live.hub.leave(c)
      scheduleUnload(c.live)
    })
    ws.on('error', () => ws.terminate())
    ;(ws as WebSocket & { __client?: Client }).__client = c
  })

  // Drop sockets that stopped answering pings (phones going to sleep, dead networks).
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      const c = (ws as WebSocket & { __client?: Client }).__client
      if (!c) continue
      if (!c.alive) {
        ws.terminate()
        continue
      }
      c.alive = false
      ws.ping()
    }
  }, HEARTBEAT_MS)

  const purgeOld = () => {
    const n = store.purge(Date.now() - ROOM_TTL_MS)
    if (n) log('purged rooms', n)
  }
  purgeOld()
  const purgeTimer = setInterval(purgeOld, 6 * 3_600_000)

  server.listen(opts.port, () => log(`WordX server on :${opts.port}`))

  return {
    server,
    store,
    close: () =>
      new Promise<void>((done) => {
        clearInterval(heartbeat)
        clearInterval(purgeTimer)
        for (const live of lives.values()) {
          clearTimeout(live.wake)
          clearTimeout(live.idle)
        }
        for (const ws of wss.clients) ws.close(1001, 'server shutting down')
        wss.close()
        server.close(() => {
          store.close()
          done()
        })
      }),
  }
}
