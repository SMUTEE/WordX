# WordX

One word game, a new rule every six hours. You already know how to play — you don't know what this drop's rule is.

```bash
npm install
npm run dev      # app on http://localhost:5173 + game server on :8787
npm test         # engine, rules, and server (two simulated players) tests
npm run build
npm start        # production: one process serves the app and the game server
npm run record   # re-record the demo clips into recordings/ (uses your installed Chrome)
```

## Playing with friends (the game server)

`server/` is a small Node server: HTTP for creating rooms, WebSockets for live play, SQLite (Node's built-in driver) for storage. It is authoritative — the answer never leaves the server until the game ends; every guess is validated, turn-checked and scored there with the same engine the app uses.

- Rooms have a 6-character code and a link `/room/CODE`. Up to 8 players take turns; everyone sees the turn holder's letters live and each guess as it lands.
- If the turn holder leaves or loses connection, the turn moves on after 20 seconds. They can rejoin any time with the link.
- Each player is a random id plus a device secret, so nobody can play as someone else.
- Guesses carry an id, so a retry after a dropped connection never counts twice. Clients reconnect with backoff and resync from the server's snapshot.
- Messages are rate-limited, payloads capped, dead sockets dropped by heartbeat, and rooms untouched for 14 days are deleted.

### Deploying to Cloudflare (free plan)

The app, API, live rooms (one Durable Object per game) and progress backups all run on Cloudflare's free plan.

```bash
npx wrangler login                      # once
npx wrangler secret put DROP_SALT       # once: any long random string; keeps daily-drop answers secret
npm run deploy                          # build + deploy
```

`npm run cf:dev` runs the same thing locally on Cloudflare's runtime (uses `.dev.vars` for the salt).

### Deploying with Docker (any host)

Any host that runs a Docker container with a persistent disk works (Fly.io, Render, Railway). The app and the server ship together:

```bash
docker build -t wordx .
docker run -p 8080:8080 -v wordx-data:/data wordx
```

Environment: `PORT` (default 8080 in the image), `WORDX_DB` (default `/data/wordx.db`), `WORDX_DROP_SALT` (required in production — keeps daily-drop answers secret). Mount a volume at `/data` or games are lost on redeploy. WebSockets must be allowed (they are by default on those hosts). `GET /api/health` reports status.

Preview any rule with `?rule=fog` (also `standard`, `category`, `anagram`, `decay`, `vowel`, `naija`, `liar`) and any drop with `?slot=2026-10-05T12` (or `?date=2026-10-05` for that day's first drop). Previews are marked "Practice" and never touch your stats.

## Modes

- **Journey** (`/journey`): ten levels on a road map. Clear one to unlock the next; stars for solving with tries to spare and no hints. Each level turns several dials — rule, word length (4 → 5 → 6), how common the word is, tries and hints. See `src/journey/levels.ts`. Every player walks their own shuffled order of each level's pool, so people at the same level rarely share a word, and nobody repeats a word until they've used the pool.
- **Daily drop** (`/play`): one global word every 6 hours.
- **With friends** (`/room/CODE`): live turn-based rooms on the game server.

Every game can be timed (off, 4, 5 or 10 minutes, chosen before the first guess) and has an "I give up" option that reveals the word.

## Word data

`npm run dict` regenerates `src/data/dictionary.generated.ts` (40k+ 4–6 letter guesses) and `src/data/pools.generated.ts` (6,000+ Journey answers banded by SCOWL frequency tiers, base forms only, offensive words blocked).

## Drops

A new global puzzle drops every 6 hours (00, 06, 12, 18 UTC), each with the next rule in the rotation. A streak counts days in a row with at least one solve.

## Relay

Friends solve one board together, one try each. The link carries the rule, a private puzzle id, the players and their words — never the answer — so there's no server. Feedback is recomputed from the words when the link opens. See `src/ui/relay.ts`.

## Categories

`src/data/categories.ts` holds 40+ themes and 1,100+ five-letter words. Category drops walk one shuffled queue of every word, so nothing repeats until the whole pool is used and the same theme never comes up twice in a row.

## How it fits together

```
src/engine/    the game loop — knows no rule by name
  engine.ts      validate → score → update; invalid guesses never cost an attempt
  schedule.ts    drop + rule + version → the same puzzle everywhere (6-hour UTC drops)
  registry.ts    rejects rules whose declared capabilities don't match their hooks
src/rules/     one module per rule, each overriding only what it declares
src/data/      curated answers, categories, Naija vocabulary, schedule.json
src/ui/        React + Motion
  motion/presets.ts   each rule's signature reveal, entrance and celebration
  motion/Ambient.tsx  each rule's background world
```

### Adding a rule

1. Write `src/rules/<name>.ts` exporting a `GameRule` (see `decay.ts` for a small one).
2. Register it in `src/rules/index.ts`.
3. Put it in `src/data/schedule.json` (rotation or a dated override).

Pick an existing motion preset or add one to `presets.ts`. The engine, board, keyboard, storage and sharing don't change — `engine.test.ts` has a Palindrome rule that proves it.

### Schedule

`schedule.json` holds the rotation (one rule per drop), per-drop overrides like `"2026-10-03T06"`, and feature flags. A flagged-off rule (Liar, until it's solver-tested) falls back to Classic on its scheduled days but can still be practised.

### Dictionary

Guesses are checked against `src/data/dictionary.generated.ts` (5-letter words from `an-array-of-english-words`) plus every curated word. Rebuild with `npm run dict`.
