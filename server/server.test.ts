import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import type { RoomView, ServerMessage } from '../src/net/protocol'
import { startServer } from './app'
import { Room, type RoomRecord } from './rooms'
import { dropGame } from './drop'
import { addSlots } from '../src/engine/schedule'

const PORT = 18_787
let app: ReturnType<typeof startServer>

beforeAll(() => {
  app = startServer({ port: PORT, dbPath: ':memory:', turnGraceSeconds: 0.2, log: () => {} })
})
afterAll(() => app.close())

/** A scripted player: connects, joins, and records what the server sends. */
class Bot {
  ws: WebSocket
  inbox: ServerMessage[] = []
  id: string
  name: string
  secret: string
  constructor(id: string, name: string, secret = `secret-${id}-0123456789`) {
    this.id = id
    this.name = name
    this.secret = secret
    this.ws = new WebSocket(`ws://localhost:${PORT}/ws`)
    this.ws.on('message', (d) => this.inbox.push(JSON.parse(String(d))))
  }
  open() {
    return new Promise<void>((ok) => (this.ws.readyState === WebSocket.OPEN ? ok() : this.ws.once('open', () => ok())))
  }
  send(msg: object) {
    this.ws.send(JSON.stringify(msg))
  }
  async join(room: string) {
    await this.open()
    this.send({ t: 'join', room, playerId: this.id, secret: this.secret, name: this.name })
    return this.next('room')
  }
  /** Waits for the next message of a type that arrives after this call. */
  next<T extends ServerMessage['t']>(t: T, timeout = 2000): Promise<Extract<ServerMessage, { t: T }>> {
    const start = this.inbox.length
    return new Promise((ok, fail) => {
      const timer = setTimeout(() => fail(new Error(`${this.name}: no "${t}" message`)), timeout)
      const check = () => {
        const hit = this.inbox.slice(start).find((m) => m.t === t)
        if (hit) {
          clearTimeout(timer)
          ok(hit as Extract<ServerMessage, { t: T }>)
        } else setTimeout(check, 10)
      }
      check()
    })
  }
  latestRoom(): RoomView {
    const rooms = this.inbox.filter((m): m is Extract<ServerMessage, { t: 'room' }> => m.t === 'room')
    return rooms[rooms.length - 1].room
  }
  close() {
    this.ws.close()
  }
}

async function createRoom(ruleId = 'standard', extra: object = {}): Promise<string> {
  const res = await fetch(`http://localhost:${PORT}/api/rooms`, { method: 'POST', body: JSON.stringify({ ruleId, ...extra }) })
  expect(res.status).toBe(201)
  return (await res.json()).code
}

const settle = (ms = 60) => new Promise((r) => setTimeout(r, ms))

/** A started game: Ada (the creator, first to play) and a friend. */
async function startedGame(tag: string, extra: object = {}) {
  const ada = new Bot(`ada${tag}`.padEnd(8, 'x'), 'Ada')
  const code = await createRoom('standard', { creatorId: ada.id, ...extra })
  const friend = new Bot(`fri${tag}`.padEnd(8, 'x'), 'Segun')
  await ada.join(code)
  await friend.join(code)
  await settle()
  return { code, ada, friend }
}

