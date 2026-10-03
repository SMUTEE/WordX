import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { TIME_LIMITS } from '../../engine/engine'
import { ChunkyButton, PosterWord } from './Bits'

/** Off · 4 min · 5 min · 10 min, chosen before the first guess. */
export function TimerPicker({ value, onChange }: { value: number | null; onChange(m: number | null): void }) {
  const options: (number | null)[] = [null, ...TIME_LIMITS]
  return (
    <div className="timer-picker" role="radiogroup" aria-label="Timer">
      <span className="name-label">Timer</span>
      <div className="timer-options">
        {options.map((m) => (
          <button
            key={m ?? 'off'}
            type="button"
            role="radio"
            aria-checked={value === m}
            className={`timer-chip${value === m ? ' timer-on' : ''}`}
            onClick={() => onChange(m)}
          >
            {m ? `${m} min` : 'Off'}
          </button>
        ))}
      </div>
    </div>
  )
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

export function GiveUpPanel({ coop, onConfirm, onCancel }: { coop: boolean; onConfirm(): void; onCancel(): void }) {
  return (
    <div className="help">
      <span className="kicker">Stuck?</span>
      <PosterWord text="GIVE UP?" className="help-word" />
      <p className="help-tagline">We’ll show you the word.</p>
      <p className="result-note">{coop ? 'This ends the game for everyone and counts as a loss.' : 'This counts as a loss for this game.'}</p>
      <ChunkyButton onClick={onCancel} className="play-btn">
        Keep trying
      </ChunkyButton>
      <button type="button" className="link-btn" onClick={onConfirm}>
        Show me the word
      </button>
    </div>
  )
}
