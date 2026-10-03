import { slotStart } from '../engine/schedule'

/** The drop's start in the player's own time zone, e.g. "3 OCT · 07:00". */
export function formatDrop(slot: string) {
  const start = slotStart(slot)
  const day = start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }).toUpperCase()
  const time = start.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  return `${day} · ${time}`
}

/** "Ada", "Ada and Tunde", "Ada, Tunde and Seun" */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}
