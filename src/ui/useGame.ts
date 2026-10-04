import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Game } from '../engine/engine'
import type { GameState } from '../engine/types'
import type { GuessResult } from '../net/useRoom'
import { scheduleBackup } from '../net/sync'
import type { MotionPreset } from './motion/presets'
import { loadSession, recordActivity, recordResult, saveSession, type Stats, loadStats } from './storage'

export interface Toast {
  id: number
  text: string
  /** Second line, e.g. reassurance that no try was used. */
  sub?: string
  tone?: 'info' | 'warn'
}

/** Merges typed letters into the open (unlocked) slots of a row. */
export function compose(length: number, locks: Record<number, string>, typed: ArrayLike<string>): string[] {
  const out: string[] = []
  let k = 0
  for (let i = 0; i < length; i++) out.push(locks[i] ?? typed[k++] ?? '')
  return out
}

/** Co-op: the server owns the board. This client proposes guesses and follows its state. */
export interface RemoteSource {
  /** The latest board from the server. */
  state: GameState | undefined
  submit(word: string): Promise<GuessResult>
  /** Your letters as you type, for friends to watch. */
  onTyping?(letters: string[]): void
  /** Explains why input is blocked, e.g. "It’s Segun’s turn". */
  lockedReason?: string
  /** Ask the server for a hint; it arrives with the next board. */
  hint(): void
  /** Give up (for the whole team, in co-op). */
  giveUp(): void
  /** Solo games scored remotely run their own clock: start it, and report when it runs out. */
  startTimer?(minutes: number): void
  timeUp?(): void
}

export interface GameOptions {
  remote?: RemoteSource
  /** Called once when a game ends, however it ends. */
  onFinished?(state: GameState): void
}