describe('co-op server', () => {
  it('creates rooms and rejects unknown or flagged rules', async () => {
    const code = await createRoom()
    expect(code).toMatch(/^[A-Z2-9]{6}$/)
    const bad = await fetch(`http://localhost:${PORT}/api/rooms`, { method: 'POST', body: JSON.stringify({ ruleId: 'liar' }) })
    expect(bad.status).toBe(400)
    const info = await fetch(`http://localhost:${PORT}/api/rooms/${code}`)
    expect((await info.json()).status).toBe('playing')
    expect((await fetch(`http://localhost:${PORT}/api/rooms/ZZZZZZ`)).status).toBe(404)
  })

  it('takes turns, shows typing, and broadcasts each guess to everyone', async () => {
    const code = await createRoom()
    const ada = new Bot('adaplayer1', 'Ada')
    const segun = new Bot('segunplayr', 'Segun')
    const first = await ada.join(code)
    // Nobody can play alone: the game waits for a friend.
    expect(first.room).toMatchObject({ turn: null, waiting: true })
    await segun.join(code)
    await settle()
    expect(ada.latestRoom()).toMatchObject({ turn: 'adaplayer1', waiting: false })
    expect(ada.latestRoom().players.map((p) => [p.name, p.online])).toEqual([
      ['Ada', true],
      ['Segun', true],
    ])

    // Not Segun's turn yet.
    segun.send({ t: 'guess', word: 'CRANE', clientId: 's1' })
    expect((await segun.next('rejected')).code).toBe('turn')

    // Ada types; Segun sees her letters live.
    const typing = segun.next('typing')
    ada.send({ t: 'typing', letters: ['C', 'R', 'A'] })
    expect((await typing).letters).toEqual(['C', 'R', 'A'])

    // Ada guesses; both get the board, and the turn moves to Segun.
    const segunSees = segun.next('room')
    ada.send({ t: 'guess', word: 'CRANE', clientId: 'a1' })
    await ada.next('accepted')
    const view = (await segunSees).room
    expect(view.guesses).toHaveLength(1)
    expect(view.guesses[0]).toMatchObject({ word: 'CRANE', playerId: 'adaplayer1' })
    expect(view.guesses[0].feedback.kind).toBe('tiles')
    expect(view.turn).toBe('segunplayr')
    expect(view.answer).toBeUndefined()

    // Strict turns: Ada can't go again until Segun has played.
    ada.send({ t: 'guess', word: 'SLATE', clientId: 'a2' })
    expect((await ada.next('rejected')).code).toBe('turn')

    ada.close()
    segun.close()
  })

  it('refuses guesses while waiting for a friend', async () => {
    const code = await createRoom()
    const ada = new Bot('adaalone01', 'Ada')
    await ada.join(code)
    ada.send({ t: 'guess', word: 'CRANE', clientId: 'w1' })
    expect((await ada.next('rejected')).code).toBe('waiting')
    ada.close()
  })

  it('passes the turn when its clock runs out, without using a try', async () => {
    const { ada, friend } = await startedGame('turnclk', { turnSeconds: 30 })
    expect(ada.latestRoom().turnLimit).toBe(30_000)
    expect(ada.latestRoom().turnDeadline).toBeGreaterThan(Date.now())
    ada.close()
    friend.close()
  })

  it('only the creator can end the game, and it ends for everyone', async () => {
    const { ada, friend } = await startedGame('endgame')
    friend.send({ t: 'end' })
    expect((await friend.next('rejected')).code).toBe('not-creator')
    const seen = friend.next('room')
    ada.send({ t: 'end' })
    const room = (await seen).room
    expect(room).toMatchObject({ status: 'lost', endReason: 'ended', turn: null })
    expect(room.answer?.word).toBeTruthy()
    ada.close()
    friend.close()
  })

  it('never double-counts a resent guess', async () => {
    const { ada, friend } = await startedGame('resend')
    ada.send({ t: 'guess', word: 'CRANE', clientId: 'same' })
    await ada.next('accepted')
    ada.send({ t: 'guess', word: 'CRANE', clientId: 'same' })
    await ada.next('accepted')
    await settle()
    expect(ada.latestRoom().guesses).toHaveLength(1)
    ada.close()
    friend.close()
  })

  it('refuses invalid words without using a try', async () => {
    const { ada, friend } = await startedGame('invalid')
    ada.send({ t: 'guess', word: 'QWXZY', clientId: 'x' })
    expect((await ada.next('rejected')).code).toBe('vocabulary')
    expect(ada.latestRoom().guesses).toHaveLength(0)
    ada.close()
    friend.close()
  })

  it('passes the turn on when its holder leaves', async () => {
    const code = await createRoom()
    const ada = new Bot('adaleaver1', 'Ada')
    const segun = new Bot('segunstay1', 'Segun')
    await ada.join(code)
    await segun.join(code)
    await settle()
    expect(segun.latestRoom().turn).toBe('adaleaver1')
    ada.close()
    await settle(400)
    expect(segun.latestRoom().turn).toBe('segunstay1')
    expect(segun.latestRoom().players.find((p) => p.name === 'Ada')?.online).toBe(false)
    segun.close()
  })

  it('stops impostors reusing someone else’s player id', async () => {
    const code = await createRoom()
    const ada = new Bot('adarealone', 'Ada')
    await ada.join(code)
    const fake = new Bot('adarealone', 'Fake', 'a-different-secret-123456')
    await fake.open()
    fake.send({ t: 'join', room: code, playerId: 'adarealone', secret: fake.secret, name: 'Fake' })
    expect((await fake.next('error')).code).toBe('identity')
    ada.close()
    fake.close()
  })

  it('survives a restart: rooms reload from the database with the same board', async () => {
    const { code, ada, friend } = await startedGame('restart')
    ada.send({ t: 'guess', word: 'SLATE', clientId: 'r1' })
    await ada.next('accepted')
    await settle()
    const before = ada.latestRoom()
    ada.close()
    friend.close()

    const reloaded = new Room(app.store.loadRoom(code)!)
    expect(reloaded.view().guesses).toEqual(before.guesses)
  })
})

