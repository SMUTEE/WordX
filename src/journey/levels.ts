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
 * The Journey: ten levels, each turning several difficulty dials at once —
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

/** Four stages of five levels. Difficulty climbs inside each stage and across them. */
export const STAGES = [
  { id: 'basics', name: 'Basics', from: 1, to: 5, blurb: 'Learn the rules', bg: '#FFD21F', ink: 'dark' as const },
  { id: 'twists', name: 'Twists', from: 6, to: 10, blurb: 'Rules that change the game', bg: '#FF8FD0', ink: 'dark' as const },
  { id: 'pressure', name: 'Pressure', from: 11, to: 15, blurb: 'Fewer tries, fewer hints', bg: '#2E5BFF', ink: 'light' as const },
  { id: 'mastery', name: 'Mastery', from: 16, to: 20, blurb: 'No hints. Rare words.', bg: '#111111', ink: 'light' as const },
]

export const stageOf = (n: number) => STAGES.find((s) => n >= s.from && n <= s.to)!

export const LEVELS: LevelDef[] = [
  // Basics: everyday words, generous tries, two hints.
  { n: 1, title: 'Warm-up', ruleId: 'standard', pool: 'four_easy', words: 'Everyday 4-letter words', maxGuesses: 7, maxHints: 2 },
  { n: 2, title: 'Five', ruleId: 'standard', pool: 'five_easy', words: 'Very common words', maxGuesses: 6, maxHints: 2 },
  { n: 3, title: 'Themed', ruleId: 'category', pool: 'category', part: [0, 2], words: 'A word from a theme', maxGuesses: 6, maxHints: 2 },
  { n: 4, title: 'Given vowels', ruleId: 'vowel', pool: 'five_vowel', part: [0, 2], words: 'Common words', maxGuesses: 6, maxHints: 2 },
  { n: 5, title: 'Naija', ruleId: 'naija', pool: 'naija', words: 'Pidgin and Yoruba', maxGuesses: 6, maxHints: 2 },
  // Twists: the rules start to bite.
  { n: 6, title: 'Quick four', ruleId: 'standard', pool: 'four_medium', words: 'Less common 4-letter words', maxGuesses: 6, maxHints: 1 },
  { n: 7, title: 'Scrambled', ruleId: 'anagram', pool: 'five_anagram', part: [0, 2], words: 'Common words, jumbled', maxGuesses: 6, maxHints: 1 },
  { n: 8, title: 'Burnout', ruleId: 'decay', pool: 'five_common', part: [0, 2], words: 'Common words', maxGuesses: 6, maxHints: 1 },
  { n: 9, title: 'Whiteout', ruleId: 'fog', pool: 'five_common', part: [1, 2], words: 'Common words', maxGuesses: 8, maxHints: 1 },
  { n: 10, title: 'Lookalikes', ruleId: 'standard', pool: 'five_trap', words: 'Words with many near twins', maxGuesses: 6, maxHints: 1 },
  // Pressure: fewer tries, longer words.
  { n: 11, title: 'Long', ruleId: 'standard', pool: 'six_common', part: [0, 2], words: 'Common 6-letter words', maxGuesses: 6, maxHints: 1 },
  { n: 12, title: 'Tight theme', ruleId: 'category', pool: 'category', part: [1, 2], words: 'A word from a theme', maxGuesses: 5, maxHints: 1 },
  { n: 13, title: 'Short fuse', ruleId: 'standard', pool: 'five_medium', part: [0, 3], words: 'Less common words', maxGuesses: 5, maxHints: 1 },
  { n: 14, title: 'Vowels, harder', ruleId: 'vowel', pool: 'five_vowel', part: [1, 2], words: 'Common words', maxGuesses: 5, maxHints: 0 },
  { n: 15, title: 'Scrambled, harder', ruleId: 'anagram', pool: 'five_anagram', part: [1, 2], words: 'Less common words, jumbled', maxGuesses: 5, maxHints: 0 },
  // Mastery: rare words, no hints.
  { n: 16, title: 'Burnout, harder', ruleId: 'decay', pool: 'five_medium', part: [1, 3], words: 'Less common words', maxGuesses: 6, maxHints: 0 },
  { n: 17, title: 'Deep fog', ruleId: 'fog', pool: 'six_common', part: [1, 2], words: 'Common 6-letter words', maxGuesses: 8, maxHints: 0 },
  { n: 18, title: 'Rare letters', ruleId: 'standard', pool: 'five_hard', words: 'Rare letters, repeats, few vowels', maxGuesses: 6, maxHints: 0 },
  { n: 19, title: 'Long and rare', ruleId: 'standard', pool: 'six_medium', words: 'Less common 6-letter words', maxGuesses: 6, maxHints: 0 },
  { n: 20, title: 'Liar', ruleId: 'liar', pool: 'five_medium', part: [2, 3], words: 'Less common words', maxGuesses: 7, maxHints: 0 },
]

export const LEVEL_COUNT = LEVELS.length

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
export function levelGame(def: LevelDef, attempt: number, playerId: string): Game {
  const rule = registry.get(def.ruleId)!
  const pool = items(def)
  let k = attempt
  let item = nthOfPermutation(pool, `journey:${def.n}:${playerId}`, k)
  // Never the word used in the rule's worked example.
  while (item.entry.word === rule.presentation.example.word && pool.length > 1) item = nthOfPermutation(pool, `journey:${def.n}:${playerId}`, ++k + pool.length)

  const id = `journey:${def.n}:${attempt}`
  const puzzle: Puzzle = {
    id,
    number: def.n,
    date: currentSlot().slice(0, 10),
    slot: currentSlot(),
    ruleId: rule.id,
    ruleVersion: rule.version,
    seed: hashString(`${id}:${playerId}`),
    answer: item.entry,
    meta: item.meta ?? {},
    // Journey games never touch the daily-drop stats.
    preview: true,
  }
  return createGame(rule, puzzle, defaultDictionary(), { adjust: { maxGuesses: def.maxGuesses, maxHints: def.maxHints } })
}
