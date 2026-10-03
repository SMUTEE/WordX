import { beforeEach, describe, expect, it } from 'vitest'
import { recordActivity, streakSummary } from './storage'

beforeEach(() => {
  const store = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
})

describe('streaks', () => {
  it('counts consecutive days with any finished game', () => {
    for (const d of ['2026-10-01', '2026-10-02', '2026-10-03']) recordActivity(false, d)
    const s = streakSummary('2026-10-03')
    expect(s.current).toBe(3)
    expect(s.playedToday).toBe(true)
    expect(s.week.filter((d) => d.played)).toHaveLength(3)
  })

  it('stays alive until the end of today, then breaks', () => {
    recordActivity(true, '2026-10-02')
    expect(streakSummary('2026-10-03').current).toBe(1)
    expect(streakSummary('2026-10-04').current).toBe(0)
  })

  it('remembers the best run', () => {
    for (const d of ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-10-03']) recordActivity(true, d)
    const s = streakSummary('2026-10-03')
    expect(s.current).toBe(1)
    expect(s.best).toBe(4)
    expect(s.totalWon).toBe(5)
  })
})