describe('daily drop on the server', () => {
  const post = (body: object) =>
    fetch(`http://localhost:${PORT}/api/drop/play`, { method: 'POST', body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }))

  it('serves the drop without its answer, and scores words', async () => {
    const info = await (await fetch(`http://localhost:${PORT}/api/drop`)).json()
    expect(info.view.answer).toBeUndefined()
    expect(info.view.setup.length).toBeGreaterThanOrEqual(4)
    const slot = info.view.slot
    // The server knows the answer; the test reads it the same way the server does.
    const answer = dropGame(slot, 'dev-drop-salt').puzzle.answer.word
    const filler = answer === 'CRANE' ? 'SLATE' : 'CRANE'
    const len = info.view.setup.length
    const first = len === 5 ? filler : answer.split('').reverse().join('')
    const r1 = await post({ slot, words: [first], hintsAfter: [] })
    if (!r1.body.rejected) {
      expect(r1.body.view.guesses).toHaveLength(1)
      expect(r1.body.view.answer).toBeUndefined()
    }
    const r2 = await post({ slot, words: [answer], hintsAfter: [] })
    expect(r2.body.view.status).toBe('won')
    expect(r2.body.view.answer.word).toBe(answer)
  })

  it('reports the refused word and applies nothing after it', async () => {
    const r = await post({ words: ['QWXZY'], hintsAfter: [] })
    expect(r.body.rejected).toMatchObject({ index: 0 })
    expect(r.body.view.guesses).toHaveLength(0)
  })

  it('reveals the word when you give up', async () => {
    const r = await post({ words: [], hintsAfter: [], end: 'gave-up' })
    expect(r.body.view).toMatchObject({ status: 'lost', endReason: 'gave-up' })
    expect(r.body.view.answer.word).toBeTruthy()
  })

  it('never serves a future drop', async () => {
    const r = await post({ slot: '2099-01-01T00', words: [], hintsAfter: [] })
    expect(r.status).toBe(404)
  })

  it('a different secret picks different words', () => {
    let differ = 0
    for (let i = 0; i < 12; i++) {
      const slot = addSlots('2026-09-01T00', i)
      if (dropGame(slot, 'secret-a').puzzle.answer.word !== dropGame(slot, 'secret-b').puzzle.answer.word) differ++
    }
    expect(differ).toBeGreaterThan(8)
  })
})

