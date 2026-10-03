import { motion, useAnimate, useReducedMotion } from 'motion/react'
import { useEffect, useRef } from 'react'
import type { KeyState } from '../../engine/types'
import { INK, KEY_BG } from '../theme'

const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', '+ZXCVBNM-']

interface KeyboardProps {
  states: Record<string, KeyState>
  onKey(letter: string): void
  onEnter(): void
  onBack(): void
  /** Keys to shake after a refused guess (e.g. burned letters). */
  shake: { letters: string[]; nonce: number }
  entering: boolean
  disabledBorder: string
}

export function Keyboard({ states, onKey, onEnter, onBack, shake, entering, disabledBorder }: KeyboardProps) {
  return (
    <div className="keyboard" role="group" aria-label="Keyboard">
      {ROWS.map((row, r) => (
        <div className="kb-row" key={r}>
          {[...row].map((k, i) => {
            if (k === '+') return <ActionKey key="enter" id="enter" label="Enter" wide onPress={onEnter} row={r} col={i} entering={entering} />
            if (k === '-') return <ActionKey key="back" id="back" label="⌫" aria="Delete" wide onPress={onBack} row={r} col={i} entering={entering} />
            return (
              <LetterKey
                key={k}
                letter={k}
                state={states[k] ?? 'idle'}
                onPress={() => onKey(k)}
                shakeNonce={shake.letters.includes(k) ? shake.nonce : 0}
                row={r}
                col={i}
                entering={entering}
                disabledBorder={disabledBorder}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}

const press = () => navigator.vibrate?.(6)

// The target is always set, so an interrupted entrance can never leave a key hidden.
const enterAnim = (row: number, col: number, entering: boolean) => ({
  initial: entering ? { y: 60, opacity: 0 } : false,
  animate: { y: 0, opacity: 1 },
  transition: { type: 'spring' as const, stiffness: 500, damping: 28, delay: entering ? 0.35 + row * 0.05 + col * 0.018 : 0 },
})

function ActionKey({ id, label, aria, wide, onPress, row, col, entering }: { id: string; label: string; aria?: string; wide?: boolean; onPress(): void; row: number; col: number; entering: boolean }) {
  return (
    <motion.button
      type="button"
      className={`key key-action${wide ? ' key-wide' : ''}`}
      data-key={id}
      aria-label={aria ?? label}
      onPointerDown={press}
      onClick={onPress}
      {...enterAnim(row, col, entering)}
    >
      {label}
    </motion.button>
  )
}

interface LetterKeyProps {
  letter: string
  state: KeyState
  onPress(): void
  shakeNonce: number
  row: number
  col: number
  entering: boolean
  disabledBorder: string
}

function LetterKey({ letter, state, onPress, shakeNonce, row, col, entering, disabledBorder }: LetterKeyProps) {
  const [scope, animate] = useAnimate<HTMLButtonElement>()
  const reduce = useReducedMotion()
  const prev = useRef(state)

  // State changes land with a pop; burning is its own little event.
  useEffect(() => {
    const was = prev.current
    prev.current = state
    if (was === state || reduce || !scope.current) return
    if (state === 'burned') {
      animate(
        scope.current,
        { backgroundColor: ['#FFFFFF', '#FFD21F', '#FF5A1F', INK], scale: [1, 1.18, 0.9, 1], rotate: [0, -6, 4, 0] },
        { duration: 0.7, times: [0, 0.25, 0.55, 1] },
      )
    } else if (state !== 'idle') {
      animate(scope.current, { scale: [1, 1.14, 1] }, { duration: 0.3 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  useEffect(() => {
    if (!shakeNonce || reduce || !scope.current) return
    animate(scope.current, { x: [0, -6, 6, -4, 4, 0], rotate: [0, -8, 8, -4, 0] }, { duration: 0.4 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shakeNonce])

  const inert = state === 'disabled' || state === 'burned'
  const nudge = () => {
    if (!scope.current || reduce) return
    animate(scope.current, { x: [0, -4, 4, -2, 0] }, { duration: 0.25 })
  }

  return (
    <motion.button
      ref={scope}
      type="button"
      className={`key key-${state}`}
      data-key={letter}
      style={{ backgroundColor: KEY_BG[state], borderColor: state === 'disabled' ? disabledBorder : INK }}
      aria-label={`${letter}${state !== 'idle' ? `, ${state}` : ''}`}
      aria-disabled={inert || undefined}
      onPointerDown={press}
      onClick={inert ? nudge : onPress}
      {...enterAnim(row, col, entering)}
    >
      <span className="key-letter">{letter}</span>
      {state === 'burned' && <Flame />}
    </motion.button>
  )
}

function Flame() {
  return (
    <motion.svg
      className="key-flame"
      viewBox="0 0 16 20"
      aria-hidden="true"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: [1, 1.12, 0.94, 1.06, 1], opacity: 1, rotate: [-4, 3, -2, 4, -4] }}
      transition={{ scale: { duration: 1.1, repeat: Infinity }, rotate: { duration: 1.4, repeat: Infinity }, opacity: { duration: 0.3, delay: 0.4 } }}
    >
      <path d="M8 1c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-4 3-6 0 2 1 3 2 3 0-3-1-5 1-8z" fill="#FF5A1F" />
      <path d="M8 10c.6 2 3 3 3 5a3 3 0 0 1-6 0c0-1.4 1-2.2 1.6-3 .2 1 .8 1.4 1.4 1.4 0-1.4-.4-2.4 0-3.4z" fill="#FFD21F" />
    </motion.svg>
  )
}
