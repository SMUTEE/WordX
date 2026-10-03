import { AnimatePresence, animate, motion, useReducedMotion } from 'motion/react'
import { MAX_HINTS } from '../../engine/engine'
import { useEffect, useState } from 'react'
import type { Game } from '../../engine/engine'
import { msUntilNextDrop } from '../../engine/schedule'
import type { WordEntry } from '../../data/words'
import type { Feedback, GameState, Hint, HintReveal, LegendSwatch, RulePresentation } from '../../engine/types'
import { METER_SECONDS, PRESETS, type MotionPreset } from '../motion/presets'
import { share, shareText } from '../share'
import { liveStreak, loadContrast, saveContrast, type Stats as StatsData } from '../storage'
import { starsFor } from '../../journey/progress'
import { applyContrast, BAND, INK, MARK_BG } from '../theme'
import { ChunkyButton, PosterWord, Toggle } from './Bits'
import { Meter, Tile } from './Tile'

/** The rule's worked example, replaying its signature motion on a loop. */
export function ExampleRow({ word, feedback, preset, size = 44 }: { word: string; feedback: Feedback; preset: MotionPreset; size?: number }) {
  const [cycle, setCycle] = useState(0)
  const reduce = useReducedMotion()
  useEffect(() => {
    if (reduce) return
    const t = window.setInterval(() => setCycle((c) => c + 1), (preset.rowDuration(word.length) + 2.4) * 1000)
    return () => window.clearInterval(t)
  }, [preset, word, reduce])
  const marks = feedback.kind === 'tiles' ? feedback.marks : null
  return (
    <div className="example-row" key={cycle} style={{ perspective: 700 }}>
      {[...word].map((l, i) => (
        <Tile
          key={i}
          letter={l}
          status="revealed"
          mark={marks ? marks[i] : null}
          preset={preset}
          row={0}
          col={i}
          reveal
          celebrate={false}
          entering={false}
          size={size}
          emptyBorder="transparent"
        />
      ))}
      {feedback.kind === 'meter' && <Meter value={feedback.value} band={feedback.band} play delay={preset.rowDuration(word.length) - METER_SECONDS} size={size} />}
    </div>
  )
}

function swatchStyle(swatch: LegendSwatch): React.CSSProperties {
  if (swatch === 'burned') return { background: INK }
  if (swatch === 'locked') return { background: '#FFFFFF' }
  if (swatch in MARK_BG) return { background: MARK_BG[swatch as keyof typeof MARK_BG] }
  return { background: BAND[swatch as keyof typeof BAND].color }
}

/** What each colour means today, always in view while playing. */
export function Legend({ items, entering }: { items: RulePresentation['legend']; entering: boolean }) {
  return (
    <ul className="legend" aria-label="What the colours mean">
      {items.map((item, i) => (
        <motion.li
          key={item.label}
          initial={entering ? { opacity: 0, y: 8 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 + i * 0.06 }}
        >
          <span className={`swatch swatch-${item.swatch}`} style={swatchStyle(item.swatch)} aria-hidden="true" />
          {item.label}
        </motion.li>
      ))}
    </ul>
  )
}

/** Earned stars pop in one by one. */
export function StarRow({ stars, size = 34 }: { stars: number; size?: number }) {
  return (
    <div className="stars" aria-label={`${stars} of 3 stars`}>
      {[1, 2, 3].map((i) => (
        <motion.svg
          key={i}
          viewBox="0 0 24 24"
          width={size}
          height={size}
          aria-hidden="true"
          initial={{ scale: 0, rotate: -40 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 14, delay: 0.7 + i * 0.18 }}
        >
          <path
            d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5L2.5 9.3l6.6-.8z"
            fill={i <= stars ? '#FFD21F' : 'transparent'}
            stroke="#111"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </motion.svg>
      ))}
    </div>
  )
}

const ordinal = (n: number) => ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th'][n] ?? `${n + 1}th`

