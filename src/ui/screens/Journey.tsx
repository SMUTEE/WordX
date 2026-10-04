import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { DIFFICULTIES, LEVEL_COUNT, LEVELS, STAGES, levelDef, levelGame, levelPuzzleId, poolSize, type Difficulty } from '../../journey/levels'
import { loadDifficulty, loadJourney, recordLevel, saveDifficulty, totalPoints, totalStars } from '../../journey/progress'
import { getMe } from '../../net/identity'
import { registry } from '../../rules'
import { PosterWord, ToastHost } from '../components/Bits'
import { StarRow } from '../components/Panels'
import { navigate } from '../router'
import { Credit } from '../components/Credit'
import { loadSession } from '../storage'
import type { Toast } from '../useGame'
import { Chrome } from './Chrome'
import { GameScreen } from './GameScreen'

const MAP_THEME = { bg: '#111111', ink: 'light' as const }
/** Nodes snake inside each stage: centre, right, centre, left, centre. */
const X = [50, 72, 50, 28, 50]
const ROW = 156

/** The road map: four solid stage blocks of five levels. Cleared levels show stars; the next one pulses. */
export function JourneyMap() {
  const reduce = useReducedMotion()
  const [progress] = useState(loadJourney)
  const [toast, setToast] = useState<Toast | null>(null)
  const current = Math.min(progress.unlocked, LEVEL_COUNT)
  const currentRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
  }, [reduce])
  const say = (text: string) => setToast({ id: Date.now(), text })

  return (
    <Chrome theme={MAP_THEME} name="Journey" motion="flip" heat={0} letters={[]} reduce ink="#fff">
      <main className="intro journey">
        <header className="topbar">
          <motion.button type="button" className="icon-btn" aria-label="Back to home" onClick={() => navigate('/')} whileTap={{ y: 3 }}>
            <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M10 2.5 4.5 8l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </motion.button>
          <span className="wordmark">
            WORD<span className="wordmark-x">X</span>
          </span>
          <span className="topbar-meta" />
          <span className="journey-score" aria-label={`${totalStars(progress)} of ${LEVEL_COUNT * 3} stars`}>
            ★ {totalStars(progress)}
            <span>/{LEVEL_COUNT * 3}</span>
          </span>
          <span className="journey-score journey-points" aria-label={`${totalPoints(progress)} points`}>
            {totalPoints(progress).toLocaleString()}
            <span> pts</span>
          </span>
        </header>
        <h1 className="intro-title journey-title">
          <PosterWord text="JOURNEY" delay={0.1} />
        </h1>
        <p className="journey-sub">
          {LEVEL_COUNT} levels in {STAGES.length} stages. Clear one to unlock the next. Play on Scholar for 1.6× points.
        </p>

        {STAGES.map((stage, si) => {
          const levels = LEVELS.filter((l) => l.n >= stage.from && l.n <= stage.to)
          const stageLocked = stage.from > progress.unlocked
          const stageStars = levels.reduce((a, l) => a + (progress.stars[l.n] ?? 0), 0)
          const ink = stage.ink === 'light' ? '#fff' : '#111'
          const points = levels.map((_, i) => ({ x: X[i % X.length], y: 60 + i * ROW }))
          const height = 60 + (levels.length - 1) * ROW + 110
          const path = points
            .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `C ${points[i - 1].x} ${points[i - 1].y + ROW / 2} ${p.x} ${p.y - ROW / 2} ${p.x} ${p.y}`))
            .join(' ')
          // How far along this stage's road you are, 0 → 1.
          const along = Math.min(1, Math.max(0, (current - stage.from) / (levels.length - 1)))
          return (
            <motion.section
              key={stage.id}
              className={`stage-block${stageLocked ? ' stage-locked' : ''}`}
              style={{ background: stage.bg, color: ink, ['--stage-bg' as string]: stage.bg }}
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 26, delay: 0.1 + si * 0.08 }}
              aria-label={`Stage ${si + 1}: ${stage.name}`}
            >
              <header className="stage-head">
                <span className="stage-kicker">
                  Stage {si + 1} · Levels {stage.from}–{stage.to}
                </span>
                <span className="stage-name">{stage.name}</span>
                <span className="stage-stars" aria-label={`${stageStars} of ${levels.length * 3} stars`}>
                  ★ {stageStars}/{levels.length * 3}
                </span>
                <span className="stage-blurb">{stageLocked ? `Clear level ${stage.from - 1} to open this stage` : stage.blurb}</span>
              </header>
              <div className="map" style={{ height }}>
                <svg className="map-path" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" aria-hidden="true">
                  <path d={path} fill="none" stroke={ink} strokeOpacity="0.3" strokeWidth="6" strokeLinecap="round" strokeDasharray="2 12" vectorEffect="non-scaling-stroke" />
                  {along > 0 && (
                    <motion.path
                      d={path}
                      fill="none"
                      stroke={ink}
                      strokeWidth="9"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: along }}
                      transition={{ duration: 1.1, ease: 'easeInOut', delay: 0.3 + si * 0.1 }}
                    />
                  )}
                </svg>
                {levels.map((def, i) => {
                  const rule = registry.get(def.ruleId)!
                  const locked = def.n > progress.unlocked
                  const isCurrent = def.n === current && !progress.stars[def.n]
                  const stars = progress.stars[def.n] ?? 0
                  const p = points[i]
                  return (
                    <div key={def.n} className="node-wrap" style={{ left: `${p.x}%`, top: p.y }}>
                      {isCurrent && (
                        <motion.span className="node-flag" animate={reduce ? undefined : { y: [0, -6, 0] }} transition={{ duration: 1.2, repeat: Infinity }}>
                          Play
                        </motion.span>
                      )}
                      <motion.button
                        ref={isCurrent ? currentRef : undefined}
                        type="button"
                        className={`node${locked ? ' node-locked' : ''}${isCurrent ? ' node-current' : ''}${stars ? ' node-done' : ''}`}
                        aria-label={`Level ${def.n}, ${def.title}, rule: ${rule.presentation.name}${locked ? ', locked' : stars ? `, ${stars} stars` : ''}`}
                        whileTap={{ y: 4 }}
                        onClick={() => (locked ? say(`Clear level ${def.n - 1} first`) : navigate(`/journey/${def.n}`))}
                      >
                        {locked ? (
                          <svg viewBox="0 0 16 16" width="24" height="24" aria-hidden="true">
                            <path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2" fill="none" stroke="currentColor" strokeWidth="2" />
                            <rect x="2.5" y="7" width="11" height="8" rx="2" fill="currentColor" />
                          </svg>
                        ) : (
                          <span className="node-n">{def.n}</span>
                        )}
                        {isCurrent && !reduce && <motion.span className="node-pulse" animate={{ scale: [1, 1.5], opacity: [0.7, 0] }} transition={{ duration: 1.6, repeat: Infinity }} />}
                      </motion.button>
                      <span className="node-label">
                        <strong>{def.title}</strong>
                        <span>
                          <i className="node-rule-dot" style={{ background: rule.presentation.theme.bg }} aria-hidden="true" />
                          Rule: {rule.presentation.name}
                          {progress.cleared[def.n] === 'scholar' && <em className="node-scholar">Scholar</em>}
                        </span>
                      </span>
                      {stars > 0 && <StarRow stars={stars} size={16} />}
                    </div>
                  )
                })}
              </div>
            </motion.section>
          )
        })}
        <p className="journey-foot">
          {LEVELS.reduce((n, d) => n + poolSize(d), 0).toLocaleString()} words across the {LEVEL_COUNT} levels, shuffled differently for every player.
        </p>
        <Credit className="credit-on-dark" />
      </main>
      <ToastHost toast={toast} onDone={() => setToast(null)} />
    </Chrome>
  )
}

