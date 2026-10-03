import { motion } from 'motion/react'
import { useMemo, type ReactNode } from 'react'
import type { MotionPresetId } from '../../engine/types'
import { createRng } from '../../engine/random'

export interface AmbientProps {
  preset: MotionPresetId
  ink: 'dark' | 'light'
  /** 0 → 1, how close the player is. Fog uses it to thin the mist. */
  heat: number
  letters: string[]
  name: string
}

const Layer = ({ children }: { children: ReactNode }) => (
  <div className="ambient" aria-hidden="true">
    {children}
  </div>
)

function useRandoms(count: number, seed: number) {
  return useMemo(() => {
    const rng = createRng(seed)
    return Array.from({ length: count }, () => [rng.next(), rng.next(), rng.next(), rng.next()] as const)
  }, [count, seed])
}

function Squares({ stroke }: { stroke: string }) {
  const r = useRandoms(9, 7)
  return (
    <>
      {r.map(([a, b, c, d], i) => (
        <motion.div
          key={i}
          className="amb-square"
          style={{ left: `${a * 100}%`, top: `${b * 100}%`, width: 30 + c * 90, height: 30 + c * 90, borderColor: stroke }}
          animate={{ rotate: [0, d > 0.5 ? 90 : -90], y: [0, -30, 0] }}
          transition={{ duration: 14 + d * 10, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </>
  )
}

function StampRing({ name, stroke }: { name: string; stroke: string }) {
  const text = `${name.toUpperCase()} • TODAY’S THEME • `.repeat(2)
  return (
    <motion.svg
      className="amb-ring"
      viewBox="0 0 200 200"
      animate={{ rotate: 360 }}
      transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
    >
      <defs>
        <path id="ring-path" d="M100,100 m-80,0 a80,80 0 1,1 160,0 a80,80 0 1,1 -160,0" />
      </defs>
      <circle cx="100" cy="100" r="94" fill="none" stroke={stroke} strokeWidth="2" />
      <circle cx="100" cy="100" r="66" fill="none" stroke={stroke} strokeWidth="2" />
      <text fontSize="13" fontWeight="800" letterSpacing="2" fill={stroke}>
        <textPath href="#ring-path">{text}</textPath>
      </text>
    </motion.svg>
  )
}

function FloatingLetters({ letters, stroke }: { letters: string[]; stroke: string }) {
  const r = useRandoms(letters.length, 11)
  return (
    <>
      {letters.map((l, i) => (
        <motion.span
          key={i}
          className="amb-letter"
          style={{ left: `${r[i][0] * 85}%`, top: `${r[i][1] * 80}%`, WebkitTextStrokeColor: stroke, fontSize: `${18 + r[i][2] * 22}vmin` }}
          animate={{ rotate: [-12 + r[i][3] * 24, 12 - r[i][3] * 24], y: [0, -40, 0], x: [0, 20, 0] }}
          transition={{ duration: 10 + r[i][2] * 8, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}
        >
          {l}
        </motion.span>
      ))}
    </>
  )
}

function Embers({ count }: { count: number }) {
  const r = useRandoms(count, 3)
  return (
    <>
      {r.map(([a, b, c, d], i) => (
        <motion.span
          key={i}
          className="amb-ember"
          style={{ left: `${a * 100}%`, width: 4 + c * 7, height: 4 + c * 7, background: d > 0.5 ? '#FFD21F' : '#FF5A1F' }}
          initial={{ y: '105vh', opacity: 0 }}
          animate={{ y: '-10vh', x: [0, (b - 0.5) * 120, (d - 0.5) * 80], opacity: [0, 1, 1, 0], rotate: [0, 180 + d * 360] }}
          transition={{ duration: 6 + b * 6, delay: d * 6, repeat: Infinity, ease: 'easeOut' }}
        />
      ))}
    </>
  )
}

function Mist({ heat }: { heat: number }) {
  const r = useRandoms(7, 5)
  const thickness = Math.max(0.12, 1 - heat)
  return (
    <motion.div className="amb-fill" animate={{ opacity: thickness }} transition={{ duration: 1.6, ease: 'easeOut' }}>
      {r.map(([a, b, c, d], i) => (
        <motion.div
          key={i}
          className="amb-mist"
          style={{ left: `${a * 90 - 20}%`, top: `${b * 90 - 10}%`, width: `${40 + c * 50}vmax`, height: `${24 + c * 26}vmax` }}
          animate={{ x: [0, (d - 0.5) * 260, 0], y: [0, (c - 0.5) * 80, 0], scale: [1, 1.15, 1] }}
          transition={{ duration: 18 + d * 14, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </motion.div>
  )
}

function Vowels({ stroke }: { stroke: string }) {
  return (
    <div className="amb-vowels">
      {['A', 'E', 'I', 'O', 'U'].map((v, i) => (
        <motion.span
          key={v}
          className="amb-letter amb-vowel"
          style={{ WebkitTextStrokeColor: stroke }}
          animate={{ y: [0, -28, 0], rotate: [0, i % 2 ? 6 : -6, 0] }}
          transition={{ duration: 3.2, delay: i * 0.35, repeat: Infinity, ease: 'easeInOut' }}
        >
          {v}
        </motion.span>
      ))}
    </div>
  )
}

function DrumRings({ stroke }: { stroke: string }) {
  return (
    <div className="amb-drum">
      {[0, 1, 2, 3].map((i) => (
        <motion.span
          key={i}
          className="amb-drum-ring"
          style={{ borderColor: stroke }}
          animate={{ scale: [0.2, 2.6], opacity: [0.9, 0] }}
          transition={{ duration: 3.6, delay: i * 0.9, repeat: Infinity, ease: 'easeOut' }}
        />
      ))}
      <motion.span
        className="amb-drum-core"
        style={{ borderColor: stroke }}
        animate={{ scale: [1, 1.12, 1, 1.06, 1] }}
        transition={{ duration: 0.9, repeat: Infinity, times: [0, 0.15, 0.4, 0.55, 1] }}
      />
    </div>
  )
}

function Scanlines({ stroke }: { stroke: string }) {
  const r = useRandoms(6, 9)
  return (
    <>
      {r.map(([a, b, c], i) => (
        <motion.div
          key={i}
          className="amb-scan"
          style={{ top: `${a * 100}%`, height: 6 + b * 26, background: stroke }}
          animate={{ x: ['-100%', '100%'], opacity: [0, 0.9, 0, 0.6, 0] }}
          transition={{ duration: 2.4 + c * 3, delay: b * 4, repeat: Infinity, repeatDelay: 1 + c * 3, ease: 'linear' }}
        />
      ))}
    </>
  )
}

/** Each rule's world, drawn behind the board. Purely decorative. */
export function Ambient({ preset, ink, heat, letters, name }: AmbientProps) {
  const stroke = ink === 'light' ? 'rgba(255,255,255,0.22)' : 'rgba(17,17,17,0.14)'
  switch (preset) {
    case 'flip':
      return <Layer><Squares stroke={stroke} /></Layer>
    case 'stamp':
      return <Layer><StampRing name={name} stroke={stroke} /></Layer>
    case 'spin':
      return <Layer><FloatingLetters letters={letters} stroke={stroke} /></Layer>
    case 'burn':
      return <Layer><Embers count={22} /></Layer>
    case 'fog':
      return <Layer><Mist heat={heat} /></Layer>
    case 'lock':
      return <Layer><Vowels stroke={stroke} /></Layer>
    case 'drum':
      return <Layer><DrumRings stroke={stroke} /></Layer>
    case 'glitch':
      return <Layer><Scanlines stroke={stroke} /></Layer>
  }
}
