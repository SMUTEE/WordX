import { useCallback, useEffect, useState } from 'react'
import type { DayCount, StatsView } from '../../net/statsView'
import { stageOf } from '../../journey/levels'
import { registry } from '../../rules'
import { navigate } from '../router'
import { usePageScroll } from '../usePageScroll'

const KEY = 'wordx:admin-key'
const loadKey = () => {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : '–')
const ruleName = (id: string) => registry.get(id)?.presentation.name ?? id
const short = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
const ago = (at: number) => {
  const m = Math.round((Date.now() - at) / 60_000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`
}

/** The private stats page: who's playing and how. Unlocked with the admin key. */
export default function AdminScreen() {
  usePageScroll()
  const [key, setKey] = useState(loadKey)
  const [draft, setDraft] = useState('')
  const [data, setData] = useState<StatsView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (k: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/stats', { headers: { authorization: `Bearer ${k}` } })
      if (res.status === 401) {
        setError('That key didn’t work.')
        setKey('')
        try {
          localStorage.removeItem(KEY)
        } catch {
          // Nothing saved.
        }
        return
      }
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Error ${res.status}`)
      setData(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t load stats')
    } finally {
      setLoading(false)
    }
  }, [])

  // Load once a key is set (on arrival, or after unlocking).
  useEffect(() => {
    if (!key) return
    const t = window.setTimeout(() => void load(key), 0)
    return () => window.clearTimeout(t)
  }, [key, load])

  const unlock = (e: React.FormEvent) => {
    e.preventDefault()
    const k = draft.trim()
    if (!k) return
    try {
      localStorage.setItem(KEY, k)
    } catch {
      // Ask again next time.
    }
    setDraft('')
    setKey(k)
  }

  const signOut = () => {
    try {
      localStorage.removeItem(KEY)
    } catch {
      // Nothing saved.
    }
    setKey('')
    setData(null)
  }

  return (
    <div className="admin">
      <header className="admin-head">
        <button type="button" className="admin-wordmark" onClick={() => navigate('/')}>
          WORD<span>X</span>
        </button>
        <h1>Stats</h1>
        {key && (
          <div className="admin-actions">
            <button type="button" className="admin-btn" onClick={() => load(key)} disabled={loading}>
              {loading ? 'Loading…' : 'Refresh'}
            </button>
            <button type="button" className="admin-link" onClick={signOut}>
              Sign out
            </button>
          </div>
        )}
      </header>

      {!key ? (
        <form className="admin-gate" onSubmit={unlock}>
          <p>This page is private. Enter your admin key.</p>
          <input type="password" autoComplete="current-password" aria-label="Admin key" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Admin key" />
          <button type="submit" className="admin-btn">
            Open stats
          </button>
          {error && <p className="admin-error">{error}</p>}
        </form>
      ) : error ? (
        <p className="admin-error">{error}</p>
      ) : !data ? (
        <p className="admin-muted">Loading…</p>
      ) : (
        <Dashboard s={data} />
      )}
    </div>
  )
}

