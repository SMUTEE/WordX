/** Shared helpers for driving the real app in Chrome: used by the recorder and the stills capture. */
import type { Browser, BrowserContext, Page } from 'playwright-core'
import schedule from '../src/data/schedule.json'
import { COMMON_ANSWERS } from '../src/data/words'
import { defaultDictionary } from '../src/engine/dictionary'
import { createGame, type Game } from '../src/engine/engine'
import { currentSlot, normalizeSlot, resolvePuzzle, type ScheduleConfig } from '../src/engine/schedule'
import type { GameState } from '../src/engine/types'
import { registry } from '../src/rules'

export const VIEW = { width: 430, height: 932 }
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ---------- Driving the app like a person ----------

export async function newPhone(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2, hasTouch: false, locale: 'en-GB', timezoneId: 'Africa/Lagos' })
  const page = await context.newPage()
  return { context, page }
}

export async function tap(page: Page, selector: string, hold = 90) {
  const box = await page.locator(selector).first().boundingBox()
  if (!box) throw new Error(`nothing to tap: ${selector}`)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 })
  await page.mouse.down()
  await sleep(hold)
  await page.mouse.up()
}

/** Types on the on-screen keyboard, skipping letters already locked in place. */
export async function typeWord(page: Page, word: string, locks: Record<number, string> = {}, gap = 170) {
  for (let i = 0; i < word.length; i++) {
    if (locks[i]) continue
    await tap(page, `[data-key="${word[i]}"]`)
    await sleep(gap)
  }
  await sleep(250)
  await tap(page, '[data-key="enter"]', 120)
}

export async function setInput(page: Page, selector: string, value: string) {
  await page.locator(selector).first().click()
  await page.keyboard.type(value, { delay: 90 })
}

// ---------- Choosing guesses that tell a good story ----------

/** Picks guesses that warm up toward the answer and are legal under the rule. */
export function planGuesses(game: Game, count: number): string[] {
  const answer = game.puzzle.answer.word
  let state: GameState = game.newState()
  const words: string[] = []
  const letters = game.setup.hint?.kind === 'letters' ? game.setup.hint.letters : null
  // Anagram guesses are rearrangements; otherwise prefer everyday words, then the full dictionary.
  const pools = letters
    ? [permutations(letters)]
    : [COMMON_ANSWERS.map((e) => e.word), defaultDictionary().words as string[]]
  let last = -1
  for (let k = 0; k < count; k++) {
    let best: { w: string; score: number } | null = null
    for (const w of pools.find((p) => p.some((x) => x !== answer && !words.includes(x) && game.validate(fill(x, game.locks(state)), state).ok)) ?? []) {
      if (w === answer) continue
      if (words.includes(w) || !game.validate(fill(w, game.locks(state)), state).ok) continue
      const r = game.submit(state, fill(w, game.locks(state)))
      if (!r.accepted) continue
      const fb = r.guess.feedback
      const score = fb.kind === 'meter' ? Math.round(fb.value * 10) : fb.marks.reduce((s, m) => s + (m === 'correct' ? 2 : m === 'present' ? 1 : 0), 0)
      const target = k === 0 ? 3 : last + 2
      if (score >= Math.min(target, 8) && score < 9 && (!best || Math.abs(score - target) < Math.abs(best.score - target))) best = { w, score }
    }
    if (!best) break
    const w = fill(best.w, game.locks(state))
    state = game.submit(state, w).state
    words.push(w)
    last = best.score
  }
  return words
}

function permutations(letters: string[]): string[] {
  if (letters.length <= 1) return [letters.join('')]
  const out = new Set<string>()
  letters.forEach((l, i) => {
    for (const rest of permutations([...letters.slice(0, i), ...letters.slice(i + 1)])) out.add(l + rest)
  })
  return [...out]
}

export const fill = (word: string, locks: Record<number, string>) => [...word].map((c, i) => locks[i] ?? c).join('')

export function soloGame(params: string): Game {
  const q = new URLSearchParams(params)
  const slot = q.get('slot') ? normalizeSlot(q.get('slot')!) : currentSlot()
  const dictionary = defaultDictionary()
  const puzzle = resolvePuzzle({ slot, schedule: schedule as ScheduleConfig, registry, dictionary, forceRuleId: q.get('rule') ?? undefined })
  return createGame(registry.get(puzzle.ruleId)!, puzzle, dictionary)
}

