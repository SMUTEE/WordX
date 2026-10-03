import type { AnimationOptions, DOMKeyframesDefinition } from 'motion/react'
import type { Mark, MotionPresetId } from '../../engine/types'
import { INK, MARK_BG, PAPER } from '../theme'

export interface Spec {
  keyframes: DOMKeyframesDefinition
  transition: AnimationOptions
}

export type Burst = 'ring' | 'embers' | 'sparks' | null

export interface TileFace {
  background: string
  color: string
}

export interface RevealInput {
  mark: Mark | null
  index: number
  locked: boolean
}

/**
 * A rule's signature motion. Presets are pure descriptions; Tile/Board play them.
 * A new rule can reuse any preset, so motion never blocks adding rules.
 */
export interface MotionPreset {
  id: MotionPresetId
  reveal(input: RevealInput): Spec
  /** Seconds from submit until the whole row has settled. */
  rowDuration(length: number): number
  face(mark: Mark | null): TileFace
  /** Particle effect fired as each tile lands, with its delay. */
  burst?(input: RevealInput): { kind: Burst; delay: number } | null
  /** Entry animation for tiles when the board first appears. */
  mount(row: number, col: number, locked: boolean): Spec
  celebrate(index: number): Spec
}

const markFace = (mark: Mark | null): TileFace =>
  mark ? { background: MARK_BG[mark], color: INK } : { background: PAPER, color: INK }

const defaultMount = (row: number, col: number): Spec => ({
  keyframes: { scale: [0.3, 1], opacity: [0, 1], y: [24, 0] },
  transition: { type: 'spring', stiffness: 520, damping: 26, delay: 0.12 + row * 0.045 + col * 0.03 },
})

const defaultCelebrate = (i: number): Spec => ({
  keyframes: { y: [0, -30, 0, -8, 0], scale: [1, 1.08, 0.96, 1.02, 1] },
  transition: { duration: 0.7, delay: i * 0.08, times: [0, 0.35, 0.6, 0.8, 1], ease: 'easeOut' },
})

function flipSpec(face: TileFace, i: number, stagger = 0.26, duration = 0.56): Spec {
  return {
    keyframes: {
      rotateX: [0, -90, 90, 0],
      backgroundColor: [PAPER, PAPER, face.background, face.background],
      color: [INK, INK, face.color, face.color],
    },
    transition: { duration, delay: i * stagger, times: [0, 0.5, 0.5, 1], ease: 'easeInOut' },
  }
}

const flip: MotionPreset = {
  id: 'flip',
  reveal: ({ mark, index }) => flipSpec(markFace(mark), index),
  rowDuration: (n) => (n - 1) * 0.26 + 0.56,
  face: markFace,
  mount: defaultMount,
  celebrate: defaultCelebrate,
}

/** Category: each tile is slammed down like a rubber stamp. */
const stamp: MotionPreset = {
  id: 'stamp',
  reveal: ({ mark, index }) => {
    const face = markFace(mark)
    const tilt = (index % 2 ? 1 : -1) * (7 + index * 1.5)
    return {
      keyframes: {
        scale: [1, 1.5, 0.88, 1.04, 1],
        rotate: [0, tilt, -tilt * 0.3, 0, 0],
        y: [0, -18, 3, 0, 0],
        backgroundColor: [PAPER, PAPER, face.background, face.background, face.background],
        color: [INK, INK, face.color, face.color, face.color],
      },
      transition: { duration: 0.52, delay: index * 0.19, times: [0, 0.4, 0.62, 0.82, 1], ease: 'easeOut' },
    }
  },
  rowDuration: (n) => (n - 1) * 0.19 + 0.52,
  face: markFace,
  burst: ({ index }) => ({ kind: 'ring', delay: index * 0.19 + 0.3 }),
  mount: (row, col) => ({
    keyframes: { scale: [1.8, 1], opacity: [0, 1], rotate: [col % 2 ? 12 : -12, 0] },
    transition: { type: 'spring', stiffness: 420, damping: 18, delay: 0.15 + row * 0.05 + col * 0.035 },
  }),
  celebrate: defaultCelebrate,
}