/** One level: a fresh word for this player and attempt, played on the usual game screen. */
/** The difficulty an attempt was started on, if any guesses were made: it can't change mid-word. */
function startedOn(n: number, attempt: number): Difficulty | null {
  return DIFFICULTIES.map((d) => d.id).find((d) => (loadSession(levelPuzzleId(n, attempt, d))?.guesses.length ?? 0) > 0) ?? null
}

export function LevelScreen({ n }: { n: number }) {
  const def = levelDef(n)
  const [me] = useState(getMe)
  const [attempt, setAttempt] = useState(() => loadJourney().attempts[n] ?? 0)
  const started = startedOn(n, attempt)
  const [picked, setPicked] = useState<Difficulty>(loadDifficulty)
  const difficulty = started ?? picked
  const unlocked = loadJourney().unlocked >= n
  const game = useMemo(() => (def ? levelGame(def, attempt, me.id, difficulty) : null), [def, attempt, me.id, difficulty])
  // Easy's clues are a separate download, fetched only when someone plays on Easy.
  const [clues, setClues] = useState<Record<string, string> | null>(null)
  useEffect(() => {
    if (difficulty !== 'easy' || clues) return
    let live = true
    import('../../data/clues.generated').then((m) => live && setClues(m.CLUES))
    return () => {
      live = false
    }
  }, [difficulty, clues])

  useEffect(() => {
    if (!def || !unlocked) navigate('/journey', { replace: true })
  }, [def, unlocked])
  if (!def || !game || !unlocked) return null

  return (
    <GameScreen
      // Keyed on the attempt, not the difficulty: switching difficulty on the intro keeps the screen.
      key={`journey:${n}:${attempt}`}
      game={game}
      level={{
        def,
        isLast: n === LEVEL_COUNT,
        difficulty,
        clue: difficulty === 'easy' ? (clues?.[game.puzzle.answer.word] ?? undefined) : undefined,
        onDifficulty: started
          ? undefined
          : (d) => {
              saveDifficulty(d)
              setPicked(d)
            },
        // Saving bumps the attempt count, but this screen keeps its word until you choose to retry.
        onFinished: (state) => recordLevel(n, state, game.setup, difficulty),
        onNext: () => navigate(`/journey/${n + 1}`),
        onRetry: () => setAttempt(loadJourney().attempts[n] ?? 0),
      }}
    />
  )
}
