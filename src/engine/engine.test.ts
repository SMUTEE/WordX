import { describe, expect, it } from 'vitest'
import schedule from '../data/schedule.json'
import { registry } from '../rules'
import { uniqueAnagramAnswers } from '../rules/anagram'
import { categoryPool } from '../rules/category'
import { burnedLetters } from '../rules/decay'
import { bandFor, temperature } from '../rules/fog'
import { createDictionary, defaultDictionary } from './dictionary'
import { createGame } from './engine'
import { createRegistry } from './registry'
import { addSlots, currentSlot, msUntilNextDrop, normalizeSlot, resolvePuzzle, ruleIdForSlot, type ScheduleConfig } from './schedule'
import { scoreMarks } from './scoring'
import type { GameRule, Puzzle } from './types'

const dictionary = defaultDictionary()
const config = schedule as ScheduleConfig

function puzzleFor(ruleId: string, word: string, extra: Partial<Puzzle> = {}): Puzzle {
  return { id: `t|${ruleId}`, number: 1, date: '2026-10-03', slot: '2026-10-03T00', ruleId, ruleVersion: 1, seed: 42, answer: { word }, meta: {}, preview: false, ...extra }
}

function play(ruleId: string, answer: string, words: string[], extra: Partial<Puzzle> = {}) {
  const game = createGame(registry.get(ruleId)!, puzzleFor(ruleId, answer, extra), dictionary)
  let state = game.newState(0)
  const results = words.map((w) => {
    const r = game.submit(state, w, 1)
    state = r.state
    return r
  })
  return { game, state, results }
}

describe('scoring', () => {
  it('handles duplicate letters', () => {
    expect(scoreMarks('ALLEY', 'APPLE')).toEqual(['correct', 'present', 'absent', 'present', 'absent'])
    expect(scoreMarks('EERIE', 'THEME')).toEqual(['present', 'absent', 'absent', 'absent', 'correct'])
  })
})

describe('engine', () => {
  it('never consumes an attempt for an invalid guess', () => {
    const { state, results } = play('standard', 'CRANE', ['ZZZZZ', 'CRA', 'SLATE'])
    expect(results[0].accepted).toBe(false)
    expect(results[1].accepted).toBe(false)
    expect(state.guesses).toHaveLength(1)
  })

  it('wins on the answer and loses after max guesses', () => {
    expect(play('standard', 'CRANE', ['SLATE', 'CRANE']).state.status).toBe('won')
    const lost = play('standard', 'CRANE', ['SLATE', 'MOUND', 'BLIMP', 'FIGHT', 'WORDY', 'QUICK'])
    expect(lost.state.status).toBe('lost')
  })

  it('refuses repeats', () => {
    const { results } = play('standard', 'CRANE', ['SLATE', 'SLATE'])
    expect(results[1].accepted).toBe(false)
  })
})

describe('schedule', () => {
  it('is deterministic for a drop', () => {
    const a = resolvePuzzle({ slot: '2026-10-05T12', schedule: config, registry, dictionary })
    const b = resolvePuzzle({ slot: '2026-10-05T12', schedule: config, registry, dictionary })
    expect(a).toEqual(b)
  })

  it('drops every six hours, each with a different rule', () => {
    expect(currentSlot(Date.parse('2026-10-03T13:45:00Z'))).toBe('2026-10-03T12')
    expect(normalizeSlot('2026-10-03')).toBe('2026-10-03T00')
    expect(msUntilNextDrop(Date.parse('2026-10-03T13:45:00Z'))).toBe(4.25 * 3_600_000)
    const day = [0, 1, 2, 3].map((i) => ruleIdForSlot(addSlots('2026-10-06T00', i), config, registry))
    expect(new Set(day).size).toBe(4)
  })

  it('never schedules a flagged-off rule', () => {
    const cfg: ScheduleConfig = { ...config, overrides: { '2026-10-04T06': { rule: 'liar' } } }
    expect(ruleIdForSlot('2026-10-04T06', cfg, registry)).toBe('standard')
  })

  it('does not repeat an answer within a rule for a long stretch', () => {
    const seen = new Map<string, string>()
    for (let i = 0; i < 400; i++) {
      const p = resolvePuzzle({ slot: addSlots('2026-01-01T00', i), schedule: { ...config, overrides: {} }, registry, dictionary })
      if (p.ruleId !== 'standard') continue
      expect(seen.has(p.answer.word)).toBe(false)
      seen.set(p.answer.word, p.date)
    }
  })

  it('never picks the intro example as the answer', () => {
    for (let i = 0; i < 120; i++) {
      for (const rule of registry.all()) {
        const p = resolvePuzzle({ slot: addSlots('2026-06-01T00', i), schedule: config, registry, dictionary, forceRuleId: rule.id })
        expect(p.answer.word).not.toBe(rule.presentation.example.word)
      }
    }
  })

  it('resolves every rule to a puzzle', () => {
    for (const rule of registry.all()) {
      const p = resolvePuzzle({ slot: '2026-10-03T06', schedule: config, registry, dictionary, forceRuleId: rule.id })
      expect(p.answer.word).toMatch(/^[A-Z]{5}$/)
      const game = createGame(rule, p, dictionary)
      expect(game.validate(p.answer.word, game.newState())).toEqual({ ok: true })
    }
  })
})

