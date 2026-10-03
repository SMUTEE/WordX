import { animate as animateValue, motion, useAnimate, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import type { Mark, TemperatureBand } from '../../engine/types'
import type { Burst, MotionPreset } from '../motion/presets'
import { BAND, INK } from '../theme'

export type TileStatus = 'empty' | 'typed' | 'locked' | 'revealed'

interface TileProps {
  letter: string
  status: TileStatus
  mark: Mark | null
  preset: MotionPreset
  row: number
  col: number
  /** Play the reveal now (a fresh guess). Restored guesses render settled. */
  reveal: boolean
  celebrate: boolean
  entering: boolean
  size: number
  emptyBorder: string
}

export function Tile({ letter, status, mark, preset, row, col, reveal, celebrate, entering, size, emptyBorder }: TileProps) {
  const [scope, animate] = useAnimate<HTMLDivElement>()
  const reduce = useReducedMotion()
  const [settled, setSettled] = useState(!reveal)
  const [burst, setBurst] = useState<Burst>(null)
  const locked = status === 'locked'
  const wasLocked = useRef(locked)

  // Board entrance.
  useEffect(() => {
    if (!entering || reduce || !scope.current) return
    const spec = preset.mount(row, col, locked)
    animate(scope.current, spec.keyframes, spec.transition)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Signature reveal.
  useEffect(() => {
    if (!reveal) return
    setSettled(false)
    let cancelled = false
    const b = preset.burst?.({ mark, index: col, locked: wasLocked.current })
    const timer = b && !reduce ? window.setTimeout(() => setBurst(b.kind), b.delay * 1000) : undefined
    ;(async () => {
      if (!reduce && scope.current) {
        const spec = preset.reveal({ mark, index: col, locked: wasLocked.current })
        await animate(scope.current, spec.keyframes, spec.transition)
      }
      if (cancelled) return
      setSettled(true)
      if (celebrate && !reduce && scope.current) {
        const c = preset.celebrate(col)
        await animate(scope.current, c.keyframes, c.transition)
      }
    })()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal])

  // A little thump on every keystroke.
  useEffect(() => {
    if (status !== 'typed' || !letter || reduce || !scope.current) return
    animate(scope.current, { scale: [1, 1.12, 1] }, { duration: 0.18, ease: 'easeOut' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [letter, status])

  // A letter revealed by a hint drops into place.
  useEffect(() => {
    if (locked && !wasLocked.current && !reduce && scope.current) {
      animate(scope.current, { y: [-40, 0], rotate: [-10, 0] }, { type: 'spring', stiffness: 420, damping: 15 })
    }
    if (status !== 'revealed') wasLocked.current = locked
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked])

  const face = status === 'revealed' && settled ? preset.face(mark) : null
  const filled = status !== 'empty'
  const style: React.CSSProperties = {
    width: size,
    height: size,
    fontSize: size * 0.52,
    backgroundColor: face ? face.background : filled ? '#FFFFFF' : 'transparent',
    color: face ? face.color : INK,
    borderColor: filled ? INK : emptyBorder,
    borderStyle: filled ? 'solid' : 'dashed',
    borderBottomWidth: filled ? Math.max(4, size * 0.075) : 2,
  }

  return (
    <div className="tile-wrap" style={{ width: size, height: size }}>
      <div ref={scope} className={`tile tile-${status}`} style={style} data-mark={face ? mark ?? 'none' : undefined}>
        {letter && (
          <motion.span
            key={letter}
            className="tile-letter"
            initial={status === 'typed' && !reduce ? { scale: 0.2, opacity: 0, y: 6 } : false}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 700, damping: 22 }}
          >
            {letter}
          </motion.span>
        )}
        {locked && <LockGlyph size={size} />}
      </div>
      {burst && <BurstFx kind={burst} size={size} />}
    </div>
  )
}

function LockGlyph({ size }: { size: number }) {
  const s = Math.max(9, size * 0.2)
  return (
    <svg className="tile-lock" width={s} height={s} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2" fill="none" stroke={INK} strokeWidth="2" />
      <rect x="2.5" y="7" width="11" height="8" rx="2" fill={INK} />
    </svg>
  )
}

function BurstFx({ kind, size }: { kind: Exclude<Burst, null>; size: number }) {
  if (kind === 'ring') {
    return (
      <motion.span
        className="burst-ring"
        initial={{ scale: 0.7, opacity: 0.9 }}
        animate={{ scale: 1.9, opacity: 0 }}
        transition={{ duration: 0.55, ease: 'easeOut' }}
      />
    )
  }
  const count = kind === 'embers' ? 9 : 6
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2
        const ember = kind === 'embers'
        const dx = ember ? (i - count / 2) * size * 0.08 : Math.cos(angle) * size * 0.9
        const dy = ember ? -size * (0.8 + (i % 3) * 0.35) : Math.sin(angle) * size * 0.9
        return (
          <motion.span
            key={i}
            className={ember ? 'burst-ember' : 'burst-spark'}
            style={{ background: ember ? (i % 2 ? '#FF5A1F' : '#FFD21F') : INK, rotate: ember ? 0 : (angle * 180) / Math.PI }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: dx, y: dy, opacity: 0, scale: ember ? 0.4 : 0.6, rotate: ember ? 180 : undefined }}
            transition={{ duration: ember ? 0.9 + (i % 3) * 0.2 : 0.5, ease: 'easeOut', delay: ember ? (i % 4) * 0.05 : 0 }}
          />
        )
      })}
    </>
  )
}

interface MeterProps {
  value: number
  band: TemperatureBand
  play: boolean
  delay: number
  size: number
}

/** Fog's thermometer: fills bottom-up and counts the degrees as it rises. */
export function Meter({ value, band, play, delay, size }: MeterProps) {
  const reduce = useReducedMotion()
  const target = Math.round(value * 100)
  const [shown, setShown] = useState(play && !reduce ? 0 : target)
  const [filled, setFilled] = useState(!play || !!reduce)

  useEffect(() => {
    if (!play || reduce) return
    const t = window.setTimeout(() => {
      setFilled(true)
      animateValue(0, target, { duration: 0.9, ease: 'easeOut', onUpdate: (v) => setShown(Math.round(v)) })
    }, delay * 1000)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play])

  const meta = BAND[band]
  return (
    <div className="meter" style={{ width: size * 1.1, height: size, borderBottomWidth: Math.max(4, size * 0.075) }} title={`${meta.label}, ${target}°`}>
      <motion.div
        className="meter-fill"
        style={{ background: meta.color }}
        initial={false}
        animate={{ height: filled ? `${Math.max(target, 6)}%` : '0%' }}
        transition={{ type: 'spring', stiffness: 120, damping: 14 }}
      />
      <span className="meter-value" style={{ fontSize: size * 0.3 }}>
        {shown}°
      </span>
      <span className="meter-band" style={{ fontSize: Math.max(9, size * 0.15) }}>
        {meta.label}
      </span>
    </div>
  )
}