describe('usernames', () => {
  const base = `http://localhost:${PORT}/api/username`
  const check = async (name: string, id = '') => (await fetch(`${base}?name=${encodeURIComponent(name)}&id=${id}`)).json()
  const claim = async (id: string, username: string, secret = `secret-${id}-0123456789`) => {
    const r = await fetch(`${base}/claim`, { method: 'POST', body: JSON.stringify({ id, secret, username }) })
    return { status: r.status, body: await r.json() }
  }

  it('claims a free name; it is then taken for everyone else, whatever the capitals', async () => {
    expect((await check('Tolu_Reads')).available).toBe(true)
    expect((await claim('userone01', 'Tolu_Reads')).status).toBe(200)
    expect((await check('tolu_reads')).available).toBe(false)
    expect((await check('tolu_reads', 'userone01')).available).toBe(true)
    expect((await claim('usertwo02', 'TOLU_READS')).status).toBe(409)
  })

  it('changing your name frees the old one', async () => {
    await claim('userthree3', 'OldName')
    expect((await claim('userthree3', 'NewName')).status).toBe(200)
    expect((await check('OldName')).available).toBe(true)
    expect((await claim('userfour04', 'OldName')).status).toBe(200)
  })

  it('refuses bad names and other devices', async () => {
    expect((await check('ab')).available).toBe(false)
    expect((await check('sh1t_lord')).available).toBe(false)
    expect((await claim('userfive05', 'no spaces')).status).toBe(400)
    await claim('usersix006', 'Mine123')
    expect((await claim('usersix006', 'Stolen', 'some-other-device-secret')).status).toBe(403)
  })
})

describe('progress backups', () => {
  const call = (path: string, body: object) =>
    fetch(`http://localhost:${PORT}/api/profile/${path}`, { method: 'POST', body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }))
  const me = { id: 'backupuser1', secret: 'backup-secret-0123456789' }

  it('saves and restores progress with the save code', async () => {
    expect((await call('load', me)).status).toBe(404)
    expect((await call('save', { ...me, data: { journey: { unlocked: 7 } } })).status).toBe(200)
    const r = await call('load', me)
    expect(r.body.data.journey.unlocked).toBe(7)
  })

  it('refuses the wrong secret, both ways', async () => {
    const wrong = { id: me.id, secret: 'not-the-right-secret-xx' }
    expect((await call('load', wrong)).status).toBe(403)
    expect((await call('save', { ...wrong, data: {} })).status).toBe(403)
  })
})

