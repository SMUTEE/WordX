-- Anonymous usage events for the stats page. A player is the app's random device id;
-- name is their WordX username if they claimed one. Nothing else about a person is stored.
CREATE TABLE IF NOT EXISTS stat_players (
  id TEXT PRIMARY KEY,
  name TEXT,
  first_seen INTEGER NOT NULL,
  first_day TEXT NOT NULL,
  last_seen INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS stat_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  day TEXT NOT NULL,
  player TEXT NOT NULL,
  kind TEXT NOT NULL,          -- open | finish | room_created | room_started | room_finished
  ref TEXT,                    -- the puzzle or room, so a finished game is counted once
  mode TEXT,                   -- drop | journey | friends | practice
  rule TEXT,
  level INTEGER,
  difficulty TEXT,             -- easy | scholar (Journey)
  result TEXT,                 -- won | lost
  reason TEXT,                 -- tries | time | gave-up | ended
  tries INTEGER,
  max_tries INTEGER,
  hints INTEGER,
  points INTEGER
);

CREATE INDEX IF NOT EXISTS stat_events_day ON stat_events (day);
CREATE INDEX IF NOT EXISTS stat_events_kind_day ON stat_events (kind, day);
CREATE INDEX IF NOT EXISTS stat_players_first_day ON stat_players (first_day);
-- One finish per player per game, however often the app reports it.
CREATE UNIQUE INDEX IF NOT EXISTS stat_events_once ON stat_events (player, kind, ref) WHERE ref IS NOT NULL;
