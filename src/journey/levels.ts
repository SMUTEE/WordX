import { NAIJA_WORDS, type WordEntry } from '../data/words'
import { POOLS, type PoolName } from '../data/pools.generated'
import { defaultDictionary } from '../engine/dictionary'
import { createGame, type Game } from '../engine/engine'
import { hashString, nthOfPermutation } from '../engine/random'
import { currentSlot } from '../engine/schedule'
import type { Puzzle } from '../engine/types'
import { registry } from '../rules'
import { categoryPool } from '../rules/category'

/**
 * The Journey: a hundred levels, each turning several difficulty dials at once —
 * the rule, word length, how common the word is, tries, and hints.
 */
export interface LevelDef {
  n: number
  title: string
  ruleId: string
  pool: PoolName | 'category' | 'naija'
  /** When two levels share a pool, each takes its own slice so a word never shows up on both. */
  part?: [index: number, of: number]
  /** Plain-language description of where the words come from. */
  words: string
  maxGuesses: number
  maxHints: number
}

/**
 * Stages: the first four are five levels each (the original Journey); after that, stages of ten.
 * Difficulty climbs inside each stage and across them.
 */
export const STAGES = [
  { id: 'basics', name: 'Basics', from: 1, to: 5, blurb: 'Learn the rules', bg: '#FFD21F', ink: 'dark' as const },
  { id: 'twists', name: 'Twists', from: 6, to: 10, blurb: 'Rules that change the game', bg: '#FF8FD0', ink: 'dark' as const },
  { id: 'pressure', name: 'Pressure', from: 11, to: 15, blurb: 'Fewer tries, fewer hints', bg: '#2E5BFF', ink: 'light' as const },
  { id: 'mastery', name: 'Mastery', from: 16, to: 20, blurb: 'No hints. Rare words.', bg: '#111111', ink: 'light' as const },
  { id: 'long', name: 'Long haul', from: 21, to: 30, blurb: 'Longer words, every rule', bg: '#0E9F5A', ink: 'light' as const },
  { id: 'wordsmith', name: 'Wordsmith', from: 31, to: 40, blurb: 'The Liar joins in', bg: '#9B7BFF', ink: 'dark' as const },
  { id: 'heatwave', name: 'Heatwave', from: 41, to: 50, blurb: 'More Fog, more burning', bg: '#FF5A1F', ink: 'dark' as const },
  { id: 'lexicon', name: 'Lexicon', from: 51, to: 60, blurb: 'Five tries from here', bg: '#16C7C0', ink: 'dark' as const },
  { id: 'gauntlet', name: 'Gauntlet', from: 61, to: 70, blurb: 'No more hints', bg: '#FF3B5C', ink: 'dark' as const },
  { id: 'night', name: 'Night shift', from: 71, to: 80, blurb: 'Rare words, every rule', bg: '#1B2A6B', ink: 'light' as const },
  { id: 'grandmaster', name: 'Grandmaster', from: 81, to: 90, blurb: 'Long and rare', bg: '#F4F1EA', ink: 'dark' as const },
  { id: 'legend', name: 'Legend', from: 91, to: 100, blurb: 'Four tries for five letters', bg: '#111111', ink: 'light' as const },
]

export const stageOf = (n: number) => STAGES.find((s) => n >= s.from && n <= s.to)!

type Pool = LevelDef['pool']
const WORDS: Record<Pool, string> = {
  four_easy: 'Everyday 4-letter words',
  four_medium: 'Less common 4-letter words',
  five_easy: 'Very common words',
  five_common: 'Common words',
  five_medium: 'Less common words',
  five_hard: 'Rare letters, repeats, few vowels',
  five_vowel: 'Common words',
  five_anagram: 'Common words, jumbled',
  five_trap: 'Words with many near twins',
  six_common: 'Common 6-letter words',
  six_medium: 'Less common 6-letter words',
  category: 'A word from a theme',
  naija: 'Pidgin and Yoruba',
}
const RULE_TITLE: Record<string, string> = {
  standard: 'Classic', decay: 'Burnout', fog: 'Whiteout', anagram: 'Scrambled', vowel: 'Given vowels', category: 'Themed', naija: 'Naija', liar: 'Liar',
}
const POOL_TAG: Partial<Record<Pool, string>> = {
  four_easy: 'four', four_medium: 'four', six_common: 'long', six_medium: 'long, rare', five_medium: 'rare', five_hard: 'hardest', five_trap: 'lookalikes',
}

type Spec = [title: string | null, ruleId: string, pool: Pool, maxGuesses: number, maxHints: number]

