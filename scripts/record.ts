/**
 * Records the prototype's main flows as phone-sized MP4s for sharing.
 *   npm run build && npx tsx scripts/record.ts
 * Runs the real production server on a scratch database, drives Chrome by tapping the
 * on-screen keys, captures frames at 2x, and encodes them with ffmpeg.
 */
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright-core'
import { startServer } from '../server/app'
import { Room } from '../server/rooms'
import type { Game } from '../src/engine/engine'
import type { GameState } from '../src/engine/types'
import { ffmpeg, Recorder } from './recorder'
import { newPhone, planGuesses, setInput, sleep, soloGame, tap, typeWord } from './drive'

const ROOT = resolve(import.meta.dirname, '..')
const OUT = resolve(ROOT, 'recordings')
const PORT = 8095
const BASE = `http://localhost:${PORT}`
const only = process.argv.slice(2)

/** Plays a solo game to a win, following the same plan the app will score. */
async function playSolo(page: Page, game: Game, warmups = 2, showLeave = false) {
  let state = game.newState()
  const words = [...planGuesses(game, warmups), game.puzzle.answer.word]
  for (const [i, w] of words.entries()) {
    await typeWord(page, w, game.locks(state))
    state = game.submit(state, w).state
    await sleep(game.puzzle.answer.word === w ? 600 : game.setup.feedbackKind === 'meter' ? 2600 : 2100)
    if (showLeave && i === 0) {
      // Tapping back mid-game asks before leaving.
      await tap(page, '[aria-label="Back to home"]')
      await sleep(2200)
      await tap(page, '.sheet .play-btn')
      await sleep(900)
    }
  }
}

// ---------- The flows ----------

type Flow = (browser: Browser) => Promise<void>

/** Home → pick Solo → rule intro → play this drop to a win → results. */
const soloDrop: Flow = async (browser) => {
  const { context, page } = await newPhone(browser)
  const game = soloGame('')
  await page.goto(BASE)
  await page.waitForSelector('.mode-card')
  const rec = new Recorder(page, 'solo')
  await rec.start()
  const t0 = Date.now() / 1000
  await page.reload()
  await sleep(3200)
  await tap(page, '.mode-solo')
  await sleep(3600)
  await tap(page, '.play-btn')
  await sleep(2000)
  await playSolo(page, game, 2, true)
  await sleep(5500)
  const t1 = Date.now() / 1000
  await rec.stop()
  rec.encode(join(OUT, '01-solo-drop.mp4'), t0, t1)
  rec.cleanup()
  await context.close()
}

