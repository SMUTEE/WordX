import { NAME_MAX, normalizeCode, type ClientMessage, type ServerMessage } from '../src/net/protocol'
import type { Room, RoomRecord } from './rooms'

/** One connected client, whatever the transport (Node `ws` or a Cloudflare WebSocket). */
export interface Peer {
  send(msg: ServerMessage): void
  playerId?: string
}

/** What the hub needs from where it runs. */
export interface HubHost {
  /** Persist the room after a change. */
  save(record: RoomRecord): void | Promise<void>
  /** Call `hub.tick()` at or after this time (ms). Earlier requests win. */
  wakeAt(at: number): void
  log?(...args: unknown[]): void
}

/**
 * A live room: the message handling shared by the Node server and the Cloudflare Durable
 * Object. The Room holds the rules of play; the hub turns client messages into Room calls,
 * persists the result and broadcasts the new board.
 */
export class Hub {
  readonly peers = new Set<Peer>()
  /** When each player's last connection closed, to give the turn holder a grace period. */
  private offlineSince = new Map<string, number>()
  readonly room: Room
  private host: HubHost
  private graceMs: number

  constructor(room: Room, host: HubHost, graceMs = 20_000) {
    this.room = room
    this.host = host
    this.graceMs = graceMs
  }

  private send(peer: Peer, msg: ServerMessage) {
    try {
      peer.send(msg)
    } catch {
      // The socket is closing; its close handler cleans up.
    }
  }

  broadcast(now = Date.now()) {
    const room = this.room.view()
    for (const p of this.peers) if (p.playerId) this.send(p, { t: 'room', room, you: p.playerId, now })
  }

  private async persist() {
    await this.host.save(this.room.record)
  }

  private scheduleClock() {
    const deadline = this.room.record.deadline
    if (deadline && this.room.status === 'playing') this.host.wakeAt(deadline + 50)
  }

  /** Re-attach a peer after the host was evicted from memory (Cloudflare hibernation). */
  restore(peer: Peer) {
    this.peers.add(peer)
    if (peer.playerId) this.room.markOnline(peer.playerId)
  }

  async join(peer: Peer, msg: Extract<ClientMessage, { t: 'join' }>, now = Date.now()) {
    if (peer.playerId) return this.send(peer, { t: 'error', code: 'already-joined', message: 'Already in a game' })
    if (normalizeCode(String(msg.room)) !== this.room.code) {
      return this.send(peer, { t: 'error', code: 'not-found', message: 'No game with that code. Check it and try again.' })
    }
    const playerId = String(msg.playerId)
    const secret = String(msg.secret)
    if (!/^[a-z0-9]{6,32}$/.test(playerId) || secret.length < 16 || secret.length > 128) {
      return this.send(peer, { t: 'error', code: 'identity', message: 'Bad player identity' })
    }
    const joined = this.room.join(playerId, secret, String(msg.name ?? '').slice(0, NAME_MAX * 2), now)
    if (!joined.ok) return this.send(peer, { t: 'error', code: joined.code, message: joined.message })

    peer.playerId = playerId
    this.peers.add(peer)
    this.offlineSince.delete(playerId)
    const changed = this.room.connect(playerId, now)
    if (joined.changed || changed) await this.persist()
    this.scheduleClock()
    this.host.log?.('join', this.room.code, playerId)
    this.broadcast(now)
  }

  async message(peer: Peer, msg: ClientMessage, now = Date.now()) {
    if (msg.t === 'ping') return this.send(peer, { t: 'pong' })
    if (msg.t === 'join') return this.join(peer, msg, now)
    const playerId = peer.playerId
    if (!playerId) return this.send(peer, { t: 'error', code: 'not-joined', message: 'Join a game first' })
    const room = this.room

    switch (msg.t) {
      case 'typing': {
        if (room.view().turn !== playerId || !Array.isArray(msg.letters)) return
        const letters = msg.letters.slice(0, room.game.setup.length).map((l) => (typeof l === 'string' && /^[A-Z]$/.test(l) ? l : ''))
        for (const other of this.peers) if (other !== peer) this.send(other, { t: 'typing', playerId, letters })
        return
      }
      case 'guess': {
        const clientId = String(msg.clientId ?? '').slice(0, 64)
        const word = String(msg.word ?? '').toUpperCase()
        if (!clientId || !/^[A-Z]{1,12}$/.test(word)) return this.send(peer, { t: 'rejected', clientId, code: 'bad', message: 'Letters only' })
        const outcome = room.guess(playerId, word, clientId, now)
        if (!outcome.ok) {
          this.send(peer, { t: 'rejected', clientId, code: outcome.code, message: outcome.message })
          if (outcome.code === 'time') {
            await this.persist()
            this.broadcast(now)
          }
          return
        }
        if (!outcome.duplicate) {
          await this.persist()
          this.host.log?.('guess', room.code, playerId, `${room.record.guesses.length}/${room.game.setup.maxGuesses}`, room.status)
        }
        this.send(peer, { t: 'accepted', clientId })
        // Clear everyone's ghost letters, then send the new board.
        for (const other of this.peers) if (other !== peer) this.send(other, { t: 'typing', playerId, letters: [] })
        this.broadcast(now)
        return
      }
      case 'hint': {
        const outcome = room.hint(playerId)
        if (!outcome.ok) return this.send(peer, { t: 'rejected', code: outcome.code, message: outcome.message })
        await this.persist()
        this.broadcast(now)
        return
      }
      case 'giveup': {
        if (room.giveUp(playerId, now)) {
          await this.persist()
          this.host.log?.('gave up', room.code, playerId)
          this.broadcast(now)
        }
        return
      }
      case 'pass': {
        if (room.pass(playerId)) {
          await this.persist()
          this.broadcast(now)
        }
        return
      }
      case 'rename': {
        if (room.rename(playerId, String(msg.name ?? ''))) {
          await this.persist()
          this.broadcast(now)
        }
        return
      }
      default:
        return this.send(peer, { t: 'error', code: 'unknown', message: 'Unknown message' })
    }
  }

  async leave(peer: Peer, now = Date.now()) {
    if (!this.peers.delete(peer)) return
    const playerId = peer.playerId
    if (!playerId) return
    if (this.room.disconnect(playerId)) {
      this.offlineSince.set(playerId, now)
      // Give the turn holder a moment to come back (a refresh, a tunnel) before moving on.
      if (this.room.view().turn === playerId) this.host.wakeAt(now + this.graceMs)
      this.broadcast(now)
    }
  }

  /** Timed work: move the turn on from an absent player, and end games whose clock ran out. */
  async tick(now = Date.now()) {
    let changed = false
    const holder = this.room.view().turn
    if (holder && !this.room.isOnline(holder)) {
      const since = this.offlineSince.get(holder) ?? 0
      if (now - since >= this.graceMs) changed = this.room.handOffIfAbsent(holder) || changed
      else this.host.wakeAt(since + this.graceMs)
    }
    if (this.room.expire(now)) {
      changed = true
      this.host.log?.('time up', this.room.code)
    }
    if (changed) {
      await this.persist()
      this.broadcast(now)
    }
    this.scheduleClock()
  }
}