/** Anagram: tiles spin like cards being turned over and re-dealt. */
const spin: MotionPreset = {
  id: 'spin',
  reveal: ({ mark, index }) => {
    const face = markFace(mark)
    return {
      keyframes: {
        rotateY: [0, 90, 270, 360],
        scale: [1, 0.86, 0.86, 1],
        y: mark === 'correct' ? [0, -10, -10, 0] : [0, 0, 0, 0],
        backgroundColor: [PAPER, PAPER, face.background, face.background],
        color: [INK, INK, face.color, face.color],
      },
      transition: { duration: 0.66, delay: index * 0.12, times: [0, 0.35, 0.35, 1], ease: [0.3, 1.4, 0.5, 1] },
    }
  },
  rowDuration: (n) => (n - 1) * 0.12 + 0.66,
  face: markFace,
  burst: ({ mark, index }) => (mark === 'correct' ? { kind: 'sparks', delay: index * 0.12 + 0.5 } : null),
  mount: (row, col) => ({
    keyframes: { rotateY: [180, 0], opacity: [0, 1], x: [(2 - col) * 30, 0] },
    transition: { type: 'spring', stiffness: 300, damping: 22, delay: 0.12 + row * 0.05 + col * 0.04 },
  }),
  celebrate: (i) => ({
    keyframes: { rotateY: [0, 360], y: [0, -20, 0] },
    transition: { duration: 0.7, delay: i * 0.08, ease: 'easeInOut' },
  }),
}

/** Decay: misses catch fire and char black. */
const BURN_FACE: TileFace = { background: '#1A1A1A', color: '#7A7A7A' }
const burn: MotionPreset = {
  id: 'burn',
  reveal: ({ mark, index }) => {
    if (mark !== 'absent') return flipSpec(markFace(mark), index)
    return {
      keyframes: {
        rotateX: [0, -90, 90, 0, 0, 0],
        backgroundColor: [PAPER, PAPER, '#FFD21F', '#FF5A1F', '#FF5A1F', BURN_FACE.background],
        color: [INK, INK, INK, INK, INK, BURN_FACE.color],
        scale: [1, 1, 1, 1.08, 1.02, 1],
      },
      transition: { duration: 1.0, delay: index * 0.26, times: [0, 0.28, 0.28, 0.5, 0.7, 1], ease: 'easeInOut' },
    }
  },
  rowDuration: (n) => (n - 1) * 0.26 + 1.0,
  face: (mark) => (mark === 'absent' ? BURN_FACE : markFace(mark)),
  burst: ({ mark, index }) => (mark === 'absent' ? { kind: 'embers', delay: index * 0.26 + 0.45 } : null),
  mount: defaultMount,
  celebrate: defaultCelebrate,
}

/** Time the thermometer takes to fill after the letters settle. */
export const METER_SECONDS = 1.1

/** Fog: letters emerge out of the mist; the thermometer does the talking. */
const fog: MotionPreset = {
  id: 'fog',
  reveal: ({ index }) => ({
    keyframes: { filter: ['blur(12px)', 'blur(0px)'], opacity: [0.1, 1], scale: [0.9, 1], y: [8, 0] },
    transition: { duration: 0.6, delay: index * 0.09, ease: 'easeOut' },
  }),
  rowDuration: (n) => (n - 1) * 0.09 + 0.6 + METER_SECONDS,
  face: () => markFace(null),
  mount: (row, col) => ({
    keyframes: { filter: ['blur(14px)', 'blur(0px)'], opacity: [0, 1], scale: [1.15, 1] },
    transition: { duration: 0.9, delay: 0.1 + row * 0.07 + col * 0.03, ease: 'easeOut' },
  }),
  celebrate: (i) => ({
    keyframes: { y: [0, -26, 0], filter: ['blur(0px)', 'blur(0px)', 'blur(0px)'], scale: [1, 1.1, 1] },
    transition: { duration: 0.55, delay: i * 0.07, ease: 'easeOut' },
  }),
}