/** The hint button, and the hints you've taken so far. */
export function HintBar({ hints, status, onHint }: { hints: HintReveal[]; status: { available: boolean; reason?: string }; onHint(): void }) {
  const left = Math.max(0, MAX_HINTS - hints.length)
  return (
    <div className="hint-bar">
      <AnimatePresence initial={false}>
        {hints.map((h, i) => (
          <motion.p
            key={i}
            className="hint-reveal"
            initial={{ opacity: 0, y: -10, rotate: -3, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 22 }}
          >
            <span className="hint-reveal-kind">{h.kind === 'clue' ? 'Clue' : 'Letter'}</span>
            {h.kind === 'clue' ? h.text : `The ${ordinal(h.index)} letter is ${h.letter}`}
          </motion.p>
        ))}
      </AnimatePresence>
      {left > 0 && (
        <button
          type="button"
          className={`hint-btn${status.available ? '' : ' hint-btn-off'}`}
          onClick={status.available ? onHint : undefined}
          aria-disabled={!status.available}
          title={status.reason}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M8 1.5a4.5 4.5 0 0 0-2.6 8.2V12h5.2V9.7A4.5 4.5 0 0 0 8 1.5ZM6 14.5h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          {status.available ? `Hint · ${left} left` : status.reason}
        </button>
      )}
    </div>
  )
}

export function HintPanel({ hint, typed, onLetter }: { hint?: Hint; typed: string[]; onLetter(l: string): void }) {
  if (!hint) return null
  if (hint.kind === 'letters') return <LetterRack letters={hint.letters} typed={typed} onLetter={onLetter} />
  return (
    <motion.div
      className="hint-card"
      initial={{ y: -30, rotate: -8, opacity: 0 }}
      animate={{ y: 0, rotate: -1.5, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 14, delay: 0.35 }}
    >
      <span className="hint-kicker">{hint.prompt}</span>
      <span className="hint-label">{hint.label}</span>
    </motion.div>
  )
}

/** Anagram's letter rack: tap to type, shuffle to see the letters fresh. */
function LetterRack({ letters, typed, onLetter }: { letters: string[]; typed: string[]; onLetter(l: string): void }) {
  const [order, setOrder] = useState(() => letters.map((l, i) => ({ l, id: i })))
  const [dealt, setDealt] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setDealt(true), 900)
    return () => window.clearTimeout(t)
  }, [])
  const used = new Map<string, number>()
  for (const t of typed) if (t) used.set(t, (used.get(t) ?? 0) + 1)
  const seen = new Map<string, number>()
  const reshuffle = () => setOrder((o) => [...o].sort(() => Math.random() - 0.5))
  return (
    <div className="rack">
      {order.map(({ l, id }) => {
        const n = (seen.get(l) ?? 0) + 1
        seen.set(l, n)
        const spent = n <= (used.get(l) ?? 0)
        return (
          <motion.button
            layout
            key={id}
            type="button"
            className={`rack-chip${spent ? ' rack-spent' : ''}`}
            onClick={() => onLetter(l)}
            aria-label={`Letter ${l}${spent ? ', used' : ''}`}
            initial={{ y: -40, rotate: (id - 2) * 12, opacity: 0 }}
            animate={{ y: spent ? 6 : 0, rotate: spent ? 0 : (id % 2 ? 3 : -3), opacity: spent ? 0.35 : 1 }}
            transition={{ type: 'spring', stiffness: 420, damping: 18, delay: dealt ? 0 : 0.3 + id * 0.05 }}
            whileTap={{ y: 4 }}
          >
            {l}
          </motion.button>
        )
      })}
      <motion.button type="button" className="rack-shuffle" onClick={reshuffle} aria-label="Shuffle letters" whileTap={{ rotate: 180, scale: 0.9 }}>
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M3 6h3l8 8h3M3 14h3l2-2m4-4 2-2h3m-2-2 2 2-2 2m0 4 2 2-2 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </motion.button>
    </div>
  )
}

function CountUp({ to }: { to: number }) {
  const [v, setV] = useState(0)
  useEffect(() => {
    const c = animate(0, to, { duration: 0.9, ease: 'easeOut', delay: 0.4, onUpdate: (x) => setV(Math.round(x)) })
    return () => c.stop()
  }, [to])
  return <>{v}</>
}