describe('room rules', () => {
  const record = (extra: Partial<RoomRecord> = {}): RoomRecord => ({
    code: 'TESTAA',
    ruleId: 'standard',
    ruleVersion: 1,
    slot: '2026-10-03T00',
    createdAt: 0,
    players: [],
    guesses: [],
    hints: [],
    turn: null,
    timeLimit: null,
    deadline: null,
    ended: null,
    creatorId: 'p1aaaa',
    turnLimit: null,
    turnDeadline: null,
    startedAt: null,
    gaveUp: [],
    ...extra,
  })
  /** Ada (creator) and Segun, both connected; the game has started. */
  const twoPlayers = (extra: Partial<RoomRecord> = {}, now = 0) => {
    const room = new Room(record(extra))
    room.join('p1aaaa', 'secret-secret-secret', 'Ada', now)
    room.join('p2aaaa', 'secret-secret-secret', 'Segun', now)
    room.connect('p1aaaa', now)
    room.connect('p2aaaa', now)
    return room
  }

  it('reveals the answer only when the game ends', () => {
    const room = twoPlayers()
    const answer = room.game.puzzle.answer.word
    expect(room.view().answer).toBeUndefined()
    expect(room.view().turn).toBe('p1aaaa')
    expect(room.guess('p1aaaa', answer, 'c1', 1)).toEqual({ ok: true })
    expect(room.view().status).toBe('won')
    expect(room.view().answer?.word).toBe(answer)
    expect(room.view().turn).toBeNull()
  })

  it('strict rotation: nobody plays twice in a row', () => {
    const room = twoPlayers()
    expect(room.guess('p1aaaa', 'SLATE', 'c1', 1)).toEqual({ ok: true })
    expect(room.guess('p1aaaa', 'MOUND', 'c2', 2)).toMatchObject({ ok: false, code: 'turn' })
    expect(room.guess('p2aaaa', 'MOUND', 'c3', 3)).toEqual({ ok: true })
    expect(room.view().turn).toBe('p1aaaa')
  })

  it('a turn whose clock runs out passes on, and uses no try', () => {
    const room = twoPlayers({ turnLimit: 30_000 }, 1_000)
    expect(room.view().turnDeadline).toBe(31_000)
    expect(room.turnExpired(20_000)).toBe(false)
    expect(room.turnExpired(31_000)).toBe(true)
    expect(room.view()).toMatchObject({ turn: 'p2aaaa', turnDeadline: 61_000 })
    expect(room.view().guesses).toHaveLength(0)
  })

  it('hints unlock after two tries and replay exactly after a restart', () => {
    const room = twoPlayers()
    expect(room.hint('p1aaaa')).toMatchObject({ ok: false, code: 'hint' })
    room.guess('p1aaaa', 'SLATE', 'c1', 1)
    room.guess('p2aaaa', 'MOUND', 'c2', 2)
    expect(room.hint('p1aaaa')).toEqual({ ok: true })
    const h = room.view().hints[0]
    expect(h.kind).toBe('letter')
    // A guess after the hint must keep the hinted letter in place, and replay must agree.
    const answer = room.game.puzzle.answer.word
    expect(room.guess('p1aaaa', answer, 'c3', 3)).toEqual({ ok: true })
    const reloaded = new Room(structuredClone(room.record))
    expect(reloaded.view().hints).toEqual(room.view().hints)
    expect(reloaded.view().status).toBe('won')
  })

  it('the game clock starts when play starts, and running out ends it for everyone', () => {
    const timed = new Room(record({ code: 'TIMEDA', timeLimit: 4 * 60_000 }))
    timed.join('p1aaaa', 'secret-secret-secret', 'Ada', 0)
    timed.connect('p1aaaa', 500)
    expect(timed.view().deadline).toBeUndefined()
    timed.join('p2aaaa', 'secret-secret-secret', 'Segun', 0)
    timed.connect('p2aaaa', 1_000)
    expect(timed.view().deadline).toBe(1_000 + 4 * 60_000)
    expect(timed.guess('p1aaaa', 'SLATE', 'c1', 5 * 60_000)).toMatchObject({ ok: false, code: 'time' })
    expect(timed.view()).toMatchObject({ status: 'lost', endReason: 'time', turn: null })
    expect(timed.view().answer).toBeDefined()
  })

  it('only the creator can end the game; it survives a restart', () => {
    const room = twoPlayers()
    expect(room.endGame('p2aaaa')).toMatchObject({ ok: false, code: 'not-creator' })
    expect(room.endGame('p1aaaa')).toEqual({ ok: true })
    expect(new Room(structuredClone(room.record)).view().endReason).toBe('ended')
  })

  it('anyone can give up for themselves: they see the word, the rest play on', () => {
    const room = twoPlayers()
    expect(room.giveUp('p2aaaa')).toEqual({ ok: true })
    expect(room.view('p2aaaa').answer?.word).toBeTruthy()
    expect(room.view('p1aaaa').answer).toBeUndefined()
    expect(room.view().status).toBe('playing')
    // Segun is out of the rotation, so Ada now plays every turn.
    expect(room.guess('p1aaaa', 'SLATE', 'c1', 1)).toEqual({ ok: true })
    expect(room.view().turn).toBe('p1aaaa')
    expect(room.guess('p2aaaa', 'MOUND', 'c2', 2)).toMatchObject({ ok: false, code: 'gave-up' })
    // When the last player gives up too, the game ends.
    expect(room.giveUp('p1aaaa')).toEqual({ ok: true })
    expect(room.view()).toMatchObject({ status: 'lost', endReason: 'gave-up' })
  })

  it('never shows an offensive name to other players', () => {
    const room = new Room(record())
    room.join('p1aaaa', 'secret-secret-secret', 'sh1t head', 0)
    room.join('p2aaaa', 'secret-secret-secret', 'Odeyemi', 0)
    expect(room.view().players.map((p) => p.name)).toEqual(['Player', 'Odeyemi'])
  })

  it('caps players', () => {
    const room = new Room(record())
    for (let i = 0; i < 8; i++) expect(room.join(`player${i}`, 'secret-secret-secret', `P${i}`, 0).ok).toBe(true)
    expect(room.join('player9', 'secret-secret-secret', 'P9', 0)).toMatchObject({ ok: false, code: 'full' })
  })
})