/** Vowels: given vowels drop in and lock with a clunk. */
const lock: MotionPreset = {
  id: 'lock',
  reveal: ({ mark, index, locked }) => {
    const face = markFace(mark)
    if (!locked) return flipSpec(face, index, 0.22)
    return {
      keyframes: {
        scale: [1, 1.2, 0.94, 1],
        y: [0, -6, 2, 0],
        backgroundColor: [PAPER, face.background, face.background, face.background],
      },
      transition: { duration: 0.42, delay: index * 0.22 + 0.1, times: [0, 0.35, 0.7, 1] },
    }
  },
  rowDuration: (n) => (n - 1) * 0.22 + 0.56,
  face: markFace,
  burst: ({ locked, index }) => (locked ? { kind: 'ring', delay: index * 0.22 + 0.2 } : null),
  mount: (row, col, locked) =>
    locked
      ? {
          keyframes: { y: [-90, 0], opacity: [0, 1], rotate: [col % 2 ? 14 : -14, 0] },
          transition: { type: 'spring', stiffness: 380, damping: 14, delay: 0.35 + row * 0.08 + col * 0.03 },
        }
      : defaultMount(row, col),
  celebrate: defaultCelebrate,
}

/** Naija: a talking-drum rhythm — syncopated hops, squash on every landing. */
const BEATS = [0, 0.16, 0.28, 0.52, 0.64, 0.88, 1.0]
const drumDelay = (i: number) => BEATS[i % BEATS.length] + Math.floor(i / BEATS.length) * 1.1
const drum: MotionPreset = {
  id: 'drum',
  reveal: ({ mark, index }) => {
    const face = markFace(mark)
    const tall = index % 3 === 0
    return {
      keyframes: {
        y: [0, tall ? -38 : -24, 0, -8, 0],
        scaleY: [1, 1.08, 0.78, 1.04, 1],
        scaleX: [1, 0.94, 1.16, 0.98, 1],
        backgroundColor: [PAPER, PAPER, face.background, face.background, face.background],
        color: [INK, INK, face.color, face.color, face.color],
      },
      transition: { duration: 0.6, delay: drumDelay(index), times: [0, 0.32, 0.55, 0.76, 1], ease: 'easeOut' },
    }
  },
  rowDuration: (n) => drumDelay(n - 1) + 0.6,
  face: markFace,
  burst: ({ index }) => ({ kind: 'ring', delay: drumDelay(index) + 0.32 }),
  mount: (row, col) => ({
    keyframes: { y: [-40, 0, -10, 0], opacity: [0, 1, 1, 1], scaleY: [1, 0.8, 1.05, 1] },
    transition: { duration: 0.6, delay: 0.12 + row * 0.06 + drumDelay(col) * 0.4, ease: 'easeOut' },
  }),
  celebrate: (i) => ({
    keyframes: { y: [0, -34, 0, -14, 0], scaleY: [1, 1.1, 0.8, 1.05, 1] },
    transition: { duration: 0.75, delay: drumDelay(i) * 0.6, ease: 'easeOut' },
  }),
}

/** Liar: every tile glitches between colours, so the liar can't be spotted by motion. */
const OTHER: Record<Mark, Mark[]> = {
  correct: ['present', 'absent'],
  present: ['absent', 'correct'],
  absent: ['correct', 'present'],
}
const glitch: MotionPreset = {
  id: 'glitch',
  reveal: ({ mark, index }) => {
    const face = markFace(mark)
    const [a, b] = mark ? OTHER[mark].map((m) => MARK_BG[m]) : [PAPER, PAPER]
    return {
      keyframes: {
        rotateX: [0, -90, 90, 0, 0, 0, 0],
        backgroundColor: [PAPER, PAPER, face.background, a, face.background, b, face.background],
        x: [0, 0, 0, -4, 5, -2, 0],
        skewX: [0, 0, 0, 10, -8, 4, 0],
      },
      transition: { duration: 0.95, delay: index * 0.2, times: [0, 0.3, 0.3, 0.55, 0.68, 0.82, 1] },
    }
  },
  rowDuration: (n) => (n - 1) * 0.2 + 0.95,
  face: markFace,
  mount: defaultMount,
  celebrate: defaultCelebrate,
}

export const PRESETS: Record<MotionPresetId, MotionPreset> = { flip, stamp, spin, burn, fog, lock, drum, glitch }
