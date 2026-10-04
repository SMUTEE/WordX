import { motion, useAnimate, useReducedMotion } from 'motion/react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { BoardSetup, Guess } from '../../engine/types'
import { METER_SECONDS, type MotionPreset } from '../motion/presets'
import { Meter, Tile, type TileStatus } from './Tile'

interface BoardProps {
  setup: BoardSetup
  guesses: Guess[]
  /** Letters in the active row, already merged with locks ('' = empty slot). */
  current: string[]
  currentLocks: Record<number, string>
  playing: boolean
  revealingRow: number | null
  celebrateRow: number | null
  shakeNonce: number
  entering: boolean
  preset: MotionPreset
  emptyBorder: string
  /** Who played each submitted row (co-op). */
  rowLabels?: string[]
  /** The open row shows a friend's live typing, not yours. */
  ghost?: boolean
  /** Tapping a typed letter in the open row clears it. */
  onTileTap?(col: number): void
}

const GAP = 6

function useTileSize(rows: number, cols: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState(52)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const { width, height } = el.getBoundingClientRect()
      const byW = (width - GAP * (Math.ceil(cols) - 1)) / cols
      const byH = (height - GAP * (rows - 1)) / rows
      setSize(Math.max(28, Math.floor(Math.min(byW, byH, 68))))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [rows, cols])
  return { ref, size }
}

export function Board(props: BoardProps) {
  const { setup, guesses } = props
  const meter = setup.feedbackKind === 'meter'
  const { ref, size } = useTileSize(setup.maxGuesses, setup.length + (meter ? 1.1 : 0))

  return (
    <div className="board-area" ref={ref}>
      <div className="board" style={{ gap: GAP }} role="grid" aria-label="Guesses">
        {Array.from({ length: setup.maxGuesses }, (_, r) => {
          const guess = guesses[r]
          const isCurrent = !guess && props.playing && r === guesses.length
          return (
            <Row
              key={r}
              row={r}
              size={size}
              {...props}
              shakeNonce={isCurrent ? props.shakeNonce : 0}
              guess={guess}
              isCurrent={isCurrent}
              meter={meter}
            />
          )
        })}
      </div>
    </div>
  )
}

interface RowProps extends BoardProps {
  row: number
  size: number
  guess?: Guess
  isCurrent: boolean
  meter: boolean
}

function Row({ row, size, guess, isCurrent, meter, setup, current, currentLocks, revealingRow, celebrateRow, shakeNonce, entering, preset, emptyBorder, rowLabels, ghost, onTileTap }: RowProps) {
  const [scope, animate] = useAnimate<HTMLDivElement>()
  const reduce = useReducedMotion()

  useEffect(() => {
    if (!shakeNonce || reduce || !scope.current) return
    animate(scope.current, { x: [0, -14, 12, -9, 7, -4, 2, 0] }, { duration: 0.45, ease: 'easeOut' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shakeNonce])

  const revealing = revealingRow === row
  const marks = guess?.feedback.kind === 'tiles' ? guess.feedback.marks : null
  const label = guess ? `Guess ${row + 1}: ${guess.word}` : isCurrent ? 'Current guess' : `Row ${row + 1}, empty`

  return (
    <div ref={scope} className={`row${isCurrent && ghost ? ' row-ghost' : ''}`} role="row" aria-label={guess && rowLabels?.[row] ? `${label}, played by ${rowLabels[row]}` : label} style={{ gap: GAP, perspective: 700 }}>
      {guess && rowLabels?.[row] && (
        <motion.span className="row-tag" initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: -5 }} transition={{ type: 'spring', stiffness: 500, damping: 18, delay: 0.2 }}>
          {rowLabels[row]}
        </motion.span>
      )}
      {Array.from({ length: setup.length }, (_, c) => {
        let letter = ''
        let status: TileStatus = 'empty'
        if (guess) {
          letter = guess.word[c]
          status = 'revealed'
        } else if (isCurrent) {
          letter = current[c] ?? ''
          status = currentLocks[c] ? 'locked' : letter ? 'typed' : 'empty'
        }
        return (
          <Tile
            key={c}
            letter={letter}
            status={status}
            mark={marks ? marks[c] : null}
            preset={preset}
            row={row}
            col={c}
            reveal={revealing}
            celebrate={revealing && celebrateRow === row}
            entering={entering}
            size={size}
            emptyBorder={emptyBorder}
            onTap={isCurrent && !ghost && status === 'typed' && onTileTap ? () => onTileTap(c) : undefined}
          />
        )
      })}
      {meter &&
        (guess?.feedback.kind === 'meter' ? (
          <Meter value={guess.feedback.value} band={guess.feedback.band} play={revealing} delay={preset.rowDuration(setup.length) - METER_SECONDS} size={size} />
        ) : (
          <div className="meter meter-empty" style={{ width: size * 1.1, height: size, borderColor: emptyBorder }} />
        ))}
    </div>
  )
}
