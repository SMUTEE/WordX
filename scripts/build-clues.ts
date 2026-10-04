/**
 * Builds Easy-mode clues for every Journey word: src/data/clues.generated.ts.
 *   npx tsx scripts/build-clues.ts
 * In order of preference:
 *   1. The word's meaning from WordNet (MIT), skipping senses that give the word away.
 *   2. For forms WordNet doesn't list (PLANS, BAKED, TALLER), the base word's meaning with a lead-in.
 *   3. Otherwise a word-shape clue from our own list: "First letter S, ends like RAIN".
 * Naija words keep their own meanings.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { POOLS } from '../src/data/pools.generated'
import { NAIJA_WORDS } from '../src/data/words'
import { categoryPool } from '../src/rules/category'

const require = createRequire(import.meta.url)
const DICT: string = require('wordnet-db').path
const ROOT = resolve(import.meta.dirname, '..')

type Pos = 'noun' | 'verb' | 'adj' | 'adv'
const POS: Pos[] = ['noun', 'verb', 'adj', 'adv']

// lemma -> synset offsets (most frequent sense first), per part of speech.
const index = new Map<Pos, Map<string, string[]>>()
const data = new Map<Pos, string>()
for (const pos of POS) {
  const m = new Map<string, string[]>()
  for (const line of readFileSync(join(DICT, `index.${pos}`), 'utf8').split('\n')) {
    if (!line || line.startsWith(' ')) continue
    const f = line.trim().split(' ')
    const synsetCount = Number(f[2])
    m.set(f[0], f.slice(f.length - synsetCount))
  }
  index.set(pos, m)
  data.set(pos, readFileSync(join(DICT, `data.${pos}`), 'utf8'))
}

function line(pos: Pos, offset: string): string {
  const text = data.get(pos)!
  const at = text.indexOf(`\n${offset} `)
  return text.slice(at + 1, text.indexOf('\n', at + 1))
}

/** The definition part of a synset's gloss (before any example sentences), without a "(domain)" tag. */
function gloss(pos: Pos, offset: string): string {
  const l = line(pos, offset)
  const g = l.slice(l.indexOf('| ') + 2)
  return g.split(/;\s*"/)[0].split('; ')[0].replace(/^\([^)]*\)\s*/, '').trim()
}

/** A sense named after a person or place: the synset spells the word with a capital. */
function properName(pos: Pos, offset: string, lemma: string): boolean {
  const f = line(pos, offset).split(' ')
  const count = parseInt(f[3], 16)
  for (let i = 0; i < count; i++) {
    const word = f[4 + i * 2]
    if (word.toLowerCase() === lemma && word !== word.toLowerCase()) return true
  }
  return false
}

// Senses per lemma, most used in real text first (SemCor tag counts), then WordNet's own order.
const SS: Record<string, Pos> = { '1': 'noun', '2': 'verb', '3': 'adj', '4': 'adv', '5': 'adj' }
const senses = new Map<string, { pos: Pos; offset: string; n: number; tags: number }[]>()
for (const l of readFileSync(join(DICT, 'index.sense'), 'utf8').split('\n')) {
  if (!l) continue
  const [key, offset, n, tags] = l.split(' ')
  const lemma = key.slice(0, key.indexOf('%'))
  const pos = SS[key[key.indexOf('%') + 1]]
  if (!senses.has(lemma)) senses.set(lemma, [])
  senses.get(lemma)!.push({ pos, offset, n: Number(n), tags: Number(tags) })
}
for (const list of senses.values()) list.sort((a, b) => b.tags - a.tags || a.n - b.n)

const forms = (w: string) => [w, `${w}s`, `${w}es`, `${w}ed`, `${w}d`, `${w}ing`, `${w}er`, `${w}est`, `${w}ly`, w.replace(/e$/, 'ing'), w.replace(/y$/, 'ies'), w.replace(/y$/, 'ied')]

/** A sense's meaning, if it doesn't contain the word (or its base) and is short enough to read. */
function meaning(lemma: string, avoid: string[]): { pos: Pos; text: string } | null {
  const banned = new Set(avoid.flatMap(forms))
  for (const { pos, offset } of (senses.get(lemma) ?? []).slice(0, 6)) {
    if (properName(pos, offset, lemma)) continue
    const text = gloss(pos, offset)
    const words = text.toLowerCase().match(/[a-z]+/g) ?? []
    if (words.some((x) => banned.has(x) || avoid.some((a) => a.length >= 4 && x.startsWith(a)))) continue
    // Not even inside a longer word (PORT in "seaport").
    if (avoid.some((x) => text.toLowerCase().includes(x))) continue
    if (words.length < 2 || text.length > 110) continue
    return { pos, text }
  }
  return null
}

/** WordNet's detachment rules: candidate base forms for an inflected word, with a lead-in. */
const RULES: [suffix: string, replace: string, pos: Pos, lead: string][] = [
  ['ies', 'y', 'noun', 'More than one'], ['ses', 's', 'noun', 'More than one'], ['xes', 'x', 'noun', 'More than one'],
  ['ches', 'ch', 'noun', 'More than one'], ['shes', 'sh', 'noun', 'More than one'], ['men', 'man', 'noun', 'More than one'],
  ['s', '', 'noun', 'More than one'],
  ['ies', 'y', 'verb', 'Does this'], ['es', 'e', 'verb', 'Does this'], ['es', '', 'verb', 'Does this'], ['s', '', 'verb', 'Does this'],
  ['ied', 'y', 'verb', 'Did this'], ['ed', 'e', 'verb', 'Did this'], ['ed', '', 'verb', 'Did this'],
  ['ing', 'e', 'verb', 'Doing this'], ['ing', '', 'verb', 'Doing this'],
  ['er', '', 'adj', 'More so'], ['er', 'e', 'adj', 'More so'], ['ier', 'y', 'adj', 'More so'],
  ['est', '', 'adj', 'Most so'], ['est', 'e', 'adj', 'Most so'], ['iest', 'y', 'adj', 'Most so'],
]

function inflected(w: string): string | null {
  for (const [suf, rep, pos, lead] of RULES) {
    if (!w.endsWith(suf) || w.length - suf.length < 2) continue
    let base = w.slice(0, -suf.length) + rep
    // Doubled consonants: STOPPED -> STOP, BIGGER -> BIG.
    if (!index.get(pos)!.has(base) && /([b-df-hj-np-tv-z])\1$/.test(base)) base = base.slice(0, -1)
    if (!index.get(pos)!.has(base)) continue
    for (const { pos: p, offset } of (senses.get(base) ?? []).filter((x) => x.pos === pos).slice(0, 3)) {
      if (properName(p, offset, base)) continue
      const text = gloss(p, offset)
      const words = text.toLowerCase().match(/[a-z]+/g) ?? []
      if (words.some((x) => x.startsWith(base.slice(0, Math.max(3, base.length - 1))) || x === w)) continue
      if (text.length > 100 || text.toLowerCase().includes(base) || text.toLowerCase().includes(w)) continue
      return `${lead}: ${text}`
    }
  }
  return null
}

// Everyday words to point at in shape clues.
const EVERYDAY = [...new Set([POOLS.four_easy, POOLS.five_easy, POOLS.five_common, POOLS.six_common].flatMap((p) => p.split(' ')))]
const VOWELS = /[aeiou]/g

function shape(w: string): string {
  const like = EVERYDAY.find((x) => x !== w && x.length === w.length && x.slice(-3) === w.slice(-3) && x[0] !== w[0])
  if (like) return `First letter ${w[0].toUpperCase()}, ends like ${like.toUpperCase()}`
  const v = (w.match(VOWELS) ?? []).length
  return `First letter ${w[0].toUpperCase()}, last letter ${w.at(-1)!.toUpperCase()}, ${v} vowel${v === 1 ? '' : 's'}`
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

const words = new Set<string>()
for (const p of Object.values(POOLS)) for (const w of p.split(' ')) words.add(w.toLowerCase())
for (const x of categoryPool()) words.add(x.entry.word.toLowerCase())

const clues: Record<string, string> = {}
const tally = { meaning: 0, inflected: 0, shape: 0, naija: 0 }
for (const w of [...words].sort()) {
  const m = meaning(w, [w])
  if (m) {
    clues[w.toUpperCase()] = cap(m.text)
    tally.meaning++
    continue
  }
  const inf = inflected(w)
  if (inf) {
    clues[w.toUpperCase()] = inf
    tally.inflected++
    continue
  }
  clues[w.toUpperCase()] = shape(w)
  tally.shape++
}
for (const e of NAIJA_WORDS) {
  if (!e.gloss) continue
  // Some meanings quote the word in use ("Abeg, help me"): blank it out so the clue doesn't give it away.
  clues[e.word] = cap(e.gloss.replace(new RegExp(e.word, 'gi'), '___'))
  tally.naija++
}

const out = join(ROOT, 'src/data/clues.generated.ts')
writeFileSync(
  out,
  `// Generated by scripts/build-clues.ts — do not edit by hand.\n// Easy-mode clues for Journey words. Meanings from WordNet 3.1 (Princeton University, WordNet licence).\nexport const CLUES: Record<string, string> = ${JSON.stringify(clues)}\n`,
)
console.log(`${Object.keys(clues).length} clues`, tally, '->', out)
for (const w of ['BLAST', 'CRANE', 'ABOUT', 'PAINT', 'AGENT', 'ADULT', 'CORAL', 'OKADA', 'ZIPPY', 'HOUSE', 'TABLE', 'WATER', 'BOOKS', 'TRIED', 'LARGER', 'GHOST']) console.log(w.padEnd(8), clues[w])
