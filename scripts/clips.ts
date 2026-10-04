/**
 * Records short, real interaction clips for the launch film: a Classic game won, a Fog guess,
 * and a friend's live letters arriving.
 *   npm run build && npx tsx scripts/clips.ts [out-dir]
 * Each clip also gets first.png / last.png so the film can hold the phone on exact frames.
 */
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright-core'
import { startServer } from '../server/app'
import { Room } from '../server/rooms'
import type { GameState } from '../src/engine/types'
import { newPhone, planGuesses, sleep, soloGame, tap, typeWord } from './drive'
import { ffmpeg, Recorder } from './recorder'

const ROOT = resolve(import.meta.dirname, '..')
const OUT = resolve(process.argv[2] ?? join(ROOT, 'launch-live/assets/clips'))
const PORT = 8097
const BASE = `http://localhost:${PORT}`
const ME = { id: 'segunfilm01', secret: 'film-secret-segunfilm01-xxxx', name: 'segun', claimed: true }

async function seedPlayer(page: Page) {
  await page.goto(BASE)
  // Passed as a string: tsx's helpers don't exist inside the page.
  await page.evaluate(`(() => {
    localStorage.setItem('wordx:v1:me', ${JSON.stringify(JSON.stringify(ME))})
    localStorage.setItem('wordx:v1:onboarded', 'true')
    localStorage.setItem('wordx:v1:seen-help', 'true')
  })()`)
}

/** Records from `start` until `body` resolves, then writes <name>.mp4 + first/last frames. */
async function clip(page: Page, name: string, body: () => Promise<void>) {
  const rec = new Recorder(page, name)
  await rec.start()
  await sleep(300)
  const t0 = Date.now() / 1000
  await body()
  const t1 = Date.now() / 1000
  await rec.stop()
  const out = join(OUT, `${name}.mp4`)
  rec.encode(out, t0, t1)
  rec.cleanup()
  ffmpeg(['-i', out, '-frames:v', '1', join(OUT, `${name}-first.png`)])
  ffmpeg(['-sseof', '-0.1', '-i', out, '-frames:v', '1', '-update', '1', join(OUT, `${name}-last.png`)])
  console.log('  ', name, `${(t1 - t0).toFixed(1)}s`)
}

async function soloStart(browser: Browser, params: string) {
  const { context, page } = await newPhone(browser)
  await seedPlayer(page)
  const game = soloGame(params)
  await page.goto(`${BASE}/play?${params}`)
  await page.waitForSelector('.play-btn')
  await sleep(1200)
  await tap(page, '.play-btn')
  await sleep(1800)
  return { context, page, game }
}

/** Two guesses warming up, then the answer, the win and the results sheet. */
async function classic(browser: Browser) {
  const { context, page, game } = await soloStart(browser, 'rule=standard&slot=2026-09-14T00')
  let state: GameState = game.newState()
  await clip(page, 'classic', async () => {
    for (const w of planGuesses(game, 2)) {
      await typeWord(page, w, game.locks(state), 85)
      state = game.submit(state, w).state
      await sleep(1750)
    }
    await typeWord(page, game.puzzle.answer.word, game.locks(state), 85)
    await sleep(3400)
  })
  await context.close()
}

/** One Fog guess: letters typed, then the temperature lands. */
async function fog(browser: Browser) {
  const { context, page, game } = await soloStart(browser, 'rule=fog&slot=2026-09-13T00')
  let state: GameState = game.newState()
  const [w1, w2] = planGuesses(game, 2)
  await typeWord(page, w1, {}, 60)
  state = game.submit(state, w1).state
  await sleep(2600)
  await clip(page, 'fog', async () => {
    await typeWord(page, w2, game.locks(state), 110)
    await sleep(2400)
  })
  await context.close()
}

/** The creator's phone while Tolu types live, guesses, and the turn comes back. */
async function friends(browser: Browser) {
  const { context, page } = await newPhone(browser)
  await seedPlayer(page)
  const res = await fetch(`${BASE}/api/rooms`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ruleId: 'standard', turnSeconds: 60, creatorId: ME.id }) })
  const { code } = (await res.json()) as { code: string }
  await page.goto(`${BASE}/room/${code}`)
  await page.waitForSelector('.play-btn')
  await sleep(1200)
  await tap(page, '.play-btn')
  await sleep(1200)
  const ws = new WebSocket(`ws://localhost:${PORT}/ws?room=${code}`)
  await new Promise((r) => (ws.onopen = r))
  ws.send(JSON.stringify({ t: 'join', room: code, playerId: 'tolufilm01', secret: 'film-secret-tolufilm01-xxxxx', name: 'Tolu' }))
  await sleep(1500)
  const game = new Room(app.store.loadRoom(code)!).game
  const [w1, w2, w3] = planGuesses(game, 3)
  await typeWord(page, w1, {}, 60)
  await sleep(2600)
  await clip(page, 'friends', async () => {
    await sleep(400)
    for (let i = 1; i <= w2.length; i++) {
      ws.send(JSON.stringify({ t: 'typing', letters: [...w2.slice(0, i)] }))
      await sleep(300)
    }
    await sleep(300)
    ws.send(JSON.stringify({ t: 'guess', word: w2, clientId: 'film-1' }))
    await sleep(2300)
    // Your turn again: start typing the next word.
    for (const ch of (w3 ?? 'STORM').slice(0, 3)) {
      await tap(page, `[data-key="${ch}"]`)
      await sleep(160)
    }
    await sleep(500)
  })
  ws.close()
  await context.close()
}

mkdirSync(OUT, { recursive: true })
const dbDir = join(tmpdir(), `wordx-clips-${Date.now()}`)
const app = startServer({ port: PORT, dbPath: join(dbDir, 'clips.db'), staticDir: resolve(ROOT, 'dist'), log: () => {} })
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--force-device-scale-factor=2'] })
try {
  await classic(browser)
  await fog(browser)
  await friends(browser)
} finally {
  await browser.close()
  await app.close()
  rmSync(dbDir, { recursive: true, force: true })
}
