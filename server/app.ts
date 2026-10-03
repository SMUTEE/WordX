import { randomInt } from 'node:crypto'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'
import { WebSocketServer, type WebSocket } from 'ws'
import { TIME_LIMITS } from '../src/engine/engine'
import { currentSlot } from '../src/engine/schedule'
import {
  NAME_MAX,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  normalizeCode,
  type ClientMessage,
  type CreateRoomRequest,
  type ServerMessage,
} from '../src/net/protocol'
import { Store } from './db'
import { Room, RoomError, playableRule, type RoomRecord } from './rooms'

export interface ServerOptions {
  port: number
  dbPath: string
  /** Built app to serve (production). Omit in development, where Vite serves it. */
  staticDir?: string
  /** Seconds a turn holder may be away before the turn moves on. */
  turnGraceSeconds?: number
  log?: (...args: unknown[]) => void
}

interface Live {
  room: Room
  sockets: Set<Client>
  handoffs: Map<string, NodeJS.Timeout>
  idleTimer?: NodeJS.Timeout
  /** Fires when a timed game runs out, so it ends even if nobody is typing. */
  clock?: NodeJS.Timeout
}

interface Client {
  ws: WebSocket
  live?: Live
  playerId?: string
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

export function startServer(opts: ServerOptions): { server: Server; close(): Promise<void>; store: Store } {
  const log = opts.log ?? ((...a: unknown[]) => console.log(new Date().toISOString(), ...a))
  const store = new Store(opts.dbPath)
  const lives = new Map<string, Live>()
  const createHits = new Map<string, number[]>()
  const grace = (opts.turnGraceSeconds ?? 20) * 1000

  // ---------- Rooms in memory ----------

  function getLive(code: string): Live | null {
    const existing = lives.get(code)
    if (existing) return existing
    const record = store.loadRoom(code)
    if (!record) return null
    const live: Live = { room: new Room(record), sockets: new Set(), handoffs: new Map() }
    lives.set(code, live)
    scheduleClock(live)
    return live
  }

  function persist(live: Live) {
    store.saveState(live.room.code, live.room.record, Date.now())
  }

  function scheduleClock(live: Live) {
    clearTimeout(live.clock)
    const deadline = live.room.record.deadline
    if (!deadline || live.room.status !== 'playing') return
    live.clock = setTimeout(() => {
      if (live.room.expire()) {
        persist(live)
        log('time up', live.room.code)
        broadcastRoom(live)
      }
    }, Math.max(0, deadline - Date.now()) + 50)
  }

  function newCode(): string {
    for (let attempt = 0; attempt < 20; attempt++) {
      const code = Array.from({ length: ROOM_CODE_LENGTH }, () => ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)]).join('')
      if (!store.roomExists(code)) return code
    }
    throw new Error('Could not allocate a room code')
  }

  function send(c: Client, msg: ServerMessage) {
    if (c.ws.readyState === c.ws.OPEN) c.ws.send(JSON.stringify(msg))
  }

  function broadcastRoom(live: Live) {
    const room = live.room.view()
    const now = Date.now()
    for (const c of live.sockets) if (c.playerId) send(c, { t: 'room', room, you: c.playerId, now })
  }

  function scheduleUnload(live: Live) {
    clearTimeout(live.idleTimer)
    if (live.sockets.size) return
    live.idleTimer = setTimeout(() => {
      if (!live.sockets.size) {
        live.handoffs.forEach(clearTimeout)
        clearTimeout(live.clock)
        lives.delete(live.room.code)
      }
    }, IDLE_UNLOAD_MS)
  }

  // ---------- HTTP ----------

  function json(res: ServerResponse, status: number, body: unknown) {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    res.end(JSON.stringify(body))
  }

  function readBody(req: IncomingMessage): Promise<string> {
    return new Promise((ok, fail) => {
      let size = 0
      const chunks: Buffer[] = []
      req.on('data', (c: Buffer) => {
        size += c.length
        if (size > MAX_BODY) {
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

    if (req.method === 'POST' && path === '/api/rooms') {
      const ip = req.socket.remoteAddress ?? 'unknown'
      if (rateLimited(ip)) return json(res, 429, { error: 'Too many new games. Try again in a minute.' })
      let body: CreateRoomRequest
      try {
        body = JSON.parse((await readBody(req)) || '{}')
      } catch {
        return json(res, 400, { error: 'Bad request' })
      }
      const rule = playableRule(String(body.ruleId ?? ''))
      if (!rule) return json(res, 400, { error: 'Unknown rule' })
      const minutes = body.minutes == null ? null : Number(body.minutes)
      if (minutes !== null && !(TIME_LIMITS as readonly number[]).includes(minutes)) return json(res, 400, { error: 'Pick 4, 5 or 10 minutes' })
      const now = Date.now()
      const record: RoomRecord = {
        code: newCode(),
        ruleId: rule.id,
        ruleVersion: rule.version,
        slot: currentSlot(now),
        createdAt: now,
        players: [],
        guesses: [],
        hints: [],
        turn: null,
        timeLimit: minutes ? minutes * 60_000 : null,
        deadline: null,
        ended: null,
      }
      new Room(record) // fail fast if the puzzle can't be built
      store.createRoom(record)
      log('room created', record.code, rule.id)
      return json(res, 201, { code: record.code })
    }

    const match = /^\/api\/rooms\/([A-Za-z0-9]+)$/.exec(path)
    if (req.method === 'GET' && match) {
      const code = normalizeCode(match[1])
      try {
        const live = getLive(code)
        if (!live) return json(res, 404, { error: 'No game with that code' })
        const v = live.room.view()
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

  function onJoin(c: Client, msg: Extract<ClientMessage, { t: 'join' }>) {
    if (c.live) return send(c, { t: 'error', code: 'already-joined', message: 'Already in a game' })
    const code = normalizeCode(String(msg.room))
    const playerId = String(msg.playerId)
    const secret = String(msg.secret)
    if (!/^[a-z0-9]{6,32}$/.test(playerId) || secret.length < 16 || secret.length > 128) {
      return send(c, { t: 'error', code: 'identity', message: 'Bad player identity' })
    }
    let live: Live | null
    try {
      live = getLive(code)
    } catch (e) {
      return send(c, { t: 'error', code: 'expired', message: e instanceof RoomError ? e.message : 'This game is no longer available' })
    }
    if (!live) return send(c, { t: 'error', code: 'not-found', message: 'No game with that code. Check it and try again.' })

    const now = Date.now()
    const joined = live.room.join(playerId, secret, String(msg.name ?? '').slice(0, NAME_MAX * 2), now)
    if (!joined.ok) return send(c, { t: 'error', code: joined.code, message: joined.message })
    if (joined.changed) store.savePlayer(code, live.room.player(playerId)!, now)

    c.live = live
    c.playerId = playerId
    live.sockets.add(c)
    clearTimeout(live.idleTimer)
    clearTimeout(live.handoffs.get(playerId))
    live.handoffs.delete(playerId)
    if (live.room.connect(playerId, now)) {
      persist(live)
      scheduleClock(live)
    }
    log('join', code, playerId)
    broadcastRoom(live)
  }

  function onMessage(c: Client, msg: ClientMessage) {
    if (msg.t === 'ping') return send(c, { t: 'pong' })
    if (msg.t === 'join') return onJoin(c, msg)
    const live = c.live
    const playerId = c.playerId
    if (!live || !playerId) return send(c, { t: 'error', code: 'not-joined', message: 'Join a game first' })
    const room = live.room

    switch (msg.t) {
      case 'typing': {
        if (room.view().turn !== playerId || !Array.isArray(msg.letters)) return
        const letters = msg.letters.slice(0, room.game.setup.length).map((l) => (typeof l === 'string' && /^[A-Z]$/.test(l) ? l : ''))
        for (const other of live.sockets) if (other !== c) send(other, { t: 'typing', playerId, letters })
        return
      }
      case 'guess': {
        const clientId = String(msg.clientId ?? '').slice(0, 64)
        const word = String(msg.word ?? '').toUpperCase()
        if (!clientId || !/^[A-Z]{1,12}$/.test(word)) return send(c, { t: 'rejected', clientId, code: 'bad', message: 'Letters only' })
        const now = Date.now()
        const outcome = room.guess(playerId, word, clientId, now)
        if (!outcome.ok) {
          send(c, { t: 'rejected', clientId, code: outcome.code, message: outcome.message })
          if (outcome.code === 'time') {
            persist(live)
            broadcastRoom(live)
          }
          return
        }
        if (!outcome.duplicate) {
          const idx = room.record.guesses.length - 1
          store.saveGuess(room.code, idx, room.record.guesses[idx], room.view().turn)
          log('guess', room.code, playerId, `${idx + 1}/${room.game.setup.maxGuesses}`, room.status)
        }
        send(c, { t: 'accepted', clientId })
        // Clear everyone's ghost letters, then send the new board.
        for (const other of live.sockets) if (other !== c) send(other, { t: 'typing', playerId, letters: [] })
        broadcastRoom(live)
        return
      }
      case 'hint': {
        const outcome = room.hint(playerId)
        if (!outcome.ok) return send(c, { t: 'rejected', code: outcome.code, message: outcome.message })
        store.saveHints(room.code, room.record.hints, Date.now())
        broadcastRoom(live)
        return
      }
      case 'giveup': {
        if (room.giveUp(playerId)) {
          persist(live)
          clearTimeout(live.clock)
          log('gave up', room.code, playerId)
          broadcastRoom(live)
        }
        return
      }
      case 'pass': {
        if (room.pass(playerId)) {
          persist(live)
          broadcastRoom(live)
        }
        return
      }
      case 'rename': {
        if (room.rename(playerId, String(msg.name ?? ''))) {
          store.savePlayer(room.code, room.player(playerId)!, Date.now())
          broadcastRoom(live)
        }
        return
      }
      default:
        return send(c, { t: 'error', code: 'unknown', message: 'Unknown message' })
    }
  }

  function onClose(c: Client) {
    const live = c.live
    const playerId = c.playerId
    if (!live || !playerId) return
    live.sockets.delete(c)
    if (live.room.disconnect(playerId)) {
      // Give the turn holder a moment to come back (a refresh, a tunnel) before moving on.
      clearTimeout(live.handoffs.get(playerId))
      live.handoffs.set(
        playerId,
        setTimeout(() => {
          live.handoffs.delete(playerId)
          if (live.room.handOffIfAbsent(playerId)) {
            persist(live)
            broadcastRoom(live)
          }
        }, grace),
      )
      broadcastRoom(live)
    }
    scheduleUnload(live)
  }

  wss.on('connection', (ws: WebSocket) => {
    const c: Client = { ws, alive: true, tokens: MSG_BURST, lastRefill: Date.now() }
    const joinTimeout = setTimeout(() => !c.live && ws.close(4000, 'join timeout'), 10_000)
    ws.on('pong', () => (c.alive = true))
    ws.on('message', (data) => {
      if (!allow(c)) return send(c, { t: 'error', code: 'rate', message: 'Slow down a little' })
      let msg: ClientMessage
      try {
        msg = JSON.parse(String(data))
      } catch {
        return send(c, { t: 'error', code: 'bad', message: 'Bad message' })
      }
      if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return
      try {
        onMessage(c, msg)
      } catch (e) {
        log('ws error', e)
        send(c, { t: 'error', code: 'server', message: 'Something went wrong on our side' })
      }
    })
    ws.on('close', () => {
      clearTimeout(joinTimeout)
      onClose(c)
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
          live.handoffs.forEach(clearTimeout)
          clearTimeout(live.clock)
          clearTimeout(live.idleTimer)
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
