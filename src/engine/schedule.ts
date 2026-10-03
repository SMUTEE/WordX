import { COMMON_ANSWERS } from '../data/words'
import { hashString, nthOfPermutation, saltedKey } from './random'
import type { RuleRegistry } from './registry'
import type { Dictionary, Puzzle } from './types'

export interface ScheduleConfig {
  epoch: string
  /** Rules cycle through this list one drop at a time. */
  rotation: string[]
  /** Keyed by drop, e.g. "2026-10-03T06". */
  overrides: Record<string, { rule: string }>
  flags: Record<string, boolean>
}

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS
/** One new puzzle a day, at midnight UTC. (The drop length is one constant if that ever changes.) */
export const DROP_HOURS = 24
const DROP_MS = DROP_HOURS * HOUR_MS
export const DROPS_PER_DAY = 24 / DROP_HOURS

export function dayNumber(date: string, epoch: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${epoch}T00:00:00Z`)) / DAY_MS)
}

export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10)
}

const slotMs = (slot: string) => Date.parse(`${slot}:00:00Z`)
const slotFromMs = (ms: number) => new Date(Math.floor(ms / DROP_MS) * DROP_MS).toISOString().slice(0, 13)

/** The drop a moment falls in, as "YYYY-MM-DDTHH" (UTC). One global puzzle per drop. */
export function currentSlot(now: number = Date.now()): string {
  return slotFromMs(now)
}

/** Accepts "YYYY-MM-DD" (first drop of the day) or "YYYY-MM-DDTHH" (snapped to its drop). */
export function normalizeSlot(input: string): string {
  const ms = Date.parse(input.length <= 10 ? `${input}T00:00:00Z` : `${input.slice(0, 13)}:00:00Z`)
  if (Number.isNaN(ms)) throw new ScheduleError(`Bad drop "${input}"`)
  return slotFromMs(ms)
}

export function slotNumber(slot: string, epoch: string): number {
  return Math.round((slotMs(slot) - Date.parse(`${epoch}T00:00:00Z`)) / DROP_MS)
}

export function addSlots(slot: string, n: number): string {
  return slotFromMs(slotMs(slot) + n * DROP_MS)
}

export const slotStart = (slot: string) => new Date(slotMs(slot))

export function msUntilNextDrop(now: number = Date.now()): number {
  return DROP_MS - (now % DROP_MS)
}

export class ScheduleError extends Error {}

export function ruleIdForSlot(slot: string, schedule: ScheduleConfig, registry: RuleRegistry): string {
  const n = slotNumber(slot, schedule.epoch)
  const len = schedule.rotation.length
  const candidate = schedule.overrides[slot]?.rule ?? schedule.rotation[((n % len) + len) % len]
  // A rule switched off by flag falls back to the control rule rather than breaking the drop.
  const id = schedule.flags[candidate] === false ? 'standard' : candidate
  if (!registry.get(id)) throw new ScheduleError(`No rule registered for "${id}" at ${slot}`)
  return id
}

/** How many earlier drops (since epoch) used this rule. */
export function occurrenceOf(ruleId: string, slot: string, schedule: ScheduleConfig, registry: RuleRegistry): number {
  const total = slotNumber(slot, schedule.epoch)
  const start = `${schedule.epoch}T00`
  let count = 0
  for (let i = 0; i < total; i++) {
    if (ruleIdForSlot(addSlots(start, i), schedule, registry) === ruleId) count++
  }
  return count
}

export interface ResolveOptions {
  slot: string
  schedule: ScheduleConfig
  registry: RuleRegistry
  dictionary: Dictionary
  /** Play a specific rule in this drop (practice — not counted in stats). */
  forceRuleId?: string
  /** A private variant of the puzzle with its own answer, e.g. a friends game. */
  variant?: string
  /** Server-only secret for live drops: without it, nobody can compute the answer. */
  salt?: string
}

/** drop + rule + version → the same puzzle, every time, on every device. */
export function resolvePuzzle({ slot, schedule, registry, dictionary, forceRuleId, variant, salt }: ResolveOptions): Puzzle {
  const scheduledId = ruleIdForSlot(slot, schedule, registry)
  const ruleId = forceRuleId ?? scheduledId
  const rule = registry.get(ruleId)
  if (!rule) throw new ScheduleError(`Unknown rule "${ruleId}"`)

  const key = `${variant ? `v:${variant}` : slot}|${rule.id}@${rule.version}`
  const seed = hashString(saltedKey(key, salt))
  const occurrence = variant
    ? hashString(variant) % 100_000
    : forceRuleId && forceRuleId !== scheduledId
      ? slotNumber(slot, schedule.epoch)
      : occurrenceOf(rule.id, slot, schedule, registry)
  const date = slot.slice(0, 10)

  const pick = (n: number): { entry: Puzzle['answer']; meta?: Puzzle['meta'] } =>
    rule.pickAnswer
      ? rule.pickAnswer({ date, seed, occurrence: n, dictionary, salt })
      : { entry: nthOfPermutation(COMMON_ANSWERS, saltedKey(`common:${rule.id}`, salt), n) }
  // The intro's worked example must never be the real answer.
  let picked = pick(occurrence)
  for (let skip = 1; picked.entry.word === rule.presentation.example.word && skip < 10; skip++) picked = pick(occurrence + skip * 997)

  return {
    id: key,
    number: slotNumber(slot, schedule.epoch) + 1,
    date,
    slot,
    ruleId: rule.id,
    ruleVersion: rule.version,
    seed,
    answer: picked.entry,
    meta: picked.meta ?? {},
    preview: !!variant || ruleId !== scheduledId,
  }
}
