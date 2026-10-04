import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Game } from '../../engine/engine'
import type { Me } from '../../net/identity'
import type { RoomApi } from '../../net/useRoom'
import { registry } from '../../rules'
import { ChunkyButton, Confetti, PosterWord, Sheet, ToastHost } from '../components/Bits'
import { Board } from '../components/Board'
import { InvitePanel, LeavePanel, PlayersStrip, TurnStatus } from '../components/Coop'
import { UsernameClaim } from '../components/Username'
import { Keyboard } from '../components/Keyboard'
import { ExampleRow, HelpPanel, HintBar, HintPanel, Legend, ResultPanel } from '../components/Panels'
import { PRESETS } from '../motion/presets'
import { navigate } from '../router'
import { hasSeenHelp, loadTimerPref, markSeenHelp, saveTimerPref } from '../storage'
import { Clock, GiveUpPanel, TimerPicker } from '../components/Clock'
import type { Difficulty, LevelDef } from '../../journey/levels'
import { ClueCard, DifficultyPicker } from '../components/Difficulty'
import type { GameState } from '../../engine/types'
import type { WordEntry } from '../../data/words'
import { inkColor, softInk } from '../theme'
import { useGame, type RemoteSource } from '../useGame'
import { roomToState } from '../../net/roomState'
import { joinNames } from '../format'
import { describeGuess } from '../announce'
import { Chrome, TopBar } from './Chrome'

export interface LevelProps {
  def: LevelDef
  isLast: boolean
  difficulty: Difficulty
  /** Set until the first guess; after that the difficulty is fixed for this word. */
  onDifficulty?(d: Difficulty): void
  /** Easy mode's clue to the word. */
  clue?: string
  onFinished(state: GameState): void
  onNext(): void
  onRetry(): void
}

export interface CoopProps {
  api: RoomApi
  me: Me
  /** Your claimed username, or null if you still need one before joining. */
  username: string | null
  onClaimed(): void
}

/** The game itself — the same screen for solo drops and co-op rooms. */
export interface DropProps {
  source: RemoteSource
  /** Sent by the server once the game is over. */
  answer?: WordEntry
}