describe('rules', () => {
  it('anagram: only today’s letters, any order, one true answer', () => {
    const uniques = uniqueAnagramAnswers(dictionary)
    expect(uniques.length).toBeGreaterThan(20)
    const answer = uniques[0].word
    const reversed = [...answer].reverse().join('')
    const { results } = play('anagram', answer, ['ZZZZZ', reversed === answer ? answer : reversed])
    expect(results[0].accepted).toBe(false)
    expect(results[1].accepted).toBe(true)
  })

  it('decay: burns misses and keeps hits', () => {
    const { game, state, results } = play('decay', 'TRAIN', ['STARE', 'SHAWL'])
    expect([...burnedLetters(state)].sort()).toEqual(['E', 'S'])
    expect(results[1].accepted).toBe(false)
    if (!results[1].accepted) expect(results[1].error.code).toBe('burned')
    expect(game.keyStates(state).S).toBe('burned')
  })

  it('fog: temperature rises as you get closer', () => {
    expect(temperature('CRANE', 'CRANE')).toBe(1)
    expect(temperature('CRANK', 'CRANE')).toBeGreaterThan(temperature('CLOUD', 'CRANE'))
    expect(bandFor(0.1)).toBe('freezing')
    const { results } = play('fog', 'CRANE', ['CRANK'])
    expect(results[0].accepted && results[0].guess.feedback.kind).toBe('meter')
  })

  it('vowel: vowels locked, strays refused', () => {
    const rule = registry.get('vowel')!
    const p = puzzleFor('vowel', 'BAKER')
    const game = createGame(rule, p, dictionary)
    expect(game.setup.locked).toEqual({ 1: 'A', 3: 'E' })
    expect(game.validate('TAMED', game.newState()).ok).toBe(true)
    expect(game.validate('OAKEN', game.newState()).ok).toBe(false)
  })

  it('category: theme words are guessable', () => {
    const { results } = play('category', 'NNEWI', ['NNEWI'], { meta: { categoryId: 'ng-places' } })
    expect(results[0].accepted).toBe(true)
  })

  it('category: 1000+ answers, none repeated, no theme twice in a row', () => {
    const pool = categoryPool()
    expect(pool.length).toBeGreaterThan(1000)
    expect(new Set(pool.map((x) => x.entry.word)).size).toBe(pool.length)
    expect(pool.every((x) => /^[A-Z]{5}$/.test(x.entry.word))).toBe(true)
    pool.slice(1).forEach((x, i) => expect(x.categoryId).not.toBe(pool[i].categoryId))
  })

  it('category: a year of drops never repeats an answer', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 365 * 4; i++) {
      const p = resolvePuzzle({ slot: addSlots('2026-01-01T00', i), schedule: { ...config, overrides: {} }, registry, dictionary })
      if (p.ruleId !== 'category') continue
      expect(seen.has(p.answer.word)).toBe(false)
      seen.add(p.answer.word)
    }
    expect(seen.size).toBeGreaterThan(200)
  })

  it('relay variants get their own answer and never count', () => {
    const daily = resolvePuzzle({ slot: '2026-10-03T06', schedule: config, registry, dictionary, forceRuleId: 'standard' })
    const relay = resolvePuzzle({ slot: '2026-10-03T06', schedule: config, registry, dictionary, forceRuleId: 'standard', variant: 'abc123' })
    expect(relay.id).not.toBe(daily.id)
    expect(relay.preview).toBe(true)
  })

  it('liar: exactly one tile lies, the same way every reload', () => {
    const a = play('liar', 'CRANE', ['SLATE']).results[0]
    const b = play('liar', 'CRANE', ['SLATE']).results[0]
    expect(a).toEqual(b)
    if (!a.accepted || a.guess.feedback.kind !== 'tiles') throw new Error('expected tiles')
    const truth = scoreMarks('SLATE', 'CRANE')
    expect(a.guess.feedback.marks.filter((m, i) => m !== truth[i])).toHaveLength(1)
  })
})

describe('architecture', () => {
  it('a new rule needs only a module — no engine changes', () => {
    const palindrome: GameRule = {
      id: 'palindrome',
      version: 1,
      capabilities: ['answer', 'validation'],
      presentation: { ...registry.get('standard')!.presentation, name: 'Palindrome' },
      pickAnswer: () => ({ entry: { word: 'LEVEL' } }),
      validateGuess: (w) => (w === [...w].reverse().join('') ? { ok: true } : { ok: false, code: 'pal', message: 'Palindromes only' }),
    }
    const reg = createRegistry([...registry.all(), palindrome])
    const p = resolvePuzzle({ slot: '2026-10-03T00', schedule: config, registry: reg, dictionary: createDictionary([...dictionary.words, 'KAYAK']), forceRuleId: 'palindrome' })
    const game = createGame(palindrome, p, createDictionary([...dictionary.words, 'KAYAK']))
    expect(game.submit(game.newState(), 'CRANE').accepted).toBe(false)
    expect(game.submit(game.newState(), 'KAYAK').accepted).toBe(true)
    expect(game.submit(game.newState(), 'LEVEL').state.status).toBe('won')
  })

  it('rejects rules whose capabilities don’t match their hooks', () => {
    const bad = { ...registry.get('standard')!, id: 'bad', scoreGuess: () => ({ kind: 'tiles' as const, marks: [] }) }
    expect(() => createRegistry([bad])).toThrow(/declare/)
  })
})
