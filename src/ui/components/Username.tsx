import { useEffect, useId, useState } from 'react'
import { getMe } from '../../net/identity'
import { checkUsername, claimUsername, type Availability } from '../../net/username'
import { ChunkyButton } from './Bits'

/** Pick a unique username: checks availability as you type, then reserves it. */
export function UsernameClaim({ cta = 'Claim username', onClaimed }: { cta?: string; onClaimed(name: string): void }) {
  const id = useId()
  const me = getMe()
  const [name, setName] = useState(me.name)
  const [checked, setChecked] = useState<{ name: string; result: Availability } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const unchanged = me.claimed && name === me.name
  const wanted = name.trim()
  // The latest answer applies only to the name it was asked about; anything newer is still checking.
  const status: Availability = !wanted || unchanged ? { state: 'idle' } : checked?.name === wanted ? checked.result : { state: 'checking' }

  useEffect(() => {
    if (!wanted || unchanged) return
    const t = window.setTimeout(async () => setChecked({ name: wanted, result: await checkUsername(wanted) }), 350)
    return () => window.clearTimeout(t)
  }, [wanted, unchanged])

  const claim = async () => {
    setBusy(true)
    setError(null)
    const r = await claimUsername(name.trim())
    setBusy(false)
    if (!r.ok) return setError(r.error)
    onClaimed(name.trim())
  }

  const message =
    status.state === 'available'
      ? `@${name.trim()} is yours if you want it`
      : status.state === 'checking'
        ? 'Checking…'
        : 'message' in status
          ? status.message
          : unchanged
            ? 'This is your username'
            : 'Letters, numbers and _ · 3 to 16 characters'

  return (
    <div className="username-claim">
      <label className="name-field" htmlFor={id}>
        <span className="name-label">Username</span>
        <span className="username-input-wrap">
          <span className="username-at" aria-hidden="true">
            @
          </span>
          <input
            id={id}
            className="name-input username-input"
            value={name}
            maxLength={16}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="tolu_reads"
            onChange={(e) => setName(e.target.value.replace(/\s+/g, ''))}
            aria-describedby={`${id}-status`}
            aria-invalid={status.state === 'taken' || status.state === 'invalid'}
          />
        </span>
        <span id={`${id}-status`} className={`username-status username-${status.state}`} role="status">
          {message}
        </span>
      </label>
      {error && (
        <p className="name-error" role="alert">
          {error}
        </p>
      )}
      {!unchanged && (
        <ChunkyButton onClick={claim} className="play-btn">
          {busy ? 'Saving…' : cta}
        </ChunkyButton>
      )}
    </div>
  )
}
