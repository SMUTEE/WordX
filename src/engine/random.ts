/** FNV-1a 32-bit hash. Used to turn "date|rule@version" into a seed. */
export function hashString(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Mulberry32: small, fast, deterministic. */
export function createRng(seed: number) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int: (maxExclusive: number) => Math.floor(next() * maxExclusive),
  }
}

export function shuffled<T>(items: readonly T[], seed: number): T[] {
  const rng = createRng(seed)
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Picks the nth item of a seeded permutation, so consecutive occurrences never repeat
 * until the pool is exhausted.
 */
export function nthOfPermutation<T>(items: readonly T[], poolKey: string, n: number): T {
  const cycle = Math.floor(n / items.length)
  const order = shuffled(items, hashString(`${poolKey}#${cycle}`))
  return order[n % items.length]
}
