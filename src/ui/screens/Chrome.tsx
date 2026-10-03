import { motion } from 'motion/react'
import { useEffect, type ReactNode } from 'react'
import type { MotionPresetId, RulePresentation } from '../../engine/types'
import { Ambient } from '../motion/Ambient'
import { softInk } from '../theme'
import { formatDrop } from '../format'

/** The poster stage every screen sits on: the rule's colour, its ambient world, side posters. */
export function Chrome(props: {
  theme: RulePresentation['theme']
  name: string
  motion: MotionPresetId
  heat: number
  letters: string[]
  reduce: boolean
  ink: string
  children: ReactNode
}) {
  const { theme, name, heat, letters, reduce, ink, children } = props
  // Sheets and the browser chrome take the rule's colour too.
  useEffect(() => {
    document.documentElement.style.setProperty('--bg', theme.bg)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.bg)
    document.title = name === 'WordX' ? 'WordX' : `WordX · ${name}`
  }, [theme.bg, name])
  return (
    <div className={`stage ink-${theme.ink}`} style={{ ['--ink' as string]: ink, ['--soft' as string]: softInk(theme), ['--chars' as string]: name.length }}>
      <motion.div
        className="stage-bg"
        style={{ background: theme.bg }}
        initial={reduce ? false : { clipPath: 'circle(0% at 50% 100%)' }}
        animate={{ clipPath: 'circle(150% at 50% 100%)' }}
        transition={{ duration: 0.9, ease: [0.7, 0, 0.2, 1] }}
      />
      {!reduce && <Ambient preset={props.motion} ink={theme.ink} heat={heat} letters={letters} name={name} />}
      <SidePoster name={name} />
      {children}
    </div>
  )
}

function SidePoster({ name }: { name: string }) {
  const word = `${name.toUpperCase()} `.repeat(4)
  return (
    <div className="side-poster" aria-hidden="true">
      <motion.span className="side-word side-left" animate={{ y: ['0%', '-50%'] }} transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}>
        {word}
        {word}
      </motion.span>
      <motion.span className="side-word side-right" animate={{ y: ['-50%', '0%'] }} transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}>
        {word}
        {word}
      </motion.span>
    </div>
  )
}

const IconBtn = ({ label, onClick, children }: { label: string; onClick(): void; children: ReactNode }) => (
  <motion.button type="button" className="icon-btn" aria-label={label} onClick={onClick} whileTap={{ y: 3 }}>
    {children}
  </motion.button>
)

export function TopBar(props: {
  puzzleNo: number
  slot: string
  badge?: string
  onBack?(): void
  onHelp?(): void
  onStats?(): void
  onInvite?(): void
}) {
  const { puzzleNo, slot, badge, onBack, onHelp, onStats, onInvite } = props
  return (
    <header className="topbar">
      {onBack && (
        <IconBtn label="Back to home" onClick={onBack}>
          <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M10 2.5 4.5 8l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </IconBtn>
      )}
      <span className="wordmark">
        WORD<span className="wordmark-x">X</span>
      </span>
      <span className="topbar-meta">{badge ? <span className="preview-badge">{badge}</span> : `NO. ${puzzleNo} · ${formatDrop(slot)}`}</span>
      <span className="topbar-actions">
        {onInvite && (
          <IconBtn label="Invite friends" onClick={onInvite}>
            <svg viewBox="0 0 20 16" width="18" height="15" aria-hidden="true">
              <circle cx="7" cy="5" r="3" fill="none" stroke="currentColor" strokeWidth="2.2" />
              <path d="M1.5 15c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6M16 3v6M13 6h6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </IconBtn>
        )}
        {onHelp && (
          <IconBtn label="How to play" onClick={onHelp}>
            ?
          </IconBtn>
        )}
        {onStats && (
          <IconBtn label="Stats" onClick={onStats}>
            <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M2 14V9M6 14V4M10 14V7M14 14V2" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
          </IconBtn>
        )}
      </span>
    </header>
  )
}
