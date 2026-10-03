import { DICTIONARY_WORDS } from '../data/dictionary.generated'
import { COMMON_ANSWERS } from '../data/words'
import type { Dictionary } from './types'

export function createDictionary(words: Iterable<string>): Dictionary {
  const set = new Set(words)
  const list = [...set]
  return { has: (w) => set.has(w), words: list }
}

let cached: Dictionary | undefined

/**
 * English 5-letter words plus the common answers. Theme and Naija words are added only on
 * their own days, through each rule's vocabulary.
 */
export function defaultDictionary(): Dictionary {
  cached ??= createDictionary([
    ...DICTIONARY_WORDS.split(' '),
    ...COMMON_ANSWERS.map((e) => e.word),
  ])
  return cached
}