export function GameScreen({ game, coop, level, drop }: { game: Game; coop?: CoopProps; level?: LevelProps; drop?: DropProps }) {
  const { rule, puzzle, setup } = game
  const p = rule.presentation
  const preset = PRESETS[p.motion]
  const reduce = useReducedMotion()
  const ink = inkColor(p.theme)

  // ----- Co-op wiring: whose turn, who's typing, the server's board -----
  const room = coop?.api.room
  const you = coop?.api.you
  const turnPlayer = room?.players.find((x) => x.id === room.turn)
  const myTurn = !!room && room.turn === you
  const connected = coop?.api.connection === 'open'
  const serverState = useMemo(() => (room ? roomToState(room, puzzle.id) : undefined), [room, puzzle.id])
  const remote: RemoteSource | undefined = coop
    ? {
        state: serverState,
        submit: coop.api.guess,
        hint: coop.api.hint,
        giveUp: coop.api.giveUp,
        onTyping: myTurn ? coop.api.sendTyping : undefined,
        lockedReason: !connected
          ? 'Reconnecting…'
          : room?.youGaveUp
            ? 'You gave up this game'
            : room?.waiting
            ? 'Waiting for a friend to join'
            : !myTurn
              ? turnPlayer
                ? `It’s ${turnPlayer.name}’s turn`
                : 'Waiting for players'
              : undefined,
      }
    : drop?.source

  const g = useGame(game, preset, { remote, onFinished: level?.onFinished })
  const answer = room?.answer ?? drop?.answer ?? puzzle.answer
  const [timerPick, setTimerPick] = useState(loadTimerPref)
  const home = level ? '/journey' : '/'
  const fresh = g.state.guesses.length === 0
  const [phase, setPhase] = useState<'intro' | 'play'>(g.state.status === 'playing' ? 'intro' : 'play')
  const [entering, setEntering] = useState(false)
  const [sheet, setSheet] = useState<'none' | 'result' | 'help' | 'invite' | 'leave' | 'giveup' | 'end'>(g.state.status === 'playing' ? 'none' : 'result')

  useEffect(() => {
    if (!g.finishedNow) return
    const t = window.setTimeout(() => setSheet('result'), g.state.status === 'won' ? 900 : 500)
    return () => window.clearTimeout(t)
  }, [g.finishedNow, g.state.status])

  // If friends finish the game while you're on the intro, skip straight to the board.
  const showIntro = phase === 'intro' && !(coop && g.state.status !== 'playing')

  const start = () => {
    if (coop && !coop.username) return g.say('Pick a username first so friends know who’s playing')
    if (!coop && fresh && g.state.status === 'playing') {
      saveTimerPref(timerPick)
      if (timerPick) g.startTimer(timerPick)
    }
    setEntering(true)
    setPhase('play')
    window.setTimeout(() => setEntering(false), 1600)
    if (!hasSeenHelp()) markSeenHelp()
  }

  const closeSheet = useCallback(() => setSheet('none'), [])
  // Settings like colour-blind mode change colours read at render; bump to redraw.
  const [, setSettingsTick] = useState(0)

  // Screen readers hear each guess once its reveal has played.
  const [announcement, setAnnouncement] = useState('')
  const announced = useRef(g.state.guesses.length)
  useEffect(() => {
    if (g.revealingRow !== null) return
    const n = g.display.guesses.length
    if (n <= announced.current) return
    announced.current = n
    const last = g.display.guesses[n - 1]
    const by = room ? room.guesses[n - 1] && (room.guesses[n - 1].playerId === you ? undefined : room.players.find((x) => x.id === room.guesses[n - 1].playerId)?.name) : undefined
    const outcome = g.state.status === 'won' ? ' Solved!' : g.state.status === 'lost' ? ` Out of tries. The word was ${answer.word}.` : ` ${setup.maxGuesses - n} tries left.`
    setAnnouncement(describeGuess(last, by) + outcome)
  }, [g.revealingRow, g.display.guesses, g.state.status, room, you, answer.word, setup.maxGuesses])
  const { say } = g
  const notice = coop?.api.notice
  useEffect(() => {
    if (notice) say(notice.text)
  }, [notice, say])
  const clearToast = useCallback(() => say(''), [say])
  // Leaving a game in progress always asks first.
  const quit = () => (g.state.status === 'playing' ? setSheet('leave') : navigate(home))
  const badge = level ? `Level ${level.def.n}` : coop ? 'With friends' : puzzle.preview ? 'Practice' : undefined
  const creatorName = room?.players.find((x) => x.id === room.creatorId)?.name
  const endLine =
    g.state.endReason === 'time'
      ? 'Time’s up. The word was'
      : g.state.endReason === 'gave-up'
        ? 'You gave up. The word was'
        : g.state.endReason === 'ended'
          ? `${room?.creatorId === you ? 'You' : (creatorName ?? 'The creator')} ended the game. The word was`
          : 'Out of tries. The word was'
  // Anyone can give up for themselves; only a friends game's creator can end it for everyone.
  const isCreator = !!room && room.creatorId === you
  const youGaveUp = !!room?.youGaveUp && g.state.status === 'playing'

  // Fog's mist thins as your best guess heats up.
  const heat = Math.max(0, ...g.display.guesses.map((x) => (x.feedback.kind === 'meter' ? x.feedback.value : 0)))
  const hintLetters = setup.hint?.kind === 'letters' ? setup.hint.letters : [...p.name.toUpperCase()]
  const done = g.state.status !== 'playing' && g.revealingRow === null
  const lastTry = g.state.status === 'playing' && g.state.guesses.length === setup.maxGuesses - 1
  const guessNo = Math.min(g.state.guesses.length + (g.state.status === 'playing' ? 1 : 0), setup.maxGuesses)
  const practice = registry.all().map((r) => ({ id: r.id, name: r.presentation.name, bg: r.presentation.theme.bg }))

  // While a friend types, their letters show in the open row.
  const watching = !!coop && !myTurn && g.state.status === 'playing'
  const typing = coop?.api.typing
  const ghost = watching && typing && typing.playerId === room?.turn ? typing.letters : null
  const current = ghost ? Array.from({ length: setup.length }, (_, i) => g.locks[i] ?? ghost[i] ?? '') : g.current
  const nameOf = (id: string) => (id === you ? 'You' : (room?.players.find((x) => x.id === id)?.name ?? '?'))
  const rowLabels = room?.guesses.map((x) => nameOf(x.playerId))
  const othersOnline = room?.players.some((x) => x.id !== you && x.online) ?? false
  // "You and Segun", with you first.
  const crewText = room ? joinNames([...room.players].sort((a, b) => Number(b.id === you) - Number(a.id === you)).map((x) => (x.id === you ? 'you' : x.name))) : ''
  const crew = crewText.charAt(0).toUpperCase() + crewText.slice(1)

  const turnText = !connected
    ? 'Reconnecting…'
    : room?.waiting
      ? 'Waiting for a friend to join'
      : myTurn
        ? othersOnline
          ? 'Your turn'
          : 'Your turn. Your friend has stepped away'
        : turnPlayer
          ? `${turnPlayer.name} is playing`
          : 'Waiting for players'

  return (
    <Chrome theme={p.theme} name={p.name} motion={p.motion} heat={heat} letters={hintLetters} reduce={!!reduce} ink={ink}>
      <LayoutGroup>
        <AnimatePresence mode="popLayout">
          {showIntro ? (
            <motion.main key="intro" className="intro" exit={{ opacity: 0, y: 40, transition: { duration: 0.3 } }}>
              <TopBar puzzleNo={puzzle.number} slot={puzzle.slot} badge={badge} onBack={() => navigate(home)} />
              <motion.span className="kicker" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
                {level ? `Level ${level.def.n} · ${level.def.title} · the rule is` : coop ? 'Team game · today’s rule is' : 'Today’s rule is'}
              </motion.span>
              <motion.h1 layoutId="rule-title" className="intro-title">
                <PosterWord text={p.name.toUpperCase()} delay={0.45} />
              </motion.h1>
              <motion.div className="rule thick" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.75, duration: 0.6, ease: [0.7, 0, 0.2, 1] }} />
              <motion.p className="intro-tagline" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}>
                {p.tagline}
              </motion.p>
              <motion.p className="rule-explainer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.0 }}>
                <strong>{p.name}</strong> is the rule for this game. It changes how you play. It’s not a clue to the word.
              </motion.p>
              {coop && (
                <motion.div className="relay-card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1 }}>
                  {room && room.players.length > 0 ? (
                    <>
                      <p className="relay-card-text">
                        {room.guesses.length
                          ? `${room.guesses.length} of ${setup.maxGuesses} tries used so far.`
                          : 'Nobody has guessed yet.'}{' '}
                        Take turns; everyone sees every guess live.
                      </p>
                      <PlayersStrip players={room.players} turn={room.turn} you={you} />
                    </>
                  ) : (
                    <p className="relay-card-text">You’re first in. Start playing, then invite friends any time.</p>
                  )}
                  {coop.username ? (
                    <p className="playing-as">
                      Playing as <strong>@{coop.username}</strong>
                    </p>
                  ) : (
                    <UsernameClaim cta="Claim username" onClaimed={coop.onClaimed} />
                  )}
                </motion.div>
              )}
              {!coop && (
                <ol className="intro-steps">
                  {p.instructions.map((t, i) => (
                    <motion.li key={t} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.0 + i * 0.08, type: 'spring', stiffness: 300, damping: 24 }}>
                      <span className="step-n">{i + 1}</span>
                      {t}
                    </motion.li>
                  ))}
                </ol>
              )}
              <motion.div
                className="example-card"
                initial={{ opacity: 0, y: 30, rotate: 3 }}
                animate={{ opacity: 1, y: 0, rotate: -1 }}
                transition={{ delay: 1.25, type: 'spring', stiffness: 260, damping: 18 }}
              >
                <span className="example-kicker">For example</span>
                <ExampleRow word={p.example.word} feedback={p.example.feedback} preset={preset} />
                <span className="example-caption">{p.example.caption}</span>
              </motion.div>
              {level && (
                <motion.ul className="level-spec" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.3 }} aria-label="This level">
                  <li>{level.def.words}</li>
                  <li>{setup.length} letters</li>
                  <li>{setup.maxGuesses} tries</li>
                  <li>{setup.maxHints ? `${setup.maxHints} hint${setup.maxHints > 1 ? 's' : ''}` : 'No hints'}</li>
                </motion.ul>
              )}
              {level?.onDifficulty && fresh && g.state.status === 'playing' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.3 }}>
                  <DifficultyPicker value={level.difficulty} onChange={level.onDifficulty} />
                </motion.div>
              )}
              {!coop && fresh && g.state.status === 'playing' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.35 }}>
                  <TimerPicker value={timerPick} onChange={setTimerPick} />
                </motion.div>
              )}
              <motion.div className="intro-cta" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.4, type: 'spring', stiffness: 300, damping: 22 }}>
                <ChunkyButton onClick={start} className="play-btn">
                  {coop ? (fresh ? 'Start playing' : 'Join the game') : fresh ? 'Play' : `Continue · ${setup.maxGuesses - g.state.guesses.length} tries left`}
                </ChunkyButton>
                <span className="intro-meta">
                  {setup.length}-letter word · {setup.maxGuesses} tries{coop ? ' shared' : ''} · words that aren’t accepted don’t use a try
                </span>
              </motion.div>
            </motion.main>
          ) : (
            <motion.main key="play" className="game" initial={{ opacity: 1 }}>
              <TopBar
                puzzleNo={puzzle.number}
                slot={puzzle.slot}
                badge={badge}
                onBack={quit}
                onHelp={() => setSheet('help')}
                onStats={() => setSheet('result')}
                onInvite={coop ? () => setSheet('invite') : undefined}
              />
              <div className="title-row">
                <motion.h1 layoutId="rule-title" className="game-title" aria-label={`Rule: ${p.name}`}>
                  <span className="rule-label" aria-hidden="true">
                    {level ? `Level ${level.def.n} · rule` : 'Today’s rule'}
                  </span>
                  {p.name.toUpperCase()}
                </motion.h1>
                <span
                  className={`guess-pill${lastTry ? ' guess-pill-last' : ''}${done ? ` guess-pill-${g.state.status}` : ''}`}
                  aria-label={done ? `${g.state.status === 'won' ? 'Solved' : 'Out of tries'}, ${guessNo} of ${setup.maxGuesses}` : `Try ${guessNo} of ${setup.maxGuesses}`}
                >
                  <span className="pill-label">
                    {done
                      ? g.state.status === 'won'
                        ? 'Solved'
                        : g.state.endReason === 'gave-up'
                          ? 'Gave up'
                          : g.state.endReason === 'time'
                            ? 'Time'
                            : g.state.endReason === 'ended'
                              ? 'Ended'
                              : 'Out'
                      : lastTry
                        ? 'Last'
                        : 'Try'}
                  </span>
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span key={guessNo} initial={{ y: -18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 18, opacity: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 26 }}>
                      {guessNo}
                    </motion.span>
                  </AnimatePresence>
                  <span className="pill-of">/ {setup.maxGuesses}</span>
                </span>
              </div>
              {g.state.deadline && g.state.timeLimit && (
                <div className="clock-row">
                  <Clock deadline={g.state.deadline} limit={g.state.timeLimit} offset={coop?.api.clockOffset} running={g.state.status === 'playing'} />
                </div>
              )}
              <motion.div className="rule thick" initial={entering ? { scaleX: 0 } : false} animate={{ scaleX: 1 }} transition={{ delay: 0.25, duration: 0.5 }} />
              {coop && room && (
                <div className="coop-bar">
                  <PlayersStrip players={room.players} turn={room.turn} you={you} />
                  {g.state.status === 'playing' && (
                    <div className="turn-row">
                      <TurnStatus text={turnText} mine={myTurn && connected} onPass={myTurn && othersOnline ? coop.api.pass : undefined} />
                      {room.turnDeadline && room.turnLimit && !room.waiting && (
                        <Clock deadline={room.turnDeadline} limit={room.turnLimit} offset={coop.api.clockOffset} running />
                      )}
                    </div>
                  )}
                  {room.waiting && g.state.status === 'playing' && (
                    <ChunkyButton onClick={() => setSheet('invite')} className="waiting-invite">
                      Invite a friend to start
                    </ChunkyButton>
                  )}
                </div>
              )}
              <div className="status-slot">
                <Legend items={p.legend} entering={entering} />
                {sheet === 'none' && <ToastHost className="toast-inline" toast={g.toast} onDone={clearToast} />}
              </div>
              {level?.clue && g.state.status === 'playing' && <ClueCard clue={level.clue} />}
              {g.state.status === 'playing' && <HintBar hints={g.hints} status={g.hintStatus} onHint={g.takeHint} />}
              <HintPanel hint={setup.hint} typed={g.current.filter((_, i) => !g.locks[i])} onLetter={g.onKey} />
              <Board
                setup={setup}
                guesses={g.state.guesses}
                current={current}
                currentLocks={g.locks}
                playing={g.state.status === 'playing'}
                revealingRow={g.revealingRow}
                celebrateRow={g.celebrateRow}
                shakeNonce={g.shakeNonce}
                entering={entering}
                preset={preset}
                emptyBorder={softInk(p.theme)}
                rowLabels={rowLabels}
                ghost={!!ghost}
                onTileTap={g.clearAt}
              />
              {youGaveUp && g.revealingRow === null ? (
                <motion.div className="done-bar" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
                  <p className="done-line">
                    You gave up. The word is
                    <strong className="done-answer">{answer.word}</strong>
                  </p>
                  <p className="result-note watching-note">Your friends are still playing. Keep it to yourself!</p>
                  {isCreator && (
                    <button type="button" className="link-btn give-up" onClick={() => setSheet('end')}>
                      End game for everyone
                    </button>
                  )}
                </motion.div>
              ) : g.state.status === 'playing' || g.revealingRow !== null ? (
                <div className={`keyboard-wrap${g.locked ? ' keyboard-locked' : ''}`}>
                  <Keyboard states={g.keyStates} onKey={g.onKey} onEnter={g.onEnter} onBack={g.onBack} shake={g.keyShake} entering={entering} disabledBorder={softInk(p.theme)} />
                  {g.state.status === 'playing' && !(coop && room?.waiting) && (
                    <div className="quit-links">
                      <button type="button" className="link-btn give-up" onClick={() => setSheet('giveup')}>
                        I give up
                      </button>
                      {isCreator && (
                        <button type="button" className="link-btn give-up" onClick={() => setSheet('end')}>
                          End game
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <motion.div className="done-bar" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
                  <p className="done-line">
                    {g.state.status === 'won'
                      ? coop
                        ? `Solved together in ${g.state.guesses.length} of ${setup.maxGuesses} tries.`
                        : `Solved in ${g.state.guesses.length} of ${setup.maxGuesses} tries.`
                      : endLine}
                    {g.state.status === 'lost' && <strong className="done-answer">{answer.word}</strong>}
                  </p>
                  <div className="done-actions">
                    <ChunkyButton onClick={() => setSheet('result')} variant="paper">
                      See results
                    </ChunkyButton>
                    <button type="button" className="link-btn" onClick={() => navigate(home)}>
                      {level ? 'Back to the map' : 'Back to home'}
                    </button>
                  </div>
                </motion.div>
              )}
            </motion.main>
          )}
        </AnimatePresence>
      </LayoutGroup>

      <p className="sr-only" aria-live="polite" role="status">
        {announcement}
      </p>
      {(phase === 'intro' || sheet !== 'none') && <ToastHost toast={g.toast} onDone={clearToast} />}
      {g.finishedNow && g.state.status === 'won' && <Confetti seed={puzzle.seed} />}
      <Sheet open={sheet === 'result'} onClose={closeSheet} label="Results">
        <ResultPanel
          game={game}
          answer={room?.answer ?? drop?.answer}
          state={g.state}
          stats={g.stats}
          preset={preset}
          onToast={g.say}
          team={coop && room ? { crew, link: `${location.origin}/room/${room.code}` } : undefined}
          level={level ? { n: level.def.n, isLast: level.isLast, difficulty: level.difficulty, onNext: level.onNext, onRetry: level.onRetry, onMap: () => navigate('/journey') } : undefined}
          onHome={() => navigate('/')}
          onJourney={drop ? () => navigate('/journey') : undefined}
        />
      </Sheet>
      <Sheet open={sheet === 'help'} onClose={closeSheet} label="How to play">
        <HelpPanel game={game} preset={preset} rules={practice} onSettings={() => setSettingsTick((n) => n + 1)} />
      </Sheet>
      {coop && room && (
        <Sheet open={sheet === 'invite'} onClose={closeSheet} label="Invite friends">
          <InvitePanel code={room.code} onToast={g.say} />
        </Sheet>
      )}
      <Sheet open={sheet === 'leave'} onClose={closeSheet} label="Leave game">
        <LeavePanel coop={!!coop} onLeave={() => navigate(home)} onStay={closeSheet} />
      </Sheet>
      <Sheet open={sheet === 'giveup'} onClose={closeSheet} label="Give up">
        <GiveUpPanel
          mode={coop ? 'self' : 'solo'}
          onCancel={closeSheet}
          onConfirm={() => {
            closeSheet()
            g.giveUp()
          }}
        />
      </Sheet>
      {coop && (
        <Sheet open={sheet === 'end'} onClose={closeSheet} label="End game">
          <GiveUpPanel
            mode="end"
            onCancel={closeSheet}
            onConfirm={() => {
              closeSheet()
              coop.api.endGame()
            }}
          />
        </Sheet>
      )}
    </Chrome>
  )
}
