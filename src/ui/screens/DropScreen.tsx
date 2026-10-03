import { useCallback, useEffect, useMemo, useState } from 'react'
import { defaultDictionary } from '../../engine/dictionary'
import { createGame } from '../../engine/engine'
import { hashString } from '../../engine/random'
import type { GameState, Puzzle } from '../../engine/types'
import type { DropPlay, DropResponse, DropView } from '../../net/protocol'
import type { GuessResult } from '../../net/useRoom'
import { registry } from '../../rules'
import { ChunkyButton, PosterWord } from '../components/Bits'
import { navigate } from '../router'
import { saveSession } from '../storage'
import type { RemoteSource } from '../useGame'
import { GameScreen } from './GameScreen'

/** What this device remembers about a drop: the words, the hints, how it ended, and its timer. */
interface DropRecord extends Omit<DropPlay, 'slot'> {
  timeLimit?: number
  deadline?: number
}

const recordKey = (slot: string) => `wordx:v1:drop:${slot}`
const loadRecord = (slot: string): DropRecord => {
  try {
    return { words: [], hintsAfter: [], ...JSON.parse(localStorage.getItem(recordKey(slot)) ?? '{}') }
  } catch {
    return { words: [], hintsAfter: [] }
  }
}
const saveRecord = (slot: string, r: DropRecord) => {
  try {
    localStorage.setItem(recordKey(slot), JSON.stringify(r))
  } catch {
    // Without storage the game still plays; it just won't survive a reload.
  }
}

async function api(path: string, body?: object): Promise<DropResponse | { error: string }> {
  try {
    const res = await fetch(path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined)
    const json = await res.json()
    return res.ok ? json : { error: json.error ?? 'Something went wrong' }
  } catch {
    return { error: 'offline' }
  }
}

/** The client's view of the drop's puzzle. The real answer stays on the server. */
function dropPuzzle(view: DropView): Puzzle {
  return {
    id: `${view.slot}|${view.ruleId}@${view.ruleVersion}`,
    number: view.number,
    date: view.slot.slice(0, 10),
    slot: view.slot,
    ruleId: view.ruleId,
    ruleVersion: view.ruleVersion,
    seed: hashString(view.slot),
    answer: { word: '?'.repeat(view.setup.length) },
    meta: view.meta,
    preview: false,
  }
}

function toState(view: DropView, record: DropRecord, puzzleId: string): GameState {
  return {
    puzzleId,
    guesses: view.guesses.map((g, i) => ({ word: g.word, feedback: g.feedback, submittedAt: i })),
    status: view.status,
    startedAt: 0,
    hints: view.hints,
    endReason: view.endReason,
    timeLimit: record.timeLimit,
    deadline: record.deadline,
  }
}

/** The shared 6-hour drop. Every guess is checked and scored by the server. */
export function DropScreen() {
  const [view, setView] = useState<DropView | null>(null)
  const [record, setRecord] = useState<DropRecord>({ words: [], hintsAfter: [] })
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  // Load the current drop, then replay anything this device already played of it.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const info = await api('/api/drop')
      if (cancelled) return
      if ('error' in info) return setError(info.error)
      const saved = loadRecord(info.view.slot)
      if (!saved.words.length && !saved.hintsAfter.length && !saved.end) {
        setRecord(saved)
        return setView(info.view)
      }
      const replay = await api('/api/drop/play', { slot: info.view.slot, ...saved })
      if (cancelled) return
      if ('error' in replay) return setError(replay.error)
      setRecord(saved)
      setView(replay.view)
    })()
    return () => {
      cancelled = true
    }
  }, [attempt])

  const game = useMemo(() => {
    if (!view) return null
    const rule = registry.get(view.ruleId)
    return rule ? createGame(rule, dropPuzzle(view), defaultDictionary(), { setup: view.setup }) : null
    // Rebuilt only when the drop itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.slot, view?.ruleId])

  const state = useMemo(() => (view && game ? toState(view, record, game.puzzle.id) : undefined), [view, record, game])

  // Keep a plain copy for the home page and stats.
  useEffect(() => {
    if (state) saveSession(state)
  }, [state])

  const send = useCallback(
    async (next: DropRecord): Promise<DropResponse | { error: string }> => {
      if (!view) return { error: 'Not loaded' }
      const r = await api('/api/drop/play', { slot: view.slot, words: next.words, hintsAfter: next.hintsAfter, end: next.end })
      if ('error' in r) return r
      // Only keep what the server accepted.
      const accepted: DropRecord = r.rejected
        ? { ...next, words: next.words.slice(0, r.rejected.index), hintsAfter: next.hintsAfter.filter((h) => h <= r.rejected!.index) }
        : next
      if (r.rejected && r.rejected.code === 'hint') accepted.hintsAfter = record.hintsAfter
      saveRecord(view.slot, accepted)
      setRecord(accepted)
      setView(r.view)
      return r
    },
    [view, record],
  )

  const source: RemoteSource | undefined = useMemo(() => {
    if (!view) return undefined
    return {
      state,
      submit: async (word: string): Promise<GuessResult> => {
        const r = await send({ ...record, words: [...record.words, word] })
        if ('error' in r) return { ok: false, code: r.error === 'offline' ? 'offline' : 'server', message: r.error === 'offline' ? 'You’re offline' : r.error }
        if (r.rejected) return { ok: false, code: r.rejected.code, message: r.rejected.message }
        return { ok: true }
      },
      hint: () => void send({ ...record, hintsAfter: [...record.hintsAfter, record.words.length] }),
      giveUp: () => void send({ ...record, end: 'gave-up' }),
      timeUp: () => void send({ ...record, end: 'time' }),
      startTimer: (minutes: number) => {
        if (record.words.length || record.deadline) return
        const next = { ...record, timeLimit: minutes * 60_000, deadline: Date.now() + minutes * 60_000 }
        saveRecord(view.slot, next)
        setRecord(next)
      },
    }
  }, [view, state, record, send])

  if (error) {
    return (
      <div className="stage ink-dark" style={{ ['--ink' as string]: '#111', ['--soft' as string]: 'rgba(17,17,17,.4)' }}>
        <div className="stage-bg" style={{ background: '#F4F1EA' }} />
        <main className="intro">
          <span className="wordmark">
            WORD<span className="wordmark-x">X</span>
          </span>
          <h1 className="intro-title">
            <PosterWord text={error === 'offline' ? 'OFFLINE' : 'OOPS'} />
          </h1>
          <div className="rule thick" />
          <p className="intro-tagline">
            {error === 'offline' ? 'The daily drop needs a connection, since everyone shares the same word. Your Journey works offline.' : error}
          </p>
          <div className="intro-cta">
            <ChunkyButton
              onClick={() => {
                setError(null)
                setAttempt((n) => n + 1)
              }}
              className="play-btn"
            >
              Try again
            </ChunkyButton>
            <button type="button" className="link-btn" onClick={() => navigate('/journey')}>
              Play the Journey instead
            </button>
          </div>
        </main>
      </div>
    )
  }
  if (!view || !game || !source) return <div className="stage" style={{ background: '#F4F1EA' }} aria-busy="true" />
  return <GameScreen key={game.puzzle.id} game={game} drop={{ source, answer: view.answer }} />
}
