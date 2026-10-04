import { motion } from 'motion/react'
import { LEVEL_COUNT, STAGES } from '../../journey/levels'
import { getMe } from '../../net/identity'
import { registry } from '../../rules'
import { ChunkyButton, PosterWord } from '../components/Bits'
import { Credit } from '../components/Credit'
import { ExampleRow } from '../components/Panels'
import { PRESETS } from '../motion/presets'
import { navigate } from '../router'
import { markSeenIntro } from '../storage'

const reveal = { initial: { opacity: 0, y: 24 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: '-40px' }, transition: { type: 'spring', stiffness: 260, damping: 26 } } as const

/** "Play game": straight into today's drop, picking a username first if you haven't got one. */
function play() {
  markSeenIntro()
  navigate(getMe().claimed ? '/play' : '/?start=1')
}

/** How WordX works, on one page: shown to first-time players, and behind the home screen's "?". */
export function HowToPlay() {
  const standard = registry.get('standard')!.presentation
  const rules = registry.all()

  return (
    <div className="how">
      <header className="how-top">
        <button type="button" className="icon-btn how-back" aria-label="Back to home" onClick={() => navigate('/')}>
          <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
            <path d="M10 2.5 4.5 8l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span className="wordmark">
          WORD<span className="wordmark-x">X</span>
        </span>
      </header>

      <section className="how-hero">
        <span className="kicker">How it works</span>
        <h1 className="how-title">
          <PosterWord text="ONE WORD." delay={0.1} />
          <PosterWord text="NEW RULES." delay={0.35} />
        </h1>
        <p className="how-lede">You know how to play. You don’t know today’s rule. Here’s everything in two minutes.</p>
      </section>

      <motion.section className="how-block" {...reveal}>
        <Step n={1} title="Guess the hidden word" />
        <p>Type a word and press Enter. Each letter changes colour to tell you how close you are. Use what you learn on your next try.</p>
        <div className="how-example">
          <ExampleRow word={standard.example.word} feedback={standard.example.feedback} preset={PRESETS[standard.motion]} size={50} />
        </div>
        <ul className="how-legend">
          <li>
            <i className="how-swatch" style={{ background: '#1FD65F' }} /> <strong>Green</strong> right letter, right spot
          </li>
          <li>
            <i className="how-swatch" style={{ background: '#FFD21F' }} /> <strong>Yellow</strong> in the word, wrong spot
          </li>
          <li>
            <i className="how-swatch" style={{ background: '#9C978C' }} /> <strong>Grey</strong> not in the word
          </li>
        </ul>
        <p className="how-small">Words can be 4, 5 or 6 letters. A word the game doesn’t accept never uses up a try.</p>
      </motion.section>

      <motion.section className="how-block" {...reveal}>
        <Step n={2} title="Every game has a rule" />
        <p>
          The big word at the top of a game, like <strong>DECAY</strong> or <strong>FOG</strong>, is the <strong>rule</strong>. It changes <em>how</em> you play.
          It’s never a clue to the word.
        </p>
        <div className="how-rules">
          {rules.map((r) => (
            <div key={r.id} className="how-rule" style={{ background: r.presentation.theme.bg, color: r.presentation.theme.ink === 'light' ? '#fff' : '#111' }}>
              <strong>{r.presentation.name}</strong>
              <span>{r.presentation.tagline}</span>
            </div>
          ))}
        </div>
      </motion.section>

      <motion.section className="how-block" {...reveal}>
        <Step n={3} title="Three ways to play" />
        <div className="how-modes">
          <div className="how-mode how-mode-drop">
            <strong>Daily drop</strong>
            <p>One word a day, the same for everyone, with a new rule. Play it to keep your streak going, then share your result.</p>
          </div>
          <div className="how-mode how-mode-journey">
            <strong>Journey</strong>
            <p>
              {LEVEL_COUNT} levels in {STAGES.length} stages, each harder than the last. Clear a level to unlock the next. Play on <b>Easy</b> to get a clue to
              the word, or on <b>Scholar</b> for 1.6× points.
            </p>
          </div>
          <div className="how-mode how-mode-friends">
            <strong>With friends</strong>
            <p>
              Share a link and take turns on one board. You see each other type live. Set a time per turn; whoever made the game can end it, and anyone
              can give up.
            </p>
          </div>
        </div>
      </motion.section>

      <motion.section className="how-block" {...reveal}>
        <Step n={4} title="When you’re stuck" />
        <ul className="how-tips">
          <li>
            <b>Hints</b> unlock after two tries and give you a clue or a letter.
          </li>
          <li>
            <b>Tap a letter</b> you’ve typed to remove just that one.
          </li>
          <li>
            <b>Timer</b> is optional: 4, 5 or 10 minutes, if you like pressure.
          </li>
          <li>
            <b>I give up</b> shows you the word. There’s always tomorrow.
          </li>
        </ul>
      </motion.section>

      <motion.section className="how-block" {...reveal}>
        <Step n={5} title="Your progress" />
        <p>
          Pick a unique username so friends know it’s you. Your streak, stars and points are saved on this device. Moving to a new phone? Use the save code
          in your profile.
        </p>
      </motion.section>

      <div className="how-foot">
        <Credit />
      </div>

      <div className="how-cta">
        <ChunkyButton onClick={play} className="play-btn">
          Play game
        </ChunkyButton>
      </div>
    </div>
  )
}

function Step({ n, title }: { n: number; title: string }) {
  return (
    <h2 className="how-step">
      <span className="how-n">{n}</span>
      {title}
    </h2>
  )
}
