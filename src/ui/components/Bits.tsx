import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, type ReactNode } from 'react'
import { createRng } from '../../engine/random'
import { POSTER } from '../theme'
import type { Toast } from '../useGame'

/** Huge poster headline that rises letter by letter out of a mask. */
export function PosterWord({ text, className, delay = 0, stagger = 0.045 }: { text: string; className?: string; delay?: number; stagger?: number }) {
  const reduce = useReducedMotion()
  return (
    <span className={`poster-word ${className ?? ''}`} aria-label={text}>
      {[...text].map((ch, i) =>
        ch === ' ' ? (
          <span className="poster-space" key={i} aria-hidden="true" />
        ) : (
        <span className="poster-mask" key={i} aria-hidden="true">
          <motion.span
            className="poster-char"
            initial={reduce ? false : { y: '105%', rotate: 8 }}
            animate={{ y: '0%', rotate: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22, delay: delay + i * stagger }}
          >
            {ch}
          </motion.span>
        </span>
        ),
      )}
    </span>
  )
}

/** Raised, pressable button: thick ink outline, solid bottom edge. */
export function ChunkyButton({
  children,
  onClick,
  variant = 'ink',
  className,
  type = 'button',
  ...rest
}: {
  children: ReactNode
  onClick?(): void
  variant?: 'ink' | 'paper'
  className?: string
  type?: 'button' | 'submit'
  'aria-label'?: string
}) {
  return (
    <motion.button
      type={type}
      className={`chunky chunky-${variant} ${className ?? ''}`}
      onClick={onClick}
      whileHover={{ y: -2 }}
      whileTap={{ y: 3, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 700, damping: 30 }}
      {...rest}
    >
      {children}
    </motion.button>
  )
}

export function ToastHost({ toast, onDone, className }: { toast: Toast | null; onDone(): void; className?: string }) {
  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(onDone, toast.sub ? 2200 : 1600)
    return () => window.clearTimeout(t)
  }, [toast, onDone])
  return (
    <div className={`toast-host ${className ?? ''}`} aria-live="assertive">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            className={`toast toast-${toast.tone ?? 'info'}`}
            initial={{ y: -40, opacity: 0, scale: 0.8, rotate: -3 }}
            animate={{ y: 0, opacity: 1, scale: 1, rotate: 0 }}
            exit={{ y: -20, opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 600, damping: 24 }}
          >
            <span className="toast-text">{toast.text}</span>
            {toast.sub && <span className="toast-sub">{toast.sub}</span>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** One-shot burst of poster shapes. */
export function Confetti({ seed }: { seed: number }) {
  const reduce = useReducedMotion()
  const pieces = useMemo(() => {
    const rng = createRng(seed)
    return Array.from({ length: 56 }, (_, i) => ({
      x: (rng.next() - 0.5) * 120,
      peak: -(30 + rng.next() * 45),
      fall: 70 + rng.next() * 50,
      rot: (rng.next() - 0.5) * 900,
      size: 10 + rng.next() * 16,
      shape: ['sq', 'circ', 'tri', 'bar'][i % 4],
      color: POSTER[i % POSTER.length],
      delay: rng.next() * 0.18,
      dur: 1.6 + rng.next() * 1.1,
    }))
  }, [seed])
  if (reduce) return null
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <motion.span
          key={i}
          className={`cf cf-${p.shape}`}
          style={{ width: p.size, height: p.shape === 'bar' ? p.size * 0.35 : p.size, background: p.color }}
          initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
          animate={{ x: `${p.x}vw`, y: [`0vh`, `${p.peak}vh`, `${p.fall}vh`], rotate: p.rot, opacity: [1, 1, 0] }}
          transition={{ duration: p.dur, delay: p.delay, ease: [0.2, 0.7, 0.4, 1], times: [0, 0.3, 1] }}
        />
      ))}
    </div>
  )
}

/** Bottom sheet with a springy entrance. */
export function Sheet({ open, onClose, children, label }: { open: boolean; onClose(): void; children: ReactNode; label: string }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="sheet-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={label}
            initial={{ y: '100%', rotate: 2 }}
            animate={{ y: 0, rotate: 0 }}
            exit={{ y: '110%', rotate: -2 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" className="sheet-close" aria-label="Close" onClick={onClose}>
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
            </button>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
