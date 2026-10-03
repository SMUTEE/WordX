import type { WordEntry } from '../data/words'

export type Mark = 'correct' | 'present' | 'absent'

/** Every way a rule can describe the result of a guess. The UI renders by kind, never by rule. */
export type Feedback =
  | { kind: 'tiles'; marks: Mark[] }
  | { kind: 'meter'; value: number; band: TemperatureBand }

export type TemperatureBand = 'freezing' | 'cold' | 'warm' | 'hot' | 'blazing' | 'solved'

export type KeyState = 'idle' | 'used' | 'absent' | 'present' | 'correct' | 'burned' | 'disabled'

export interface Guess {
  word: string
  feedback: Feedback
  submittedAt: number
}

export type GameStatus = 'playing' | 'won' | 'lost'

export interface GameState {
  puzzleId: string
  guesses: Guess[]
  status: GameStatus
  startedAt: number
  completedAt?: number
  /** Hints taken so far. Letter hints lock into place on the board. */
  hints?: HintReveal[]
  /** Optional time limit chosen at the start, in ms, and the moment it runs out. */
  timeLimit?: number
  deadline?: number
  /** Why a lost game ended. */
  endReason?: EndReason
}

export type EndReason = 'tries' | 'time' | 'gave-up'

export type HintReveal = { kind: 'clue'; text: string } | { kind: 'letter'; index: number; letter: string }

export type ValidationResult =
  | { ok: true }
  | { ok: false; code: string; message: string; letters?: string[] }

/** Extra context printed above the board. Rendered by kind. */
export type Hint =
  | { kind: 'category'; label: string; prompt: string }
  | { kind: 'letters'; letters: string[] }
  | { kind: 'language'; label: string; prompt: string }

export interface BoardSetup {
  length: number
  maxGuesses: number
  /** Positions pre-filled and locked for every row (index → letter). */
  locked: Record<number, string>
  hint?: Hint
  /** How feedback is laid out next to each row. */
  feedbackKind: Feedback['kind']
  /** Hints allowed this game (0 hides the hint button). */
  maxHints: number
}

export interface Puzzle {
  /** Stable key: date + rule + version. Reloading always resolves the same puzzle. */
  id: string
  number: number
  /** UTC calendar date of the drop. */
  date: string
  /** The six-hour drop, "YYYY-MM-DDTHH" UTC. */
  slot: string
  ruleId: string
  ruleVersion: number
  seed: number
  answer: WordEntry
  /** Rule-owned data chosen at pick time, e.g. which category. Must be JSON-safe. */
  meta: Record<string, string | number>
  preview: boolean
}

export interface Dictionary {
  has(word: string): boolean
  words: readonly string[]
}

export interface PickContext {
  date: string
  seed: number
  /** How many times this rule has been scheduled before `date`. Drives non-repeating answers. */
  occurrence: number
  dictionary: Dictionary
  /** A server-only secret mixed into every shuffle, so drop answers can't be computed from the app's code. */
  salt?: string
}

export interface PuzzleContext {
  puzzle: Puzzle
  setup: BoardSetup
  dictionary: Dictionary
}

export interface ScoreContext extends PuzzleContext {
  guessIndex: number
  previous: readonly Guess[]
}

export type Capability = 'answer' | 'setup' | 'vocabulary' | 'validation' | 'scoring' | 'keyboard' | 'locks'

export type MotionPresetId = 'flip' | 'stamp' | 'spin' | 'burn' | 'fog' | 'lock' | 'drum' | 'glitch'

export type LegendSwatch = Mark | 'burned' | 'locked' | TemperatureBand

export interface RulePresentation {
  name: string
  /** Shown above the board while playing: what each colour means today. */
  legend: { swatch: LegendSwatch; label: string }[]
  tagline: string
  instructions: string[]
  /** One worked example shown on the intro card. */
  example: { word: string; feedback: Feedback; caption: string }
  theme: { bg: string; ink: 'dark' | 'light' }
  motion: MotionPresetId
}

/**
 * A rule is a policy over the generic engine. It overrides only the stages it declares
 * in `capabilities`; everything else falls back to the Standard behaviour.
 */
export interface GameRule {
  id: string
  version: number
  capabilities: readonly Capability[]
  presentation: RulePresentation

  pickAnswer?(ctx: PickContext): { entry: WordEntry; meta?: Puzzle['meta'] }
  setup?(puzzle: Puzzle, dictionary: Dictionary): Partial<BoardSetup>
  /** Replaces dictionary membership for this rule (e.g. category words, any anagram). */
  inVocabulary?(word: string, ctx: PuzzleContext): boolean
  /** Rule-specific constraints, checked before the vocabulary. */
  validateGuess?(word: string, state: GameState, ctx: PuzzleContext): ValidationResult
  scoreGuess?(word: string, answer: string, ctx: ScoreContext): Feedback
  keyStates?(state: GameState, ctx: PuzzleContext, base: Record<string, KeyState>): Record<string, KeyState>
  /** Positions that become locked as the game progresses (merged over setup.locked). */
  dynamicLocks?(state: GameState, ctx: PuzzleContext): Record<number, string>
}