/** Two phones side by side: create a game, invite, watch each other type, solve together. */
const withFriends: Flow = async (browser) => {
  const ada = await newPhone(browser)
  const segun = await newPhone(browser)
  await ada.page.goto(BASE)
  await segun.page.goto(BASE)
  await ada.page.waitForSelector('.mode-card')

  const recA = new Recorder(ada.page, 'ada')
  const recS = new Recorder(segun.page, 'segun')
  await recA.start()
  await recS.start()
  const t0 = Date.now() / 1000
  await sleep(1500)

  // Ada creates a Classic game.
  await tap(ada.page, '.mode-friends')
  await sleep(900)
  await setInput(ada.page, '.sheet .name-input', 'Ada')
  await sleep(300)
  await tap(ada.page, '.sheet button.practice-chip:has-text("Classic")')
  await sleep(400)
  await tap(ada.page, '.sheet .play-btn')
  await ada.page.waitForURL(/\/room\//)
  const code = new URL(ada.page.url()).pathname.split('/').pop()!
  await sleep(2600)
  await tap(ada.page, '.play-btn')
  await sleep(1800)

  // Ada opens the invite sheet; Segun joins with the code.
  await tap(ada.page, '[aria-label="Invite friends"]')
  await sleep(1200)
  await setInput(segun.page, '#join-code', code)
  await sleep(300)
  await tap(segun.page, '.join-btn')
  await segun.page.waitForURL(/\/room\//)
  await sleep(1500)
  await setInput(segun.page, '.name-input', 'Segun')
  await sleep(300)
  await tap(ada.page, '.sheet-close')
  await sleep(500)
  await tap(segun.page, '.play-btn')
  await sleep(2200)

  // The room's answer lives on the server; read it the way the server does.
  const room = new Room(app.store.loadRoom(code)!)
  const game = room.game
  const [w1, w2, w3] = planGuesses(game, 3)
  let state = game.newState()
  const play = async (page: Page, word: string, gap = 420) => {
    await typeWord(page, word, game.locks(state), gap)
    state = game.submit(state, word).state
    await sleep(2400)
  }
  await play(ada.page, w1) // Segun watches "Ada is playing" and her letters appear.
  await play(segun.page, w2, 520) // Then the other way round.
  await play(ada.page, w3)
  await play(segun.page, game.puzzle.answer.word, 520)
  await sleep(5000)
  const t1 = Date.now() / 1000
  await recA.stop()
  await recS.stop()

  const a = join(OUT, '.ada.mp4')
  const s = join(OUT, '.segun.mp4')
  recA.encode(a, t0, t1)
  recS.encode(s, t0, t1)
  // Side by side with a gutter, phone frames on a dark backdrop.
  ffmpeg([
    '-i', a, '-i', s,
    '-filter_complex', '[0]pad=iw+60:ih+120:30:60:#111111[l];[1]pad=iw+60:ih+120:30:60:#111111[r];[l][r]hstack=inputs=2,scale=trunc(iw/2)*2:trunc(ih/2)*2',
    '-c:v', 'libx264', '-crf', '18', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(OUT, '02-with-friends.mp4'),
  ])
  rmSync(a)
  rmSync(s)
  recA.cleanup()
  recS.cleanup()
  await ada.context.close()
  await segun.context.close()
}

/** Each rule's signature motion, one after another. */
const ruleTour: Flow = async (browser) => {
  const { context, page } = await newPhone(browser)
  const rec = new Recorder(page, 'tour')
  await page.goto(`${BASE}/play?rule=category&slot=2026-09-12T06`)
  await page.waitForSelector('.play-btn')
  await rec.start()
  const t0 = Date.now() / 1000
  const rules: [string, string][] = [
    ['category', '2026-09-12T06'],
    ['anagram', '2026-09-12T12'],
    ['fog', '2026-09-13T00'],
    ['vowel', '2026-09-13T06'],
    ['naija', '2026-09-13T12'],
  ]
  for (const [rule, slot] of rules) {
    const params = `rule=${rule}&slot=${slot}`
    const game = soloGame(params)
    await page.goto(`${BASE}/play?${params}`)
    await sleep(3000)
    await tap(page, '.play-btn')
    await sleep(1900)
    let state = game.newState()
    for (const w of planGuesses(game, 2)) {
      await typeWord(page, w, game.locks(state), 140)
      state = game.submit(state, w).state
      await sleep(game.setup.feedbackKind === 'meter' ? 2700 : 2200)
    }
    await sleep(600)
  }
  const t1 = Date.now() / 1000
  await rec.stop()
  rec.encode(join(OUT, '03-rule-tour.mp4'), t0, t1)
  rec.cleanup()
  await context.close()
}

/** Stuck on an unfamiliar word: take a clue, then a letter, then solve. */
const hints: Flow = async (browser) => {
  const { context, page } = await newPhone(browser)
  const params = 'rule=naija&slot=2026-09-10T06'
  const game = soloGame(params)
  const rec = new Recorder(page, 'hints')
  await page.goto(`${BASE}/play?${params}`)
  await page.waitForSelector('.play-btn')
  await rec.start()
  const t0 = Date.now() / 1000
  await sleep(1200)
  await tap(page, '.play-btn')
  await sleep(1900)
  let state = game.newState()
  for (const w of ['CRANE', 'MOUND']) {
    await typeWord(page, w, game.locks(state), 150)
    state = game.submit(state, w).state
    await sleep(2200)
  }
  await tap(page, '.hint-btn')
  state = game.hint(state).ok ? (game.hint(state) as { state: GameState }).state : state
  await sleep(2600)
  await tap(page, '.hint-btn')
  const h2 = game.hint(state)
  if (h2.ok) state = h2.state
  await sleep(2600)
  await typeWord(page, game.puzzle.answer.word, game.locks(state), 170)
  await sleep(6500)
  const t1 = Date.now() / 1000
  await rec.stop()
  rec.encode(join(OUT, '04-hints.mp4'), t0, t1)
  rec.cleanup()
  await context.close()
}

const FLOWS: Record<string, Flow> = { solo: soloDrop, friends: withFriends, tour: ruleTour, hints }

// ---------- Run ----------

mkdirSync(OUT, { recursive: true })
const dbDir = join(tmpdir(), `wordx-rec-db-${Date.now()}`)
const app = startServer({ port: PORT, dbPath: join(dbDir, 'rec.db'), staticDir: resolve(ROOT, 'dist'), log: () => {} })
// Screencast frames ignore the page's pixel ratio unless the whole browser runs at 2x.
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--force-device-scale-factor=2'] })
try {
  for (const [name, flow] of Object.entries(FLOWS)) {
    if (only.length && !only.includes(name)) continue
    const started = Date.now()
    process.stdout.write(`recording ${name}… `)
    await flow(browser)
    console.log(`done in ${Math.round((Date.now() - started) / 1000)}s`)
  }
} finally {
  await browser.close()
  await app.close()
  rmSync(dbDir, { recursive: true, force: true })
}