/** Time to the next drop: "5h 12m", then "12:34" in the final hour. Flags when a new one is live. */
function useCountdown() {
  const [ms, setMs] = useState(msUntilNextDrop)
  const [live, setLive] = useState(false)
  useEffect(() => {
    const t = window.setInterval(() => {
      setMs((prev) => {
        const next = msUntilNextDrop()
        if (next > prev) setLive(true)
        return next
      })
    }, 1000)
    return () => window.clearInterval(t)
  }, [])
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const text = h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}:${String(s % 60).padStart(2, '0')}`
  return { text, live }
}

export function ResultPanel({ game, answer: revealed, state, stats, preset, onToast, team, level }: {
  game: Game
  answer?: WordEntry
  state: GameState
  stats: StatsData
  preset: MotionPreset
  onToast(t: string): void
  team?: { crew: string; link: string }
  level?: { n: number; isLast: boolean; onNext(): void; onRetry(): void; onMap(): void }
}) {
  const countdown = useCountdown()
  const [today] = useState(() => new Date().toISOString().slice(0, 10))
  const { puzzle, setup, rule } = game
  // In co-op the answer arrives from the server only once the game is over.
  const answer = revealed ?? puzzle.answer
  const won = state.status === 'won'
  const finished = state.status !== 'playing'
  const max = setup.maxGuesses
  const bars = Array.from({ length: max }, (_, i) => stats.distribution[i + 1] ?? 0)
  const top = Math.max(1, ...bars)
  // Rules without tile colours (Fog) still reveal the answer in green.
  const answerPreset = preset.face('correct').background === preset.face(null).background ? PRESETS.flip : preset

  const lostLine =
    state.endReason === 'time'
      ? 'Time ran out. The word was'
      : state.endReason === 'gave-up'
        ? 'You gave up. The word was'
        : state.endReason === 'ended'
          ? 'The game was ended. The word was'
          : `You used all ${max} tries. The word was`
  const headline = won ? (level?.isLast ? 'CHAMPION' : 'SOLVED') : state.endReason === 'time' ? 'TIME’S UP' : state.endReason === 'ended' ? 'GAME ENDED' : 'NOT TODAY'
  const stars = starsFor(state, setup)

  const onShare = async () => {
    const r = await share(shareText(puzzle, rule, state, max, team))
    onToast(r === 'copied' ? 'Copied to clipboard' : r === 'shared' ? 'Shared' : 'Couldn’t share. Try again')
  }

  return (
    <div className="result">
      {finished ? (
        <>
          <div className="result-head">
            <PosterWord text={headline} className="result-word" delay={0.15} />
            <motion.p className="result-sub" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
              {team
                ? won
                  ? `${team.crew} solved it in ${state.guesses.length} of ${max} tries`
                  : lostLine
                : won
                  ? `Solved in ${state.guesses.length} of ${max} tries ${level ? `· level ${level.n}` : `on ${rule.presentation.name} day`}${state.hints?.length ? `, with ${state.hints.length} hint${state.hints.length > 1 ? 's' : ''}` : ''}`
                  : lostLine}
            </motion.p>
          </div>
          <div className="result-answer" style={{ perspective: 700 }}>
            {[...answer.word].map((l, i) => (
              <Tile key={i} letter={l} status="revealed" mark="correct" preset={answerPreset} row={0} col={i} reveal celebrate={won} entering={false} size={46} emptyBorder="transparent" />
            ))}
          </div>
          {answer.gloss && (
            <motion.p className="result-gloss" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4 }}>
              <strong>{answer.word[0] + answer.word.slice(1).toLowerCase()}</strong> — {answer.gloss}
            </motion.p>
          )}
        </>
      ) : (
        <div className="result-head">
          <PosterWord text="STATS" className="result-word" />
        </div>
      )}

      {level && finished ? (
        <motion.div className="practice-box" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
          {won && <StarRow stars={stars} />}
          {won ? (
            level.isLast ? (
              <p className="result-note">You’ve finished the Journey. Replay any level for more stars.</p>
            ) : (
              <ChunkyButton onClick={level.onNext} className="play-btn">
                Next level →
              </ChunkyButton>
            )
          ) : (
            <ChunkyButton onClick={level.onRetry} className="play-btn">
              Try again with a new word
            </ChunkyButton>
          )}
          <button type="button" className="link-btn" onClick={level.onMap}>
            Back to the map
          </button>
        </motion.div>
      ) : puzzle.preview ? (
        <motion.div className="practice-box" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
          <p className="result-note">
            {team ? 'Games with friends don’t count toward your solo stats or streak.' : 'This was a practice round, so it doesn’t count toward your stats or streak.'}
          </p>
          <a className="chunky chunky-paper practice-cta" href="/play">Play this drop solo</a>
        </motion.div>
      ) : (
        <Stats stats={stats} bars={bars} top={top} mine={won ? state.guesses.length : null} today={today} />
      )}

      <div className="result-foot">
        {finished && (
          <ChunkyButton onClick={onShare} className="share-btn" variant={level ? 'paper' : 'ink'}>
            Share result
          </ChunkyButton>
        )}
        {level ? null : countdown.live ? (
          <a className="chunky chunky-paper countdown-live" href="/">New drop is live</a>
        ) : (
          <div className="countdown">
            <span className="countdown-label">Next drop in</span>
            <span className="countdown-time">{countdown.text}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function Stats({ stats, bars, top, mine, today }: { stats: StatsData; bars: number[]; top: number; mine: number | null; today: string }) {
  return (
    <>
      <div className="stat-grid">
        {[
          ['Played', stats.played],
          ['Win %', stats.played ? Math.round((stats.won / stats.played) * 100) : 0],
          ['Day streak', liveStreak(stats, today)],
          ['Best', stats.maxStreak],
        ].map(([label, value], i) => (
          <motion.div
            className="stat"
            key={label}
            initial={{ y: 24, opacity: 0, rotate: i % 2 ? 4 : -4 }}
            animate={{ y: 0, opacity: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20, delay: 0.25 + i * 0.07 }}
          >
            <span className="stat-value"><CountUp to={value as number} /></span>
            <span className="stat-label">{label}</span>
          </motion.div>
        ))}
      </div>

      {stats.won === 0 ? (
        <p className="result-note">Win a daily puzzle to start your tries chart.</p>
      ) : (
      <div className="dist" aria-label="Tries needed to win">
        <span className="kicker">Tries needed to win</span>
        {bars.map((count, i) => {
          const isMine = mine === i + 1
          return (
            <div className="dist-row" key={i}>
              <span className="dist-n">{i + 1}</span>
              <motion.span
                className="dist-bar"
                style={{ background: isMine ? MARK_BG.correct : '#FFFFFF' }}
                initial={{ width: '8%' }}
                animate={{ width: `${Math.max(8, (count / top) * 100)}%` }}
                transition={{ type: 'spring', stiffness: 140, damping: 18, delay: 0.5 + i * 0.06 }}
              >
                {count}
              </motion.span>
            </div>
          )
        })}
      </div>
      )}
    </>
  )
}

export function HelpPanel({ game, preset, rules, onSettings }: { game: Game; preset: MotionPreset; rules: { id: string; name: string; bg: string }[]; onSettings?(): void }) {
  const p = game.rule.presentation
  const [contrast, setContrast] = useState(loadContrast)
  const toggleContrast = (on: boolean) => {
    setContrast(on)
    saveContrast(on)
    applyContrast(on)
    onSettings?.()
  }
  return (
    <div className="help">
      <span className="kicker">Today’s rule</span>
      <PosterWord text={p.name.toUpperCase()} className="help-word" />
      <p className="help-tagline">{p.tagline}</p>
      <ol className="help-list">
        {p.instructions.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
      <ExampleRow word={p.example.word} feedback={p.example.feedback} preset={preset} size={40} />
      <p className="help-caption">{p.example.caption}</p>
      <Toggle label="Colour-blind mode" hint="Orange and blue instead of green and yellow, with shape markers" on={contrast} onChange={toggleContrast} />
      <hr className="rule" />
      <span className="kicker">How WordX works</span>
      <ol className="help-list">
        <li>Guess the hidden {game.setup.length}-letter word in {game.setup.maxGuesses} tries.</li>
        <li>Every day the rule changes how feedback works.</li>
        <li>Refused guesses never cost you an attempt.</li>
        <li>Everyone gets the same daily puzzle. A new one drops every day at midnight UTC, each with a different rule.</li>
        <li>Your streak counts days in a row with at least one solve.</li>
      </ol>
      <hr className="rule" />
      <span className="kicker">Practise another rule</span>
      <div className="practice">
        {rules.map((r) => (
          <a key={r.id} className={`practice-chip${r.id === game.rule.id ? ' practice-on' : ''}`} style={{ background: r.bg }} href={`/play?rule=${r.id}`}>
            {r.name}
          </a>
        ))}
        <a className="practice-chip practice-today" href="/play">This drop</a>
      </div>
    </div>
  )
}