function Dashboard({ s }: { s: StatsView }) {
  const t = s.totals
  const stages = new Map<string, number>()
  for (const r of s.journey.reached) {
    const st = stageOf(r.level)
    if (st) stages.set(st.name, (stages.get(st.name) ?? 0) + r.players)
  }
  const furthest = s.journey.reached.at(-1)?.level
  return (
    <>
      <p className="admin-muted">Updated {new Date(s.generatedAt).toLocaleString()} · all times UTC days</p>
      <section className="admin-kpis">
        <Kpi label="Players" value={t.players} />
        <Kpi label="With a username" value={t.named} />
        <Kpi label="Active today" value={t.activeToday} />
        <Kpi label="Active, last 7 days" value={t.active7} />
        <Kpi label="Games finished" value={t.gamesFinished} />
        <Kpi label="Games today" value={t.gamesToday} />
      </section>

      <section className="admin-grid">
        <Card title="New players · 30 days">
          <Bars rows={s.newPlayers} />
        </Card>
        <Card title="Active players · 30 days">
          <Bars rows={s.activePlayers} />
        </Card>
      </section>

      <section className="admin-grid">
        <Card title="Coming back">
          <Stat label="Next day" value={pct(s.retention.day1.back, s.retention.day1.cohort)} sub={`${s.retention.day1.back} of ${s.retention.day1.cohort} players`} />
          <Stat label="A week later" value={pct(s.retention.day7.back, s.retention.day7.cohort)} sub={`${s.retention.day7.back} of ${s.retention.day7.cohort} players`} />
          <p className="admin-note">Of players who started at least that long ago, the share who played again exactly 1 or 7 days after their first day.</p>
        </Card>
        <Card title="Games by mode">
          <Table head={['Mode', 'Games', 'Won']} rows={s.modes.map((m) => [cap(m.mode), m.games, pct(m.won, m.games)])} empty="No finished games yet" />
        </Card>
      </section>

      <Card title="Daily drop · last 14 days">
        <Table head={['Day', 'Plays', 'Won', 'Avg tries to win', 'Gave up']} rows={s.drop.map((d) => [short(d.day), d.plays, pct(d.won, d.plays), d.avgTries ?? '–', d.gaveUp])} empty="No daily drops finished yet" />
      </Card>

      <Card title="Rules · all modes">
        <Table
          head={['Rule', 'Games', 'Win rate', 'Avg tries to win']}
          rows={s.rules.map((r) => [ruleName(r.rule), r.games, <Meter key={r.rule} value={r.games ? r.won / r.games : 0} />, r.avgTries ?? '–'])}
          empty="No games yet"
        />
      </Card>

      <section className="admin-grid">
        <Card title="Journey · how far players get">
          {furthest && <p className="admin-note">Furthest level cleared: {furthest}</p>}
          <Table head={['Stage reached', 'Players']} rows={[...stages].map(([name, n]) => [name, n])} empty="Nobody has cleared a level yet" />
        </Card>
        <Card title="Journey · Easy vs Scholar">
          <Table head={['Mode', 'Games', 'Won']} rows={s.journey.difficulty.map((d) => [cap(d.difficulty), d.games, pct(d.won, d.games)])} empty="No Journey games yet" />
          <h3>Toughest levels</h3>
          <Table head={['Level', 'Losses', 'Wins']} rows={s.journey.stuck.map((l) => [l.level, l.losses, l.wins])} empty="No losses yet" />
        </Card>
      </section>

      <section className="admin-grid">
        <Card title="Top points">
          <Table head={['Player', 'Points', 'Levels']} rows={s.journey.topPoints.map((p) => [p.name ? `@${p.name}` : 'Anonymous', p.points.toLocaleString(), p.levels])} empty="No points yet" />
        </Card>
        <Card title="Friends games">
          <Stat label="Created" value={String(s.friends.created)} />
          <Stat label="A friend joined" value={String(s.friends.started)} sub={pct(s.friends.started, s.friends.created) + ' of games created'} />
          <Table head={['How they ended', 'Games']} rows={s.friends.finished.map((f) => [cap(f.reason), f.n])} empty="None finished yet" />
        </Card>
      </section>

      <Card title="Latest activity">
        <ul className="admin-feed">
          {s.recent.length === 0 && <li className="admin-muted">Nothing yet</li>}
          {s.recent.map((e, i) => (
            <li key={i}>
              <strong>{e.name ? `@${e.name}` : 'Someone'}</strong> {describe(e)}
              <span>{ago(e.at)}</span>
            </li>
          ))}
        </ul>
      </Card>

      <p className="admin-note">
        Visitors, countries, devices and where traffic comes from: turn on Cloudflare Web Analytics in your Cloudflare dashboard (free, no cookies).
      </p>
    </>
  )
}

function describe(e: StatsView['recent'][number]) {
  const what = e.result === 'won' ? 'won' : e.result === 'lost' ? 'lost' : null
  const where = e.mode === 'journey' ? `Journey level ${e.level}` : e.mode === 'drop' ? 'the daily drop' : e.mode === 'friends' ? 'a friends game' : e.mode === 'practice' ? 'a practice game' : ''
  const rule = e.rule ? ` (${ruleName(e.rule)})` : ''
  if (e.kind === 'room_created') return `started a friends game${rule}`
  if (e.kind === 'room_started') return `got a friend into their game${rule}`
  if (e.kind === 'room_finished') return `’s friends game ${what ?? 'ended'}${rule}`
  return `${what ?? 'finished'} ${where}${rule}`
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace('-', ' ')

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="admin-kpi">
      <strong>{value.toLocaleString()}</strong>
      <span>{label}</span>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="admin-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {sub && <em>{sub}</em>}
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="admin-card">
      <h2>{title}</h2>
      {children}
    </section>
  )
}

function Bars({ rows }: { rows: DayCount[] }) {
  const top = Math.max(1, ...rows.map((r) => r.n))
  const total = rows.reduce((a, r) => a + r.n, 0)
  return (
    <div>
      <div className="admin-bars" role="img" aria-label={`${total} over 30 days`}>
        {rows.map((r) => (
          <span key={r.day} title={`${short(r.day)}: ${r.n}`} style={{ height: `${Math.max(2, (100 * r.n) / top)}%` }} className={r.n ? '' : 'admin-bar-zero'} />
        ))}
      </div>
      <div className="admin-bars-axis">
        <span>{short(rows[0].day)}</span>
        <span>{total.toLocaleString()} total · peak {top}</span>
        <span>{short(rows.at(-1)!.day)}</span>
      </div>
    </div>
  )
}

function Meter({ value }: { value: number }) {
  return (
    <span className="admin-meter">
      <span>
        <span style={{ width: `${Math.round(value * 100)}%` }} />
      </span>
      <em>{Math.round(value * 100)}%</em>
    </span>
  )
}

function Table({ head, rows, empty }: { head: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (!rows.length) return <p className="admin-muted">{empty}</p>
  return (
    <table className="admin-table">
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
