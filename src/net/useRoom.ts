import { useCallback, useEffect, useRef, useState } from 'react'
import type { Me } from './identity'
import type { ClientMessage, CreateRoomRequest, RoomView, ServerMessage } from './protocol'

export type Connection = 'connecting' | 'open' | 'reconnecting' | 'failed'

export type GuessResult = { ok: true } | { ok: false; code: string; message: string }

export interface RoomApi {
  connection: Connection
  room?: RoomView
  you?: string
  /** A fatal problem joining, e.g. bad code or full room. */
  error?: { code: string; message: string }
  /** Letters the current turn holder is typing right now. */
  typing: { playerId: string; letters: string[] } | null
  /** The latest refusal not tied to a guess, e.g. a hint that isn't available. */
  notice: { id: number; text: string } | null
  guess(word: string): Promise<GuessResult>
  sendTyping(letters: string[]): void
  pass(): void
  hint(): void
  /** Give up just for yourself. */
  giveUp(): void
  /** End the game for everyone (creator only). */
  endGame(): void
  /** Server time minus local time, to show the same countdown everyone else sees. */
  clockOffset: number
  rename(name: string): void
}

const GUESS_TIMEOUT_MS = 8000
const FATAL = new Set(['not-found', 'expired', 'full', 'identity', 'corrupt'])

/** The room is in the URL so Cloudflare can route the connection straight to that game. */
function socketUrl(code: string) {
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?room=${encodeURIComponent(code)}`
}

/**
 * A live connection to one room. Reconnects with backoff, rejoins automatically, and treats
 * the server's snapshot as the truth. Guesses carry an id so a retry after a dropped
 * connection can never count twice.
 */
export function useRoom(code: string, me: Me, enabled: boolean): RoomApi {
  const [connection, setConnection] = useState<Connection>('connecting')
  const [room, setRoom] = useState<RoomView>()
  const [you, setYou] = useState<string>()
  const [error, setError] = useState<RoomApi['error']>()
  const [typing, setTyping] = useState<RoomApi['typing']>(null)
  const [notice, setNotice] = useState<RoomApi['notice']>(null)
  const [clockOffset, setClockOffset] = useState(0)
  const ws = useRef<WebSocket | null>(null)
  const pending = useRef(new Map<string, { resolve(r: GuessResult): void; timer: number }>())
  const meRef = useRef(me)
  useEffect(() => {
    meRef.current = me
  }, [me])

  const send = useCallback((msg: ClientMessage) => {
    const s = ws.current
    if (s && s.readyState === WebSocket.OPEN) {
      s.send(JSON.stringify(msg))
      return true
    }
    return false
  }, [])

  useEffect(() => {
    if (!enabled) return
    let closed = false
    let attempt = 0
    let retryTimer: number | undefined
    let pingTimer: number | undefined

    const connect = () => {
      const s = new WebSocket(socketUrl(code))
      ws.current = s
      s.onopen = () => {
        attempt = 0
        const m = meRef.current
        s.send(JSON.stringify({ t: 'join', room: code, playerId: m.id, secret: m.secret, name: m.name } satisfies ClientMessage))
        pingTimer = window.setInterval(() => s.readyState === WebSocket.OPEN && s.send(JSON.stringify({ t: 'ping' })), 20_000)
      }
      s.onmessage = (e) => {
        let msg: ServerMessage
        try {
          msg = JSON.parse(String(e.data))
        } catch {
          return
        }
        switch (msg.t) {
          case 'room':
            setRoom(msg.room)
            setYou(msg.you)
            if (typeof msg.now === 'number') setClockOffset(msg.now - Date.now())
            setConnection('open')
            setError(undefined)
            setTyping((t) => (t && msg.room.turn === t.playerId ? t : null))
            return
          case 'typing':
            setTyping(msg.letters.some(Boolean) ? { playerId: msg.playerId, letters: msg.letters } : null)
            return
          case 'accepted':
          case 'rejected': {
            const p = msg.clientId ? pending.current.get(msg.clientId) : undefined
            if (!p) {
              if (msg.t === 'rejected') setNotice({ id: Date.now(), text: msg.message })
              return
            }
            window.clearTimeout(p.timer)
            pending.current.delete(msg.clientId!)
            p.resolve(msg.t === 'accepted' ? { ok: true } : { ok: false, code: msg.code, message: msg.message })
            return
          }
          case 'error':
            if (FATAL.has(msg.code)) {
              closed = true
              setError({ code: msg.code, message: msg.message })
              setConnection('failed')
              s.close()
            }
            return
        }
      }
      s.onclose = () => {
        window.clearInterval(pingTimer)
        if (closed) return
        setConnection('reconnecting')
        attempt += 1
        // 0.5s, 1s, 2s … capped at 10s, with jitter so a server restart isn't stampeded.
        const delay = Math.min(10_000, 500 * 2 ** Math.min(attempt, 5)) * (0.75 + Math.random() * 0.5)
        retryTimer = window.setTimeout(connect, delay)
      }
    }

    connect()
    const onOnline = () => {
      if (ws.current?.readyState === WebSocket.CLOSED) {
        window.clearTimeout(retryTimer)
        connect()
      }
    }
    window.addEventListener('online', onOnline)
    return () => {
      closed = true
      window.clearTimeout(retryTimer)
      window.clearInterval(pingTimer)
      window.removeEventListener('online', onOnline)
      ws.current?.close()
    }
  }, [code, enabled])

  const guess = useCallback(
    (word: string) =>
      new Promise<GuessResult>((resolve) => {
        const clientId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
        const timer = window.setTimeout(() => {
          pending.current.delete(clientId)
          resolve({ ok: false, code: 'timeout', message: 'Couldn’t reach the game' })
        }, GUESS_TIMEOUT_MS)
        pending.current.set(clientId, { resolve, timer })
        if (!send({ t: 'guess', word, clientId })) {
          window.clearTimeout(timer)
          pending.current.delete(clientId)
          resolve({ ok: false, code: 'offline', message: 'You’re offline' })
        }
      }),
    [send],
  )

  const lastTyping = useRef('')
  const sendTyping = useCallback(
    (letters: string[]) => {
      const key = letters.join(',')
      if (key === lastTyping.current) return
      lastTyping.current = key
      send({ t: 'typing', letters })
    },
    [send],
  )

  const pass = useCallback(() => void send({ t: 'pass' }), [send])
  const hint = useCallback(() => void send({ t: 'hint' }), [send])
  const giveUp = useCallback(() => void send({ t: 'giveup' }), [send])
  const endGame = useCallback(() => void send({ t: 'end' }), [send])
  const rename = useCallback((name: string) => void send({ t: 'rename', name }), [send])

  return { connection, room, you, error, typing, notice, clockOffset, guess, sendTyping, pass, hint, giveUp, endGame, rename }
}

export async function createRoom(req: CreateRoomRequest): Promise<{ code: string } | { error: string }> {
  try {
    const res = await fetch('/api/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req) })
    const body = await res.json()
    return res.ok ? { code: body.code } : { error: body.error ?? 'Couldn’t create a game' }
  } catch {
    return { error: 'Couldn’t reach the game server' }
  }
}

export async function checkRoom(code: string): Promise<{ ok: true } | { error: string }> {
  try {
    const res = await fetch(`/api/rooms/${encodeURIComponent(code)}`)
    if (res.ok) return { ok: true }
    const body = await res.json().catch(() => ({}))
    return { error: body.error ?? 'No game with that code' }
  } catch {
    return { error: 'Couldn’t reach the game server' }
  }
}
