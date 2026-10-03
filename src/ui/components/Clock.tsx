import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { TIME_LIMITS } from '../../engine/engine'
import { ChunkyButton, PosterWord } from './Bits'

/** A row of chips to pick one option, e.g. a time limit. */
export function ChoicePicker<T extends number | null>({
  label,
  value,
  options,
  format,
  onChange,
}: {
  label: string
  value: T
  options: readonly T[]
  format(v: T): string
  onChange(v: T): void
}) {
  return (
    <div className="timer-picker" role="radiogroup" aria-label={label}>
      <span className="name-label">{label}</span>
      <div className="timer-options">
        {options.map((m) => (
          <button key={String(m)} type="button" role="radio" aria-checked={value === m} className={`timer-chip${value === m ? ' timer-on' : ''}`} onClick={() => onChange(m)}>
            {format(m)}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Off · 4 min · 5 min · 10 min, chosen before the first guess. */
export function TimerPicker({ value, onChange, label = 'Timer' }: { value: number | null; onChange(m: number | null): void; label?: string }) {
  return <ChoicePicker label={label} value={value} options={[null, ...TIME_LIMITS]} format={(m) => (m ? `${m} min` : 'Off')} onChange={onChange} />
}

const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Countdown next to the try counter; the last 30 seconds pulse red. */
export function Clock({ deadline, limit, offset = 0, running }: { deadline: number; limit: number; offset?: number; running: boolean }) {
  const [now, setNow] = useState(() => Date.now() + offset)
  useEffect(() => {
    if (!running) return
    const t = window.setInterval(() => setNow(Date.now() + offset), 250)
    return () => window.clearInterval(t)
  }, [running, offset])
  const left = Math.max(0, deadline - now)
  const urgent = running && left <= 30_000
  const progress = limit ? left / limit : 0
  return (
    <motion.span
      className={`clock${urgent ? ' clock-urgent' : ''}`}
      role="timer"
      aria-label={`${fmt(left)} left`}
      animate={urgent ? { scale: [1, 1.08, 1] } : { scale: 1 }}
      transition={urgent ? { duration: 1, repeat: Infinity } : undefined}
    >
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
        <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
        <circle
          cx="10"
          cy="10"
          r="8"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeDasharray={`${progress * 50.27} 50.27`}
          strokeLinecap="round"
          transform="rotate(-90 10 10)"
        />
      </svg>
      {fmt(left)}
    </motion.span>
  )
}

/** Confirming giving up (solo, or just yourself in a friends game) or ending a friends game for everyone. */
export function GiveUpPanel({ mode, onConfirm, onCancel }: { mode: 'solo' | 'self' | 'end'; onConfirm(): void; onCancel(): void }) {
  const copy = {
    solo: { kicker: 'Stuck?', title: 'GIVE UP?', line: 'We’ll show you the word.', note: 'This counts as a loss for this game.', confirm: 'Show me the word' },
    self: { kicker: 'Stuck?', title: 'GIVE UP?', line: 'You’ll see the word and sit out.', note: 'Your friends keep playing, and you can keep watching. Don’t spoil it!', confirm: 'Give up and show me the word' },
    end: { kicker: 'You made this game', title: 'END GAME?', line: 'It ends for everyone, and we’ll show the word.', note: 'Only you can end it, because you created it.', confirm: 'End the game for everyone' },
  }[mode]
  return (
    <div className="help">
      <span className="kicker">{copy.kicker}</span>
      <PosterWord text={copy.title} className="help-word" />
      <p className="help-tagline">{copy.line}</p>
      <p className="result-note">{copy.note}</p>
      <ChunkyButton onClick={onCancel} className="play-btn">
        Keep playing
      </ChunkyButton>
      <button type="button" className="link-btn" onClick={onConfirm}>
        {copy.confirm}
      </button>
    </div>
  )
}
