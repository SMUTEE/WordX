import { createRegistry } from '../engine/registry'
import { anagram } from './anagram'
import { category } from './category'
import { decay } from './decay'
import { fog } from './fog'
import { liar } from './liar'
import { naija } from './naija'
import { standard } from './standard'
import { vowel } from './vowel'

/** Adding a rule: write a module, register it here, add it to the schedule. Nothing else. */
export const registry = createRegistry([standard, category, anagram, decay, fog, vowel, naija, liar])
