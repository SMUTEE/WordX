import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { LEVEL_COUNT } from '../../journey/levels'
import { getMe } from '../../net/identity'
import { registry } from '../../rules'
import { ChunkyButton, PosterWord } from '../components/Bits'
import { Credit } from '../components/Credit'
import { ExampleRow } from '../components/Panels'
import { PRESETS } from '../motion/presets'
import { navigate } from '../router'
import { markSeenIntro } from '../storage'
import { usePageScroll } from '../usePageScroll'

/** "Play game": straight into today's drop, picking a username first if you haven't got one. */
function play() {
  markSeenIntro()
  navigate(getMe().claimed ? '/play' : '/?start=1')
}

/** The rules the hero cycles through, in an order that shows off the variety. */
const SHOWCASE = ['standard', 'decay', 'fog', 'anagram', 'category', 'vowel', 'naija']
const HERO_MS = 4200

const rise = { initial: { opacity: 0, y: 28 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: '0px 0px -60px 0px' }, transition: { type: 'spring', stiffness: 220, damping: 26 } } as const


/** WordX's landing page: what it is, how it plays, and a way in. First-time players start here. */
export function HowToPlay() {
  const reduce = useReducedMotion()
  usePageScroll()
  const heroCta = useRef<HTMLDivElement>(null)
  const finalCta = useRef<HTMLDivElement>(null)
  const [showBar, setShowBar] = useState(false)
  const [i, setI] = useState(0)
  const rule = registry.get(SHOWCASE[i % SHOWCASE.length])!.presentation
  const ink = rule.theme.ink === 'light' ? '#fff' : '#111'

  // The hero's rule changes every few seconds: the whole point in one glance.
  useEffect(() => {
    if (reduce) return
    const t = window.setInterval(() => setI((n) => n + 1), HERO_MS)
    return () => window.clearInterval(t)
  }, [reduce])

  // Between the hero's button and the final one, a pinned button takes over.
  useEffect(() => {
    const els = [heroCta.current, finalCta.current].filter((e): e is HTMLDivElement => !!e)
    const visible = new Map<Element, boolean>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible.set(e.target, e.isIntersecting)
        setShowBar(![...visible.values()].some(Boolean))
      },
      { threshold: 0 },
    )
    els.forEach((e) => io.observe(e))
    return () => io.disconnect()
  }, [])

  const rules = registry.all()

  return (
    <div className="land">
      {/* ---------- Hero ---------- */}
      <section className="land-hero" style={{ background: rule.theme.bg, color: ink }}>
        <header className="land-top">
          <span className="wordmark">
            WORD<span className="wordmark-x">X</span>
          </span>
          <button type="button" className="land-top-link" onClick={play}>
            Play
          </button>
        </header>
        <div className="land-hero-grid">
          <div className="land-hero-copy">
            <h1 className="land-title">
              <PosterWord text="ONE WORD." delay={0.1} />
              <PosterWord text="A NEW RULE" delay={0.3} />
              <PosterWord text="EVERY DAY." delay={0.5} />
            </h1>
            <p className="land-sub">You know how to play. You don’t know today’s rule. Guess the word, beat the twist, keep your streak.</p>
            <div className="land-cta" ref={heroCta}>
              <ChunkyButton onClick={play} className="play-btn">
                Play game
              </ChunkyButton>
              <span className="land-note">Free · No sign-up · Any phone</span>
            </div>
          </div>
          <div className="land-demo" aria-label={`Example: the ${rule.name} rule`}>
            <span className="land-demo-kicker">Today’s rule</span>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.strong
                key={rule.name}
                className="land-demo-rule"
                initial={{ y: 40, opacity: 0, rotate: -4 }}
                animate={{ y: 0, opacity: 1, rotate: 0 }}
                exit={{ y: -40, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 420, damping: 26 }}
              >
                {rule.name.toUpperCase()}
              </motion.strong>
            </AnimatePresence>
            <p className="land-demo-tag">{rule.tagline}</p>
            <div className="land-demo-card">
              <ExampleRow key={rule.name} word={rule.example.word} feedback={rule.example.feedback} preset={PRESETS[rule.motion]} size={52} />
              <span>{rule.example.caption}</span>
            </div>
            <div className="land-dots" aria-hidden="true">
              {SHOWCASE.map((id, k) => (
                <i key={id} className={k === i % SHOWCASE.length ? 'on' : ''} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- How a game works ---------- */}
      <section className="land-section">
        <motion.div className="land-head" {...rise}>
          <span className="land-kicker">How it works</span>
          <h2>Guess the word. The colours guide you.</h2>
        </motion.div>
        <div className="land-steps">
          {[
            ['Type a word', 'Any real word with the right number of letters. A word the game doesn’t accept never costs a try.'],
            ['Read the colours', 'Green: right letter, right spot. Yellow: in the word, wrong spot. Grey: not in the word.'],
            ['Close in', 'Use what you learned on your next try. Solve it before you run out.'],
          ].map(([t, d], k) => (
            <motion.div key={t} className="land-step" {...rise} transition={{ ...rise.transition, delay: k * 0.08 }}>
              <span className="land-step-n">{k + 1}</span>
              <strong>{t}</strong>
              <p>{d}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ---------- The twist ---------- */}
      <section className="land-section land-dark">
        <motion.div className="land-head" {...rise}>
          <span className="land-kicker">The twist</span>
          <h2>Every game has a rule.</h2>
          <p>
            The big word at the top of a game, like <strong>DECAY</strong> or <strong>FOG</strong>, is the rule. It changes <em>how</em> you play. It’s never a clue
            to the word.
          </p>
        </motion.div>
        <div className="land-rules">
          {rules.map((r, k) => (
            <motion.div
              key={r.id}
              className="land-rule"
              style={{ background: r.presentation.theme.bg, color: r.presentation.theme.ink === 'light' ? '#fff' : '#111' }}
              {...rise}
              transition={{ ...rise.transition, delay: (k % 4) * 0.06 }}
            >
              <strong>{r.presentation.name}</strong>
              <span>{r.presentation.tagline}</span>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ---------- Three ways to play ---------- */}
      <section className="land-section">
        <motion.div className="land-head" {...rise}>
          <span className="land-kicker">Three ways to play</span>
          <h2>Daily, solo, or with friends.</h2>
        </motion.div>
        <Mode
          tone="drop"
          title="Daily drop"
          line="One word a day, the same for everyone, with a new rule each time. Play it to keep your streak alive, then share how you did."
          shot="/landing/drop.webp"
          alt="The daily drop being played"
        />
        <Mode
          tone="journey"
          title="Journey"
          line={`${LEVEL_COUNT} levels, each harder than the last. Play on Easy for a clue to the word, or on Scholar for 1.6× points.`}
          shot="/landing/journey.webp"
          alt="The Journey map with levels and stars"
          flip
        />
        <Mode
          tone="friends"
          title="With friends"
          line="Send a link and take turns on one board. Watch each other type, live. Set a clock per turn if you like it tense."
          shot="/landing/friends.webp"
          alt="A friends game, watching the other player type"
        />
      </section>

      {/* ---------- Facts ---------- */}
      <section className="land-facts" aria-label="WordX in numbers">
        {[
          ['8', 'rules that change the game'],
          [String(LEVEL_COUNT), 'Journey levels'],
          ['6,000+', 'words to find'],
          ['Live', 'games with friends'],
          ['Free', 'no sign-up, no ads'],
        ].map(([big, small]) => (
          <div key={small} className="land-fact">
            <strong>{big}</strong>
            <span>{small}</span>
          </div>
        ))}
      </section>

      {/* ---------- When you're stuck ---------- */}
      <section className="land-section">
        <motion.div className="land-head" {...rise}>
          <span className="land-kicker">When you’re stuck</span>
          <h2>A little help, when you want it.</h2>
        </motion.div>
        <div className="land-tips">
          {[
            ['Hints', 'Unlock after two tries: a clue or a letter.'],
            ['Tap to fix', 'Tap any letter you’ve typed to remove just that one.'],
            ['Timer', 'Optional. 4, 5 or 10 minutes, if you like pressure.'],
            ['I give up', 'Shows you the word. There’s always tomorrow.'],
          ].map(([t, d]) => (
            <motion.div key={t} className="land-tip" {...rise}>
              <strong>{t}</strong>
              <span>{d}</span>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ---------- Final call ---------- */}
      <section className="land-final">
        <motion.div {...rise}>
          <h2>
            <PosterWord text="TODAY’S WORD" />
            <PosterWord text="IS WAITING." delay={0.15} />
          </h2>
          <p>Pick a username and you’re in. Your streak starts today.</p>
          <div ref={finalCta}>
            <ChunkyButton onClick={play} className="play-btn">
              Play game
            </ChunkyButton>
          </div>
        </motion.div>
      </section>

      <footer className="land-foot">
        <Credit />
        <nav>
          <button type="button" className="link-btn" onClick={() => navigate('/journey')}>
            Journey
          </button>
          <button type="button" className="link-btn" onClick={play}>
            Daily drop
          </button>
        </nav>
      </footer>

      <AnimatePresence>
        {showBar && (
          <motion.div className="land-bar" initial={{ y: 90 }} animate={{ y: 0 }} exit={{ y: 90 }} transition={{ type: 'spring', stiffness: 400, damping: 32 }}>
            <ChunkyButton onClick={play} className="play-btn">
              Play game
            </ChunkyButton>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Mode({ tone, title, line, shot, alt, flip }: { tone: string; title: string; line: string; shot: string; alt: string; flip?: boolean }) {
  return (
    <motion.div className={`land-mode land-mode-${tone}${flip ? ' land-mode-flip' : ''}`} {...rise}>
      <div className="land-mode-copy">
        <strong>{title}</strong>
        <p>{line}</p>
      </div>
      <div className="land-mode-shot">
        <img src={shot} alt={alt} loading="lazy" width={430} height={932} />
      </div>
    </motion.div>
  )
}
