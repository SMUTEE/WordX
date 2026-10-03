import { AnimatePresence, motion } from 'motion/react'
import { useId, useState } from 'react'
import type { PlayerView } from '../../net/protocol'
import { nameProblem } from '../../net/protocol'
import { share } from '../share'
import { POSTER } from '../theme'
import { ChunkyButton, PosterWord } from './Bits'
import { TimerPicker } from './Clock'

const playerColor = (seat: number) => POSTER[(seat + 1) % (POSTER.length - 1)]

export function NameField({ value, onChange, autoFocus }: { value: string; onChange(v: string): void; autoFocus?: boolean }) {
  const id = useId()
  const problem = value.trim() ? nameProblem(value) : null
  return (
    <label className="name-field" htmlFor={id}>
      <span className="name-label">Your name</span>
      <input
        id={id}
        className="name-input"
        value={value}
        maxLength={16}
        autoComplete="nickname"
        placeholder="Tolu"
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!problem}
        aria-describedby={problem ? `${id}-err` : undefined}
      />
      {problem && (
        <span className="name-error" id={`${id}-err`} role="alert">
          {problem}
        </span>
      )}
    </label>
  )
}

/** Everyone in the room: colour, initial, online dot, and a marker on whoever's turn it is. */
export function PlayersStrip({ players, turn, you }: { players: PlayerView[]; turn: string | null; you?: string }) {
  return (
    <ul className="players" aria-label="Players">
      {players.map((p) => {
        const active = p.id === turn
        return (
          <motion.li
            key={p.id}
            layout
            className={`player${active ? ' player-turn' : ''}${p.online ? '' : ' player-away'}`}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 22 }}
            aria-label={`${p.name}${p.id === you ? ' (you)' : ''}${p.online ? '' : ', away'}${active ? ', playing now' : ''}`}
          >
            <span className="player-dot" style={{ background: playerColor(p.seat) }} aria-hidden="true">
              {p.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="player-name">{p.id === you ? 'You' : p.name}</span>
            {active && <motion.span className="player-arrow" aria-hidden="true" animate={{ y: [0, -3, 0] }} transition={{ duration: 0.8, repeat: Infinity }} />}
          </motion.li>
        )
      })}
    </ul>
  )
}

/** "Your turn" or "Segun is playing…", with live dots. */
export function TurnStatus({ text, mine, onPass }: { text: string; mine: boolean; onPass?(): void }) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.div
        key={text}
        className={`turn-status${mine ? ' turn-mine' : ''}`}
        initial={{ y: -12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 12, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        role="status"
      >
        <span>{text}</span>
        {!mine && (
          <span className="dots" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <motion.i key={i} animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.18 }} />
            ))}
          </span>
        )}
        {mine && onPass && (
          <button type="button" className="link-btn turn-pass" onClick={onPass}>
            Let someone else go
          </button>
        )}
      </motion.div>
    </AnimatePresence>
  )
}

/** Share the room at any point: before you start or halfway through. */
export function InvitePanel({ code, onToast }: { code: string; onToast(t: string): void }) {
  const link = `${location.origin}/room/${code}`
  const send = async () => {
    const r = await share(`Play WordX with me. We take turns on one board. Code ${code}`, link)
    onToast(r === 'copied' ? 'Link copied' : r === 'shared' ? 'Invite sent' : 'Couldn’t share. Copy the code instead')
  }
  return (
    <div className="help">
      <span className="kicker">Invite friends</span>
      <PosterWord text="JOIN ME" className="help-word" />
      <p className="help-tagline">Send the link, or read out the code. Friends can join any time, even mid-game.</p>
      <div className="room-code" aria-label={`Game code ${code.split('').join(' ')}`}>
        {code.split('').map((c, i) => (
          <motion.span key={i} initial={{ y: -20, opacity: 0, rotate: -10 }} animate={{ y: 0, opacity: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 18, delay: i * 0.05 }}>
            {c}
          </motion.span>
        ))}
      </div>
      <ChunkyButton onClick={send} className="play-btn">
        Send invite link
      </ChunkyButton>
      <code className="relay-link">{link}</code>
    </div>
  )
}

interface RuleChoice {
  id: string
  name: string
  bg: string
}

export function CreateGamePanel({
  name,
  onName,
  rules,
  defaultRule,
  busy,
  onCreate,
}: {
  name: string
  onName(n: string): void
  rules: RuleChoice[]
  defaultRule: string
  busy: boolean
  onCreate(ruleId: string, minutes: number | null): void
}) {
  const [rule, setRule] = useState(defaultRule)
  const [minutes, setMinutes] = useState<number | null>(null)
  return (
    <div className="help">
      <span className="kicker">Play with friends</span>
      <PosterWord text="TEAM UP" className="help-word" />
      <p className="help-tagline">One board, one word. You take turns, and everyone sees every guess live.</p>
      <ol className="help-list">
        <li>Create a game and send the link.</li>
        <li>Whoever’s turn it is types; everyone else watches it happen.</li>
        <li>Crack it together before the tries run out.</li>
      </ol>
      <NameField value={name} onChange={onName} />
      <span className="kicker">Rule</span>
      <div className="practice">
        {rules.map((r) => (
          <button
            type="button"
            key={r.id}
            className={`practice-chip${r.id === rule ? ' practice-on' : ''}`}
            style={{ background: r.bg }}
            aria-pressed={r.id === rule}
            onClick={() => setRule(r.id)}
          >
            {r.name}
          </button>
        ))}
      </div>
      <TimerPicker value={minutes} onChange={setMinutes} />
      <ChunkyButton onClick={() => onCreate(rule, minutes)} className="play-btn">
        {busy ? 'Creating…' : 'Create game'}
      </ChunkyButton>
      <p className="result-note">Games with friends get their own word, so this drop stays unspoiled. They don’t count toward your solo stats.</p>
    </div>
  )
}

export function LeavePanel({ coop, onLeave, onStay }: { coop: boolean; onLeave(): void; onStay(): void }) {
  return (
    <div className="help">
      <span className="kicker">Leave this game</span>
      <PosterWord text="SURE?" className="help-word" />
      <p className="help-tagline">Are you sure you want to go back?</p>
      <p className="result-note">
        {coop
          ? 'Your friends can keep playing. If it’s your turn, it passes to the next person. Come back any time with the link.'
          : 'Your progress is saved. Pick this game up again from the home screen.'}
      </p>
      <ChunkyButton onClick={onStay} className="play-btn">
        Keep playing
      </ChunkyButton>
      <button type="button" className="link-btn" onClick={onLeave}>
        Yes, go back
      </button>
    </div>
  )
}