export function useGame(game: Game, preset: MotionPreset, options: GameOptions = {}) {
  const { remote, onFinished } = options
  const finishedRef = useRef(false)
  const finish = useCallback(
    (next: GameState) => {
      if (finishedRef.current) return
      finishedRef.current = true
      recordActivity(next.status === 'won')
      scheduleBackup()
      setStats(recordResult(game.puzzle, next))
      setFinishedNow(true)
      onFinished?.(next)
    },
    [game, onFinished],
  )
  const [state, setState] = useState<GameState>(() => remote?.state ?? loadSession(game.puzzle.id) ?? game.newState())
  // Letters typed into the open slots, one per slot ('' = empty), so any one can be cleared.
  const [typed, setTyped] = useState<string[]>([])
  // A different puzzle on the same screen (a Journey level switching difficulty): start it fresh.
  const [stateFor, setStateFor] = useState(game.puzzle.id)
  if (stateFor !== game.puzzle.id) {
    setStateFor(game.puzzle.id)
    setState(remote?.state ?? loadSession(game.puzzle.id) ?? game.newState())
    setTyped([])
  }
  const [revealingRow, setRevealingRow] = useState<number | null>(null)
  const [shakeNonce, setShakeNonce] = useState(0)
  const [keyShake, setKeyShake] = useState({ letters: [] as string[], nonce: 0 })
  const [toast, setToast] = useState<Toast | null>(null)
  const [stats, setStats] = useState<Stats>(loadStats)
  const [finishedNow, setFinishedNow] = useState(false)
  const [sending, setSending] = useState(false)
  const busy = useRef(false)
  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  // Board and keyboard show results only once the reveal has played.
  const display = useMemo<GameState>(
    () => (revealingRow === null ? state : { ...state, guesses: state.guesses.slice(0, revealingRow), status: 'playing' }),
    [state, revealingRow],
  )
  const locks = useMemo(() => game.locks(display), [game, display])
  const openSlots = game.setup.length - Object.keys(locks).length
  const keyStates = useMemo(() => game.keyStates(display), [game, display])
  const locked = !!remote?.lockedReason

  const say = useCallback((text: string, sub?: string, tone: Toast['tone'] = 'info') => setToast(text ? { id: Date.now(), text, sub, tone } : null), [])

  /** Shows a new board, revealing row `row` with the rule's signature motion. */
  const reveal = useCallback(
    (next: GameState, row: number | null) => {
      setState(next)
      if (row === null) {
        // No row to animate (time ran out, someone gave up, or a reconnect): finish straight away.
        if (next.status !== 'playing') finish(next)
        return
      }
      busy.current = true
      setRevealingRow(row)
      const done = next.status !== 'playing'
      const ms = preset.rowDuration(game.setup.length) * 1000 + (done && next.status === 'won' ? 900 : 120)
      timers.current.push(
        window.setTimeout(() => {
          setRevealingRow(null)
          busy.current = false
          if (done) {
            finish(next)
          } else if (next.guesses.length === game.setup.maxGuesses - 1) {
            say('Last try', 'Make it count', 'warn')
          }
        }, ms),
      )
    },
    [game, preset, say, finish],
  )

  // Co-op: follow the server. One new row animates; bigger jumps (a reconnect) just land.
  const remoteState = remote?.state
  const shown = useRef(state.guesses.length)
  useEffect(() => {
    if (!remoteState) return
    const before = shown.current
    const after = remoteState.guesses.length
    shown.current = after
    if (after === before && remoteState.status === state.status) {
      // Same guesses: only hints (or nothing) changed, so no reveal to play.
      if ((remoteState.hints?.length ?? 0) !== (state.hints?.length ?? 0)) setState(remoteState)
      return
    }
    reveal(remoteState, after === before + 1 ? before : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteState])

  const onTyping = remote?.onTyping
  useEffect(() => {
    onTyping?.(compose(game.setup.length, locks, typed))
  }, [typed, onTyping, game.setup.length, locks])

  const onKey = useCallback(
    (letter: string) => {
      if (busy.current || state.status !== 'playing') return
      if (remote?.lockedReason) {
        say(remote.lockedReason)
        return
      }
      const ks = game.keyStates(state)[letter]
      if (ks === 'disabled' || ks === 'burned') {
        setKeyShake((s) => ({ letters: [letter], nonce: s.nonce + 1 }))
        say(ks === 'burned' ? `${letter} has burned out` : `You can’t use ${letter} today`)
        return
      }
      // Fill the first empty slot: after clearing one in the middle, that's where the letter goes.
      setTyped((t) => {
        for (let k = 0; k < openSlots; k++) {
          if (!t[k]) {
            const next = [...t]
            next[k] = letter
            return next
          }
        }
        return t
      })
    },
    [game, state, openSlots, say, remote?.lockedReason],
  )

  const onBack = useCallback(() => {
    if (busy.current) return
    setTyped((t) => {
      const next = [...t]
      for (let k = next.length - 1; k >= 0; k--) {
        if (next[k]) {
          next[k] = ''
          break
        }
      }
      while (next.length && !next[next.length - 1]) next.pop()
      return next
    })
  }, [])

  /** Clears the letter in one column of the open row (tapping a tile). Hint-locked letters stay. */
  const clearAt = useCallback(
    (col: number) => {
      if (busy.current || state.status !== 'playing' || locks[col] || remote?.lockedReason) return
      let k = 0
      for (let i = 0; i < col; i++) if (!locks[i]) k++
      setTyped((t) => {
        if (!t[k]) return t
        const next = [...t]
        next[k] = ''
        while (next.length && !next[next.length - 1]) next.pop()
        return next
      })
    },
    [state.status, locks, remote?.lockedReason],
  )

  const refuse = useCallback(
    (message: string, letters?: string[], free = true) => {
      say(message, free ? 'No try used' : undefined)
      setShakeNonce((n) => n + 1)
      if (letters) setKeyShake((s) => ({ letters, nonce: s.nonce + 1 }))
    },
    [say],
  )

  const onEnter = useCallback(async () => {
    if (busy.current || state.status !== 'playing') return
    if (remote?.lockedReason) return say(remote.lockedReason)
    const word = compose(game.setup.length, locks, typed).join('')

    if (remote) {
      // Check locally first for instant feedback; the server checks again and scores.
      const local = game.validate(word, state)
      if (!local.ok) return refuse(local.message, local.letters)
      busy.current = true
      setSending(true)
      const result = await remote.submit(word)
      setSending(false)
      busy.current = false
      if (result.ok) setTyped([])
      else if (result.code === 'timeout' || result.code === 'offline') say('Couldn’t send that guess', 'Check your connection and try again')
      else refuse(result.message)
      return
    }

    const result = game.submit(state, word)
    if (!result.accepted) return refuse(result.error.message, result.error.letters, result.error.code !== 'finished')
    saveSession(result.state)
    setTyped([])
    reveal(result.state, state.guesses.length)
  }, [game, state, locks, typed, remote, say, refuse, reveal])

  const hintStatus = game.hintStatus(display)
  const takeHint = useCallback(() => {
    if (busy.current) return
    if (remote) {
      if (remote.lockedReason) return say(remote.lockedReason)
      return remote.hint()
    }
    const r = game.hint(state)
    if (!r.ok) return say(r.message)
    setState(r.state)
    saveSession(r.state)
    // A revealed letter takes its slot, so letters typed so far shift to the open slots.
    setTyped([])
  }, [game, state, remote, say])

  /** Ends a solo game early. Co-op asks the server, which tells everyone. */
  const end = useCallback(
    (reason: 'time' | 'gave-up') => {
      if (state.status !== 'playing') return
      if (remote) {
        if (reason === 'gave-up') remote.giveUp()
        return
      }
      const next = game.forfeit(state, reason)
      saveSession(next)
      setTyped([])
      setState(next)
      finish(next)
    },
    [game, state, remote, finish],
  )
  const giveUp = useCallback(() => end('gave-up'), [end])

  const startTimer = useCallback(
    (minutes: number) => {
      if (remote) return remote.startTimer?.(minutes)
      setState((s) => {
        const next = game.withTimer(s, minutes)
        saveSession(next)
        return next
      })
    },
    [game, remote],
  )

  // The clock: a solo game ends the moment it runs out; the server ends co-op games.
  const deadline = state.deadline
  const playing = state.status === 'playing'
  const timeUp = remote?.timeUp
  useEffect(() => {
    if (!deadline || !playing || (remote && !timeUp)) return
    let fired = false
    const t = window.setInterval(() => {
      if (fired || Date.now() < deadline) return
      fired = true
      if (timeUp) timeUp()
      else end('time')
    }, 250)
    return () => window.clearInterval(t)
  }, [deadline, playing, remote, timeUp, end])

  // Physical keyboard.
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (target?.closest?.('[role="dialog"], input, textarea')) return
      if (e.key === 'Enter') onEnter()
      else if (e.key === 'Backspace') onBack()
      else if (/^[a-z]$/i.test(e.key)) onKey(e.key.toUpperCase())
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [onEnter, onBack, onKey])

  return {
    state,
    display,
    current: compose(game.setup.length, locks, typed),
    locks,
    keyStates,
    revealingRow,
    shakeNonce,
    keyShake,
    toast,
    say,
    stats,
    finishedNow,
    sending,
    locked,
    celebrateRow: state.status === 'won' ? state.guesses.length - 1 : null,
    hints: display.hints ?? [],
    hintStatus,
    takeHint,
    giveUp,
    startTimer,
    onKey,
    onBack,
    clearAt,
    onEnter,
  }
}