/** The original twenty, hand-tuned. */
const FIRST: Spec[] = [
  // Basics: everyday words, generous tries, two hints.
  ['Warm-up', 'standard', 'four_easy', 7, 2],
  ['Five', 'standard', 'five_easy', 6, 2],
  ['Themed', 'category', 'category', 6, 2],
  ['Given vowels', 'vowel', 'five_vowel', 6, 2],
  ['Naija', 'naija', 'naija', 6, 2],
  // Twists: the rules start to bite.
  ['Quick four', 'standard', 'four_medium', 6, 1],
  ['Scrambled', 'anagram', 'five_anagram', 6, 1],
  ['Burnout', 'decay', 'five_common', 6, 1],
  ['Whiteout', 'fog', 'five_common', 8, 1],
  ['Lookalikes', 'standard', 'five_trap', 6, 1],
  // Pressure: fewer tries, longer words.
  ['Long', 'standard', 'six_common', 6, 1],
  ['Tight theme', 'category', 'category', 5, 1],
  ['Short fuse', 'standard', 'five_medium', 5, 1],
  ['Vowels, harder', 'vowel', 'five_vowel', 5, 0],
  ['Scrambled, harder', 'anagram', 'five_anagram', 5, 0],
  // Mastery: rare words, no hints.
  ['Burnout, harder', 'decay', 'five_medium', 6, 0],
  ['Deep fog', 'fog', 'six_common', 8, 0],
  ['Rare letters', 'standard', 'five_hard', 6, 0],
  ['Long and rare', 'standard', 'six_medium', 6, 0],
  ['Liar', 'liar', 'five_medium', 7, 0],
]

/**
 * Levels 21–100: [rule, pool] per level, ten per stage. Tries and hints come from the stage
 * (Fog always gets two more tries, the Liar one more), so later stages are tighter across the board.
 */
const LATER: [string, Pool][][] = [
  // Long haul (6 tries, 1 hint)
  [['standard', 'six_common'], ['decay', 'four_easy'], ['category', 'category'], ['fog', 'four_easy'], ['anagram', 'five_anagram'], ['standard', 'six_common'], ['vowel', 'five_vowel'], ['decay', 'five_easy'], ['naija', 'naija'], ['standard', 'five_trap']],
  // Wordsmith (6, 1)
  [['fog', 'five_easy'], ['category', 'category'], ['liar', 'four_easy'], ['standard', 'four_medium'], ['anagram', 'five_anagram'], ['decay', 'six_common'], ['vowel', 'five_vowel'], ['standard', 'six_common'], ['fog', 'five_common'], ['category', 'category']],
  // Heatwave (6, 1)
  [['fog', 'six_common'], ['decay', 'four_easy'], ['standard', 'four_medium'], ['anagram', 'five_anagram'], ['liar', 'five_easy'], ['category', 'category'], ['fog', 'four_easy'], ['decay', 'five_common'], ['vowel', 'five_vowel'], ['standard', 'six_medium']],
  // Lexicon (5, 1)
  [['standard', 'five_medium'], ['category', 'category'], ['decay', 'four_medium'], ['fog', 'six_common'], ['anagram', 'five_anagram'], ['standard', 'six_medium'], ['liar', 'four_easy'], ['vowel', 'five_vowel'], ['decay', 'five_medium'], ['standard', 'five_hard']],
  // Gauntlet (5, 0)
  [['standard', 'six_medium'], ['category', 'category'], ['fog', 'five_medium'], ['decay', 'four_medium'], ['anagram', 'five_anagram'], ['standard', 'five_medium'], ['liar', 'five_common'], ['decay', 'six_medium'], ['category', 'category'], ['standard', 'five_hard']],
  // Night shift (5, 0)
  [['fog', 'six_medium'], ['standard', 'five_medium'], ['decay', 'four_easy'], ['category', 'category'], ['liar', 'five_medium'], ['standard', 'six_medium'], ['decay', 'five_medium'], ['fog', 'five_hard'], ['standard', 'four_medium'], ['category', 'category']],
  // Grandmaster (5, 0)
  [['standard', 'six_medium'], ['decay', 'five_medium'], ['fog', 'five_medium'], ['category', 'category'], ['liar', 'six_medium'], ['standard', 'five_hard'], ['decay', 'six_medium'], ['fog', 'six_medium'], ['standard', 'five_medium'], ['standard', 'five_medium']],
  // Legend (4 tries for five letters, 5 for six; no hints)
  [['standard', 'six_medium'], ['decay', 'five_hard'], ['fog', 'six_medium'], ['standard', 'six_medium'], ['liar', 'five_medium'], ['decay', 'six_medium'], ['standard', 'five_hard'], ['fog', 'five_medium'], ['standard', 'six_medium'], ['liar', 'five_medium']],
]
const STAGE_DIALS: [tries: number, hints: number][] = [[6, 1], [6, 1], [6, 1], [5, 1], [5, 0], [5, 0], [5, 0], [4, 0]]

