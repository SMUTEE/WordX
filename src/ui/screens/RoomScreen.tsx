import { useMemo, useState } from 'react'
import { defaultDictionary } from '../../engine/dictionary'
import { createGame } from '../../engine/engine'
import { getMe } from '../../net/identity'
import { roomPuzzle } from '../../net/roomState'
import { useRoom } from '../../net/useRoom'
import { registry } from '../../rules'
import { ChunkyButton, PosterWord } from '../components/Bits'
import { navigate } from '../router'
import { GameScreen } from './GameScreen'

/** A live co-op game at /room/CODE. Connects first, then plays the server's board. */
export function RoomScreen({ code }: { code: string }) {
  const [me, setMe] = useState(getMe)
  const api = useRoom(code, me, true)
  const room = api.room

  // Built once per room; the setup (letters, locks, theme) comes from the server.
  const game = useMemo(() => {
    if (!room) return null
    const rule = registry.get(room.ruleId)
    return rule ? createGame(rule, roomPuzzle(room), defaultDictionary(), { setup: room.setup }) : null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.code, room?.ruleId])

  /** Claimed a username from the room's intro: use it here straight away. */
  const onClaimed = () => {
    const next = getMe()
    setMe(next)
    api.rename(next.name)
  }

  if (api.error) return <RoomMessage title="NO GAME" text={api.error.message} />
  if (!room || !game) {
    return (
      <RoomMessage
        title="JOINING"
        text={api.connection === 'reconnecting' ? 'Can’t reach the game server yet. Retrying…' : `Connecting to game ${code}…`}
        busy
      />
    )
  }
  return <GameScreen key={room.code} game={game} coop={{ api, me, username: me.claimed ? me.name : null, onClaimed }} />
}

function RoomMessage({ title, text, busy }: { title: string; text: string; busy?: boolean }) {
  return (
    <div className="stage ink-dark" style={{ ['--ink' as string]: '#111', ['--soft' as string]: 'rgba(17,17,17,.4)' }}>
      <div className="stage-bg" style={{ background: '#F4F1EA' }} />
      <main className="intro">
        <span className="wordmark">
          WORD<span className="wordmark-x">X</span>
        </span>
        <h1 className="intro-title">
          <PosterWord text={title} />
        </h1>
        <div className="rule thick" />
        <p className="intro-tagline" aria-live="polite">
          {text}
        </p>
        {!busy && (
          <div className="intro-cta">
            <ChunkyButton onClick={() => navigate('/')} className="play-btn">
              Back to home
            </ChunkyButton>
          </div>
        )}
      </main>
    </div>
  )
}
