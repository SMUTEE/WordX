import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import type { Game } from '../../engine/engine'
import { msUntilNextDrop } from '../../engine/schedule'
import { LEVEL_COUNT, levelDef } from '../../journey/levels'
import { journeyComplete, loadJourney, totalStars } from '../../journey/progress'
import { getMe, saveMe } from '../../net/identity'
import { normalizeCode, ROOM_CODE_LENGTH } from '../../net/protocol'
import { checkRoom, createRoom } from '../../net/useRoom'
import { registry } from '../../rules'
import { ChunkyButton, PosterWord, Sheet, ToastHost } from '../components/Bits'
import { CreateGamePanel, NameField } from '../components/Coop'
import { HelpPanel, ResultPanel } from '../components/Panels'
import { formatDrop } from '../format'
import { PRESETS } from '../motion/presets'
import { navigate } from '../router'
import { hasOnboarded, loadSession, loadStats, markOnboarded, streakSummary } from '../storage'
import type { Toast } from '../useGame'
import { Chrome } from './Chrome'

/** WordX's own look, so the home page never wears a single rule's colours. */
const HOME_THEME = { bg: '#F4F1EA', ink: 'dark' as const }

function useDropCountdown() {
  const [ms, setMs] = useState(msUntilNextDrop)
  useEffect(() => {
    const t = window.setInterval(() => setMs(msUntilNextDrop()), 1000)
    return () => window.clearInterval(t)
  }, [])
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}:${String(s % 60).padStart(2, '0')}`
}

const NextTag = () => <span className="next-tag">Up next</span>

function greeting(name: string) {
  const h = new Date().getHours()
  const part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  return name ? `${part}, ${name}` : part
}

/** Home: your streak, what to play next, and the three ways to play. */
export function Home({ game }: { game: Game }) {
  const { rule, puzzle, setup } = game
  const drop = rule.presentation
  const countdown = useDropCountdown()
  const [me, setMe] = useState(getMe)
  const [sheet, setSheet] = useState<'none' | 'welcome' | 'create' | 'help' | 'stats' | 'profile'>(() => (hasOnboarded() ? 'none' : 'welcome'))
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const say = (text: string) => setToast(text ? { id: Date.now(), text } : null)

  const streak = streakSummary()
  const session = loadSession(puzzle.id)
  const dropDone = !!session && session.status !== 'playing'
  const dropStatus =
    session?.status === 'won'
      ? `Solved in ${session.guesses.length}`
      : session?.status === 'lost'
        ? 'Played'
        : session?.guesses.length
          ? `Try ${session.guesses.length + 1} of ${setup.maxGuesses}`
          : 'New'
  const journey = loadJourney()
  const atLevel = Math.min(journey.unlocked, LEVEL_COUNT)
  const nextLevel = levelDef(atLevel)
  const journeyStatus = journeyComplete(journey) ? `Complete · ★ ${totalStars(journey)}` : `Level ${atLevel} of ${LEVEL_COUNT}`
  // The one thing to do next: an unplayed drop first (it expires), otherwise the Journey.
  const next: 'drop' | 'journey' = dropDone ? 'journey' : 'drop'

  const updateName = (name: string) => {
    const nextMe = { ...me, name }
    setMe(nextMe)
    saveMe({ ...nextMe, name: name.trim() })
  }

  const finishWelcome = () => {
    markOnboarded()
    setSheet('none')
  }

  const create = async (ruleId: string, minutes: number | null) => {
    if (!me.name.trim()) return say('Add your name so friends know who’s playing')
    setBusy(true)
    const r = await createRoom(ruleId, minutes)
    setBusy(false)
    if ('error' in r) return say(r.error)
    navigate(`/room/${r.code}`)
  }

  const join = async () => {
    const c = normalizeCode(code)
    if (c.length !== ROOM_CODE_LENGTH) return say(`Codes are ${ROOM_CODE_LENGTH} letters and numbers`)
    setBusy(true)
    const r = await checkRoom(c)
    setBusy(false)
    if ('error' in r) return say(r.error)
    navigate(`/room/${c}`)
  }

  const rules = registry
    .all()
    .filter((r) => r.id !== 'liar')
    .map((r) => ({ id: r.id, name: r.presentation.name, bg: r.presentation.theme.bg }))
  const practice = registry.all().map((r) => ({ id: r.id, name: r.presentation.name, bg: r.presentation.theme.bg }))
  const rise = (delay: number) => ({ initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 }, transition: { delay, type: 'spring' as const, stiffness: 300, damping: 24 } })

  return (
    <Chrome theme={HOME_THEME} name="WordX" motion="flip" heat={0} letters={[]} reduce ink="#111">
      <main className="intro home">
        <header className="topbar">
          <span className="wordmark home-mark">
            WORD<span className="wordmark-x">X</span>
          </span>
          <span className="topbar-meta" />
          <span className="topbar-actions">
            <motion.button type="button" className="icon-btn" aria-label="How to play" onClick={() => setSheet('help')} whileTap={{ y: 3 }}>
              ?
            </motion.button>
            <motion.button type="button" className="icon-btn avatar-btn" aria-label="Your profile" onClick={() => setSheet('profile')} whileTap={{ y: 3 }}>
              {me.name.trim() ? (
                me.name.trim()[0].toUpperCase()
              ) : (
                <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
                  <circle cx="8" cy="5.5" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
                  <path d="M2.5 14.5c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              )}
            </motion.button>
          </span>
        </header>

        <motion.span className="kicker home-kicker" {...rise(0.15)}>
          {greeting(me.name.trim())}
        </motion.span>
        <h1 className="intro-title home-title">
          <PosterWord text="PLAY" delay={0.2} />
        </h1>

        <motion.button type="button" className="streak-card" onClick={() => setSheet('stats')} {...rise(0.35)} aria-label={`${streak.current} day streak. See your stats`}>
          <span className="streak-main">
            <span className={`streak-flame${streak.playedToday ? ' streak-lit' : ''}`} aria-hidden="true">
              <svg viewBox="0 0 16 20" width="30" height="38">
                <path d="M8 1c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-4 3-6 0 2 1 3 2 3 0-3-1-5 1-8z" fill="currentColor" />
              </svg>
            </span>
            <span className="streak-num">{streak.current}</span>
            <span className="streak-label">
              day streak
              <small>{streak.current === 0 ? 'Finish any game to start one' : streak.playedToday ? 'You’ve played today' : 'Play today to keep it'}</small>
            </span>
          </span>
          <span className="streak-week" aria-label="This week">
            {streak.week.map((d) => (
              <span key={d.day} className={`week-day${d.played ? ' week-on' : ''}${d.today ? ' week-today' : ''}`}>
                <i />
                {d.label}
              </span>
            ))}
          </span>
          <span className="streak-facts">
            <span>
              <strong>{streak.best}</strong> best
            </span>
            <span>
              <strong>{streak.totalPlayed}</strong> played
            </span>
            <span>
              <strong>{totalStars(journey)}</strong> ★
            </span>
          </span>
        </motion.button>

        <div className="modes">
          <motion.button
            type="button"
            className={`mode-card mode-drop${next === 'drop' ? ' mode-next' : ''}`}
            style={{ background: drop.theme.bg, color: drop.theme.ink === 'light' ? '#fff' : '#111' }}
            onClick={() => navigate('/play')}
            {...rise(0.45)}
            whileTap={{ y: 4 }}
          >
            {next === 'drop' && <NextTag />}
            <span className="mode-top">
              <span className="mode-name">Daily drop</span>
              <span className="mode-status">{dropStatus}</span>
            </span>
            <span className="mode-desc">
              This drop’s rule is <strong>{drop.name}</strong>. Same word for everyone. New one in {countdown}.
            </span>
            <span className="mode-go" aria-hidden="true">
              →
            </span>
          </motion.button>
          <motion.button type="button" className={`mode-card mode-journey${next === 'journey' ? ' mode-next' : ''}`} onClick={() => navigate('/journey')} {...rise(0.52)} whileTap={{ y: 4 }}>
            {next === 'journey' && <NextTag />}
            <span className="mode-top">
              <span className="mode-name">Journey</span>
              <span className="mode-status">{journeyStatus}</span>
            </span>
            <span className="mode-desc">
              {journeyComplete(journey) ? `All ${LEVEL_COUNT} levels cleared. Replay for 3 stars.` : `Next: ${nextLevel?.title}. ${LEVEL_COUNT} levels, each harder than the last.`}
            </span>
            <span className="mode-go" aria-hidden="true">
              →
            </span>
          </motion.button>
          <motion.button type="button" className="mode-card mode-friends" onClick={() => setSheet('create')} {...rise(0.59)} whileTap={{ y: 4 }}>
            <span className="mode-top">
              <span className="mode-name">With friends</span>
              <span className="mode-status mode-live">Live</span>
            </span>
            <span className="mode-desc">Take turns on one board and watch each other play.</span>
            <span className="mode-go" aria-hidden="true">
              →
            </span>
          </motion.button>
        </div>

        <motion.form
          className="join"
          {...rise(0.66)}
          onSubmit={(e) => {
            e.preventDefault()
            join()
          }}
        >
          <label className="name-label" htmlFor="join-code">
            Got a code from a friend?
          </label>
          <div className="join-row">
            <input
              id="join-code"
              className="name-input join-input"
              value={code}
              onChange={(e) => setCode(normalizeCode(e.target.value))}
              placeholder="K7QPM2"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
            />
            <ChunkyButton type="submit" className="join-btn" aria-label="Join game">
              {busy && sheet === 'none' ? '…' : 'Join'}
            </ChunkyButton>
          </div>
        </motion.form>
        <p className="home-foot">
          Drop {puzzle.number} · started {formatDrop(puzzle.slot)}
        </p>
      </main>

      <ToastHost toast={toast} onDone={() => setToast(null)} />
      <Sheet open={sheet === 'welcome'} onClose={finishWelcome} label="Welcome">
        <div className="help">
          <span className="kicker">Welcome to WordX</span>
          <PosterWord text="HELLO" className="help-word" />
          <p className="help-tagline">You know how to play. You don’t know the rule.</p>
          <ol className="help-list">
            <li>Guess the hidden word. Colours tell you how close you are.</li>
            <li>Every 6 hours a new drop arrives with a new rule.</li>
            <li>Climb the Journey, or play live with friends.</li>
          </ol>
          <NameField value={me.name} onChange={updateName} />
          <p className="result-note">A first name or nickname. Friends you play with see it, and it stays on this device.</p>
          <ChunkyButton onClick={finishWelcome} className="play-btn">
            {me.name.trim() ? `Let’s go, ${me.name.trim()}` : 'Let’s go'}
          </ChunkyButton>
          <button type="button" className="link-btn" onClick={finishWelcome}>
            Skip for now
          </button>
        </div>
      </Sheet>
      <Sheet open={sheet === 'profile'} onClose={() => setSheet('none')} label="Your profile">
        <div className="help">
          <span className="kicker">Your profile</span>
          <PosterWord text={(me.name.trim() || 'You').toUpperCase().slice(0, 10)} className="help-word" />
          <NameField value={me.name} onChange={updateName} />
          <div className="stat-grid">
            {[
              ['Streak', streak.current],
              ['Best', streak.best],
              ['Played', streak.totalPlayed],
              ['Stars', totalStars(journey)],
            ].map(([label, value]) => (
              <div className="stat" key={label}>
                <span className="stat-value">{value}</span>
                <span className="stat-label">{label}</span>
              </div>
            ))}
          </div>
          <p className="result-note">Your progress is saved on this device.</p>
        </div>
      </Sheet>
      <Sheet open={sheet === 'create'} onClose={() => setSheet('none')} label="Play with friends">
        <CreateGamePanel name={me.name} onName={updateName} rules={rules} defaultRule={rule.id === 'liar' ? 'standard' : rule.id} busy={busy} onCreate={create} />
      </Sheet>
      <Sheet open={sheet === 'help'} onClose={() => setSheet('none')} label="How to play">
        <HelpPanel game={game} preset={PRESETS[drop.motion]} rules={practice} />
      </Sheet>
      <Sheet open={sheet === 'stats'} onClose={() => setSheet('none')} label="Stats">
        <ResultPanel game={game} state={session ?? game.newState()} stats={loadStats()} preset={PRESETS[drop.motion]} onToast={say} />
      </Sheet>
    </Chrome>
  )
}
