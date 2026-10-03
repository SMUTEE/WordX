import type { Capability, GameRule } from './types'

const HOOKS: Record<Capability, keyof GameRule> = {
  answer: 'pickAnswer',
  setup: 'setup',
  vocabulary: 'inVocabulary',
  validation: 'validateGuess',
  scoring: 'scoreGuess',
  keyboard: 'keyStates',
  locks: 'dynamicLocks',
}

/** Throws if a rule implements a hook it didn't declare, or declares one it doesn't implement. */
export function assertCapabilities(rule: GameRule) {
  for (const [cap, hook] of Object.entries(HOOKS) as [Capability, keyof GameRule][]) {
    const declared = rule.capabilities.includes(cap)
    const implemented = typeof rule[hook] === 'function'
    if (declared !== implemented) {
      throw new Error(`Rule "${rule.id}" ${declared ? 'declares' : 'implements'} "${cap}" but ${declared ? "doesn't implement" : "doesn't declare"} it`)
    }
  }
}

export interface RuleRegistry {
  get(id: string): GameRule | undefined
  all(): GameRule[]
}

export function createRegistry(rules: GameRule[]): RuleRegistry {
  const map = new Map<string, GameRule>()
  for (const rule of rules) {
    if (map.has(rule.id)) throw new Error(`Duplicate rule id "${rule.id}"`)
    assertCapabilities(rule)
    map.set(rule.id, rule)
  }
  return { get: (id) => map.get(id), all: () => [...map.values()] }
}
