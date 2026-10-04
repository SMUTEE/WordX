import { motion } from 'motion/react'
import { DIFFICULTIES, type Difficulty } from '../../journey/levels'

/** Easy (a clue up front) or Scholar (no clue, 1.6× points), chosen before the first guess. */
export function DifficultyPicker({ value, onChange }: { value: Difficulty; onChange(d: Difficulty): void }) {
  return (
    <div className="difficulty" role="radiogroup" aria-label="How do you want to play?">
      <span className="name-label">How do you want to play?</span>
      <div className="difficulty-options">
        {DIFFICULTIES.map((d) => (
          <motion.button
            key={d.id}
            type="button"
            role="radio"
            aria-checked={value === d.id}
            className={`difficulty-card${value === d.id ? ' difficulty-on' : ''}`}
            onClick={() => onChange(d.id)}
            whileTap={{ y: 3 }}
          >
            <strong>{d.name}</strong>
            <span>{d.blurb}</span>
          </motion.button>
        ))}
      </div>
    </div>
  )
}

/** Easy mode's clue, shown above the board for the whole game. */
export function ClueCard({ clue }: { clue: string }) {
  return (
    <motion.div className="clue-card" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} role="note" aria-label={`Clue: ${clue}`}>
      <span className="clue-kicker">Clue</span>
      <span className="clue-text">{clue}</span>
    </motion.div>
  )
}
