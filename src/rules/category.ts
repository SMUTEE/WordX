import { CATEGORIES, type Category } from '../data/categories'
import type { WordEntry } from '../data/words'
import { hashString, shuffled } from '../engine/random'
import type { GameRule } from '../engine/types'

export interface PoolItem {
  categoryId: string
  entry: WordEntry
}

let cachedPool: PoolItem[] | undefined

/**
 * Every theme word in one shuffled queue. A word appears once (first theme wins), and the
 * order is spread so the same theme never comes up twice in a row. Category days walk this
 * queue, so nothing repeats until the whole pool has been played.
 */
export function categoryPool(): PoolItem[] {
  if (cachedPool) return cachedPool
  const seen = new Set<string>()
  const items: PoolItem[] = []
  for (const c of CATEGORIES) {
    for (const entry of c.words) {
      if (seen.has(entry.word)) continue
      seen.add(entry.word)
      items.push({ categoryId: c.id, entry })
    }
  }
  const remaining = shuffled(items, hashString('category-pool@1'))
  const out: PoolItem[] = []
  while (remaining.length) {
    const last = out[out.length - 1]?.categoryId
    const i = Math.max(0, remaining.findIndex((x) => x.categoryId !== last))
    out.push(remaining.splice(i, 1)[0])
  }
  cachedPool = out
  return out
}

const categoryOf = (id: string | number | undefined): Category | undefined => CATEGORIES.find((c) => c.id === id)

export const category: GameRule = {
  id: 'category',
  version: 2,
  capabilities: ['answer', 'setup', 'vocabulary'],
  presentation: {
    legend: [{ swatch: 'correct', label: 'Right spot' }, { swatch: 'present', label: 'Wrong spot' }, { swatch: 'absent', label: 'Not in word' }],
    name: 'Category',
    tagline: 'The answer comes from one theme.',
    instructions: [
      'Today’s theme is shown above the board.',
      'Any English word still counts as a guess.',
      'Colours work like Classic.',
    ],
    example: {
      word: 'BENIN',
      feedback: { kind: 'tiles', marks: ['absent', 'present', 'absent', 'absent', 'present'] },
      caption: 'Theme words like city names are accepted too.',
    },
    theme: { bg: '#FF8FD0', ink: 'dark' },
    motion: 'stamp',
  },

  pickAnswer({ occurrence }) {
    const pool = categoryPool()
    const item = pool[((occurrence % pool.length) + pool.length) % pool.length]
    return { entry: item.entry, meta: { categoryId: item.categoryId } }
  },

  setup(puzzle) {
    const cat = categoryOf(puzzle.meta.categoryId) ?? CATEGORIES[0]
    return { hint: { kind: 'category', label: cat.label, prompt: 'Today’s theme' } }
  },

  inVocabulary(word, { dictionary, puzzle }) {
    return dictionary.has(word) || !!categoryOf(puzzle.meta.categoryId)?.words.some((e) => e.word === word)
  },
}
