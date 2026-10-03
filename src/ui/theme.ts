import type { KeyState, Mark, RulePresentation, TemperatureBand } from '../engine/types'

export const INK = '#111111'
export const PAPER = '#FFFFFF'

/** Standard colours, and a colour-blind-safe set (orange/blue) that also adds shape markers. */
export const PALETTES: Record<'standard' | 'contrast', Record<Mark, string>> = {
  standard: { correct: '#1FD65F', present: '#FFD21F', absent: '#9C978C' },
  contrast: { correct: '#F5793A', present: '#85C0F9', absent: '#9C978C' },
}

/** The live palette. Read at render and animation time, so switching modes takes effect at once. */
export const MARK_BG: Record<Mark, string> = { ...PALETTES.standard }

export const BAND: Record<TemperatureBand, { color: string; label: string; emoji: string }> = {
  freezing: { color: '#7CC8FF', label: 'Freezing', emoji: '🧊' },
  cold: { color: '#BFE3FF', label: 'Cold', emoji: '❄️' },
  warm: { color: '#FFD21F', label: 'Warm', emoji: '🌤️' },
  hot: { color: '#FF8A3D', label: 'Hot', emoji: '🔥' },
  blazing: { color: '#E8112D', label: 'Blazing', emoji: '🌋' },
  solved: { color: '#1FD65F', label: 'Found it', emoji: '🟩' },
}

export function applyContrast(high: boolean) {
  Object.assign(MARK_BG, high ? PALETTES.contrast : PALETTES.standard)
  KEY_BG.correct = MARK_BG.correct
  KEY_BG.present = MARK_BG.present
  if (high) document.documentElement.dataset.contrast = 'high'
  else delete document.documentElement.dataset.contrast
}

export const KEY_BG: Record<KeyState, string> = {
  idle: PAPER,
  used: '#E4E0D7',
  absent: MARK_BG.absent,
  present: MARK_BG.present,
  correct: MARK_BG.correct,
  burned: INK,
  disabled: 'transparent',
}

/** Poster palette used for confetti and accents. */
export const POSTER = ['#FF5A1F', '#2E5BFF', '#FFD21F', '#1FD65F', '#FF8FD0', '#9B7BFF', INK]

export function inkColor(theme: RulePresentation['theme']) {
  return theme.ink === 'light' ? '#FFFFFF' : INK
}

export function softInk(theme: RulePresentation['theme'], alpha = 0.45) {
  return theme.ink === 'light' ? `rgba(255,255,255,${alpha})` : `rgba(17,17,17,${alpha})`
}
