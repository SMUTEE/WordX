import { Suspense, lazy, useEffect, useMemo } from 'react'
import schedule from './data/schedule.json'
import { defaultDictionary } from './engine/dictionary'
import { createGame, type Game } from './engine/engine'
import { currentSlot, normalizeSlot, resolvePuzzle, type ScheduleConfig } from './engine/schedule'
import { registry } from './rules'
import { ChunkyButton, PosterWord } from './ui/components/Bits'
import { navigate, useRoute } from './ui/router'
import { GameScreen } from './ui/screens/GameScreen'
import { DropScreen } from './ui/screens/DropScreen'
import { Home } from './ui/screens/Home'
import { JourneyMap, LevelScreen } from './ui/screens/Journey'
import { RoomScreen } from './ui/screens/RoomScreen'
import { trackOpen } from './net/track'

// The stats page is only for the owner: loaded on demand, never in the game's bundle.
const AdminScreen = lazy(() => import('./ui/screens/Admin'))

/** This drop's puzzle, or a practice one picked with ?rule= / ?slot= / ?date=. */
function soloGame(search: string): Game | null {
  try {
    const params = new URLSearchParams(search)
    const pinned = params.get('slot') ?? params.get('date')
    const slot = pinned ? normalizeSlot(pinned) : currentSlot()
    const dictionary = defaultDictionary()
    const puzzle = resolvePuzzle({ slot, schedule: schedule as ScheduleConfig, registry, dictionary, forceRuleId: params.get('rule') ?? undefined })
    return createGame(registry.get(puzzle.ruleId)!, puzzle, dictionary)
  } catch {
    return null
  }
}

export default function App() {
  const route = useRoute()
  const search = route.name === 'play' ? location.search : ''
  const game = useMemo(() => soloGame(search), [search])
  useEffect(() => {
    if (route.name !== 'admin') trackOpen()
  }, [route.name])

  // Old links like /?rule=fog go straight to that game.
  if (route.name === 'home' && /[?&](rule|slot|date)=/.test(location.search)) {
    navigate(`/play${location.search}`, { replace: true })
    return null
  }
  if (route.name === 'admin')
    return (
      <Suspense fallback={null}>
        <AdminScreen />
      </Suspense>
    )
  if (route.name === 'room') return <RoomScreen key={route.code} code={route.code} />
  if (route.name === 'journey') return <JourneyMap />
  if (route.name === 'level') return <LevelScreen key={route.n} n={route.n} />
  if (!game) return <ErrorScreen />
  // The live drop is scored on the server; ?rule= / ?slot= / ?date= are local practice games.
  if (route.name === 'play') return /[?&](rule|slot|date)=/.test(location.search) ? <GameScreen key={game.puzzle.id} game={game} /> : <DropScreen />
  return <Home game={game} />
}

function ErrorScreen() {
  return (
    <div className="stage ink-dark" style={{ ['--ink' as string]: '#111', ['--soft' as string]: 'rgba(17,17,17,.4)' }}>
      <div className="stage-bg" style={{ background: '#F4F1EA' }} />
      <main className="intro">
        <span className="wordmark">
          WORD<span className="wordmark-x">X</span>
        </span>
        <h1 className="intro-title">
          <PosterWord text="OOPS" />
        </h1>
        <div className="rule thick" />
        <p className="intro-tagline">Something went wrong loading this puzzle. We won’t show you a half-built one.</p>
        <div className="intro-cta">
          <ChunkyButton onClick={() => location.reload()} className="play-btn">
            Try again
          </ChunkyButton>
        </div>
      </main>
    </div>
  )
}
