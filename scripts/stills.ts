/**
 * Captures phone-sized stills of the current app for the launch film.
 *   npm run build && npx tsx scripts/stills.ts [out-dir]
 * Runs the real server on a scratch database and plays real games; nothing touches production.
 */
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright-core'
import { startServer } from '../server/app'
import { Room } from '../server/rooms'
import type { GameState } from '../src/engine/types'
import { newPhone, planGuesses, sleep, soloGame, tap, typeWord } from './drive'

const ROOT = resolve(import.meta.dirname, '..')
const OUT = resolve(process.argv[2] ?? join(ROOT, 'launch/assets/app'))
const PORT = 8096
const BASE = `http://localhost:${PORT}`

const ME = { id: 'segunfilm01', secret: 'film-secret-segunfilm01-xxxx', name: 'segun', claimed: true }

/** A returning player: username claimed, a week-long streak, a few Journey levels cleared. */
async function seedPlayer(page: Page) {
  await page.goto(BASE)
  // Passed as a string: tsx's helpers don't exist inside the page.
  await page.evaluate(`(() => {
    const me = ${JSON.stringify(ME)}
    const day = (n) => {
      const d = new Date()
      d.setDate(d.getDate() - n)
      return d.toLocaleDateString('en-CA')
    }
    const activity = {}
    for (let n = 0; n < 6; n++) activity[day(n)] = { played: 2, won: 2 }
    for (let n = 9; n < 14; n++) activity[day(n)] = { played: 1, won: 1 }
    localStorage.setItem('wordx:v1:me', JSON.stringify(me))
    localStorage.setItem('wordx:v1:onboarded', 'true')
    localStorage.setItem('wordx:v1:seen-help', 'true')
    localStorage.setItem('wordx:v1:activity', JSON.stringify(activity))
    localStorage.setItem('wordx:v1:journey', JSON.stringify({ unlocked: 8, stars: { 1: 3, 2: 3, 3: 2, 4: 3, 5: 2, 6: 3, 7: 2 }, attempts: {} }))
  })()`)
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: join(OUT, `${name}.png`) })
  console.log('  ', name)
}

async function solo(browser: Browser, rule: string, slot: string, opts: { warmups?: number; win?: boolean } = {}) {
  const { context, page } = await newPhone(browser)
  await seedPlayer(page)
  const params = `rule=${rule}&slot=${slot}`
  const game = soloGame(params)
  await page.goto(`${BASE}/play?${params}`)
  await page.waitForSelector('.play-btn')
  await sleep(2600)
  await shot(page, `intro-${rule}`)
  await tap(page, '.play-btn')
  await sleep(1800)
  let state: GameState = game.newState()
  for (const w of planGuesses(game, opts.warmups ?? 3)) {
    await typeWord(page, w, game.locks(state), 60)
    state = game.submit(state, w).state
    await sleep(game.setup.feedbackKind === 'meter' ? 2800 : 2300)
  }
  await shot(page, `board-${rule}`)
  if (opts.win) {
    await typeWord(page, game.puzzle.answer.word, game.locks(state), 60)
    await sleep(1500)
    await shot(page, `win-${rule}`)
    await sleep(3000)
    await shot(page, `results-${rule}`)
  }
  await context.close()
}

async function home(browser: Browser) {
  const { context, page } = await newPhone(browser)
  await seedPlayer(page)
  await page.goto(BASE)
  await page.waitForSelector('.mode-card')
  await sleep(2500)
  await shot(page, 'home')
  await page.goto(`${BASE}/journey`)
  await sleep(2800)
  await shot(page, 'journey')
  await context.close()
}

/** A friends game seen from the creator's phone while their friend types. */
async function friends(browser: Browser) {
  const { context, page } = await newPhone(browser)
  await seedPlayer(page)
  const res = await fetch(`${BASE}/api/rooms`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ruleId: 'standard', turnSeconds: 60, creatorId: ME.id }) })
  const { code } = (await res.json()) as { code: string }
  await page.goto(`${BASE}/room/${code}`)
  await page.waitForSelector('.play-btn')
  await sleep(1500)
  await tap(page, '.play-btn')
  await sleep(1500)
  await shot(page, 'friends-waiting')

  const ws = new WebSocket(`ws://localhost:${PORT}/ws?room=${code}`)
  await new Promise((r) => (ws.onopen = r))
  ws.send(JSON.stringify({ t: 'join', room: code, playerId: 'tolufilm01', secret: 'film-secret-tolufilm01-xxxxx', name: 'Tolu' }))
  await sleep(1800)
  await shot(page, 'friends-your-turn')

  const game = new Room(app.store.loadRoom(code)!).game
  const [w1, w2] = planGuesses(game, 2)
  await typeWord(page, w1, {}, 60)
  await sleep(2400)
  // Tolu types live; the letters show up on the creator's board.
  for (let i = 1; i <= 3; i++) {
    ws.send(JSON.stringify({ t: 'typing', letters: [...w2.slice(0, i)] }))
    await sleep(250)
  }
  await sleep(600)
  await shot(page, 'friends-watching')
  ws.send(JSON.stringify({ t: 'guess', word: w2, clientId: 'film-1' }))
  await sleep(2400)
  await shot(page, 'friends-two-rows')
  ws.close()
  await context.close()
}

mkdirSync(OUT, { recursive: true })
const dbDir = join(tmpdir(), `wordx-stills-${Date.now()}`)
const app = startServer({ port: PORT, dbPath: join(dbDir, 'stills.db'), staticDir: resolve(ROOT, 'dist'), log: () => {} })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  await home(browser)
  await solo(browser, 'standard', '2026-09-14T00', { warmups: 3, win: true })
  await solo(browser, 'category', '2026-09-12T00', { warmups: 2 })
  await solo(browser, 'anagram', '2026-09-15T00', { warmups: 2 })
  await solo(browser, 'fog', '2026-09-13T00', { warmups: 3 })
  await solo(browser, 'decay', '2026-09-16T00', { warmups: 3 })
  await solo(browser, 'vowel', '2026-09-17T00', { warmups: 2 })
  await solo(browser, 'naija', '2026-09-18T00', { warmups: 2 })
  await friends(browser)
} finally {
  await browser.close()
  await app.close()
  rmSync(dbDir, { recursive: true, force: true })
}