function laterSpecs(): Spec[] {
  return LATER.flatMap((stage, si) =>
    stage.map(([ruleId, pool]): Spec => {
      let [tries, hints] = STAGE_DIALS[si]
      if (si === 7 && pool.startsWith('six')) tries = 5
      if (ruleId === 'fog') tries += 2
      if (ruleId === 'liar') tries += 1
      const tag = POOL_TAG[pool]
      return [`${RULE_TITLE[ruleId]}${tag ? `, ${tag}` : ''}`, ruleId, pool, tries, hints]
    }),
  )
}

/** Every level that shares a pool takes its own slice of it, so a word never shows up on two levels. */
function build(specs: Spec[]): LevelDef[] {
  const uses = new Map<Pool, number>()
  for (const [, , pool] of specs) uses.set(pool, (uses.get(pool) ?? 0) + 1)
  const seen = new Map<Pool, number>()
  return specs.map(([title, ruleId, pool, maxGuesses, maxHints], i) => {
    const k = seen.get(pool) ?? 0
    seen.set(pool, k + 1)
    const of = uses.get(pool)!
    return { n: i + 1, title: title ?? RULE_TITLE[ruleId], ruleId, pool, part: of > 1 ? [k, of] : undefined, words: WORDS[pool], maxGuesses, maxHints }
  })
}

export const LEVELS: LevelDef[] = build([...FIRST, ...laterSpecs()])

export const LEVEL_COUNT = LEVELS.length

/**
 * How you play a level. Easy shows a clue to the word before the first guess; Scholar is the
 * level as designed, with no clue, and earns 1.6× the points.
 */
export type Difficulty = 'easy' | 'scholar'
export const DIFFICULTIES: { id: Difficulty; name: string; multiplier: number; blurb: string }[] = [
  { id: 'easy', name: 'Easy', multiplier: 1, blurb: 'A clue to the word up front' },
  { id: 'scholar', name: 'Scholar', multiplier: 1.6, blurb: 'No clue · 1.6× points' },
]
export const difficultyOf = (id: Difficulty) => DIFFICULTIES.find((d) => d.id === id)!

/** Tries and hints for a level. The same on both difficulties: only the clue differs. */
export function levelSetup(def: LevelDef): { maxGuesses: number; maxHints: number } {
  return { maxGuesses: def.maxGuesses, maxHints: def.maxHints }
}

/** A level attempt's puzzle id. Scholar keeps the original id so games in progress carry on. */
export const levelPuzzleId = (n: number, attempt: number, difficulty: Difficulty) =>
  `journey:${n}:${attempt}${difficulty === 'scholar' ? '' : `:${difficulty}`}`

export const levelDef = (n: number) => LEVELS.find((l) => l.n === n)

interface Item {
  entry: WordEntry
  meta?: Puzzle['meta']
}

const cache = new Map<string, Item[]>()

function items(def: LevelDef): Item[] {
  const key = `${def.pool}:${def.part?.join('/') ?? 'all'}`
  const hit = cache.get(key)
  if (hit) return hit
  let list: Item[]
  if (def.pool === 'category') list = categoryPool().map((x) => ({ entry: x.entry, meta: { categoryId: x.categoryId } }))
  else if (def.pool === 'naija') list = NAIJA_WORDS.map((entry) => ({ entry }))
  else list = POOLS[def.pool].split(' ').map((word) => ({ entry: { word } }))
  if (def.part) {
    const [k, of] = def.part
    list = list.filter((_, i) => i % of === k)
  }
  cache.set(key, list)
  return list
}

export const poolSize = (def: LevelDef) => items(def).length

/**
 * The word for a player's nth attempt at a level. Every player walks their own shuffled
 * order of the level's pool, so two people at the same level almost never share a word,
 * and nobody sees a word twice until they've been through the whole pool.
 */
export function levelGame(def: LevelDef, attempt: number, playerId: string, difficulty: Difficulty = 'scholar'): Game {
  const rule = registry.get(def.ruleId)!
  const pool = items(def)
  let k = attempt
  let item = nthOfPermutation(pool, `journey:${def.n}:${playerId}`, k)
  // Never the word used in the rule's worked example.
  while (item.entry.word === rule.presentation.example.word && pool.length > 1) item = nthOfPermutation(pool, `journey:${def.n}:${playerId}`, ++k + pool.length)

  const id = levelPuzzleId(def.n, attempt, difficulty)
  const puzzle: Puzzle = {
    id,
    number: def.n,
    date: currentSlot().slice(0, 10),
    slot: currentSlot(),
    ruleId: rule.id,
    ruleVersion: rule.version,
    seed: hashString(`journey:${def.n}:${attempt}:${playerId}`),
    answer: item.entry,
    meta: item.meta ?? {},
    // Journey games never touch the daily-drop stats.
    preview: true,
  }
  return createGame(rule, puzzle, defaultDictionary(), { adjust: levelSetup(def) })
}
