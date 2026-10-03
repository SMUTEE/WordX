import { hashString } from '../engine/random'
import type { GameState, Puzzle } from '../engine/types'
import type { RoomView } from './protocol'

/** The server's room as the engine's game state. */
export function roomToState(room: RoomView, puzzleId: string): GameState {
  return {
    puzzleId,
    guesses: room.guesses.map((g) => ({ word: g.word, feedback: g.feedback, submittedAt: g.at })),
    status: room.status,
    startedAt: room.createdAt,
    hints: room.hints,
    timeLimit: room.timeLimit,
    deadline: room.deadline,
    endReason: room.endReason,
  }
}

/**
 * The client's view of a room's puzzle. The answer stays on the server, so this carries a
 * placeholder; the client only validates guesses locally and never scores them.
 */
export function roomPuzzle(room: RoomView): Puzzle {
  return {
    id: `room:${room.code}`,
    number: 0,
    date: room.slot.slice(0, 10),
    slot: room.slot,
    ruleId: room.ruleId,
    ruleVersion: room.ruleVersion,
    seed: hashString(room.code),
    answer: { word: '?'.repeat(room.setup.length) },
    meta: room.meta,
    preview: true,
  }
}
