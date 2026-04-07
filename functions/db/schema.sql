-- Teams competing in the series
CREATE TABLE IF NOT EXISTS teams (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  invite_code TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Player accounts
CREATE TABLE IF NOT EXISTS players (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  username     TEXT NOT NULL UNIQUE,
  password     TEXT NOT NULL,
  display_name TEXT NOT NULL,
  team_id      INTEGER REFERENCES teams(id),
  role         TEXT NOT NULL DEFAULT 'player',
  is_active    INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT DEFAULT (datetime('now'))
);

-- A competition week
CREATE TABLE IF NOT EXISTS series (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date   TEXT NOT NULL,
  is_active  INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Every production event entered
CREATE TABLE IF NOT EXISTS at_bats (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  series_id   INTEGER NOT NULL REFERENCES series(id),
  player_id   INTEGER NOT NULL REFERENCES players(id),
  team_id     INTEGER NOT NULL REFERENCES teams(id),
  hit_type    TEXT NOT NULL,
  bases       INTEGER NOT NULL,
  runs_scored INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  entered_by  INTEGER REFERENCES players(id),
  created_at  TEXT DEFAULT (datetime('now'))
);

-- Current base state per team per series
CREATE TABLE IF NOT EXISTS base_state (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  series_id   INTEGER NOT NULL REFERENCES series(id),
  team_id     INTEGER NOT NULL REFERENCES teams(id),
  first_base  INTEGER REFERENCES players(id),
  second_base INTEGER REFERENCES players(id),
  third_base  INTEGER REFERENCES players(id),
  total_runs  INTEGER NOT NULL DEFAULT 0,
  total_bases INTEGER NOT NULL DEFAULT 0,
  UNIQUE(series_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_at_bats_series ON at_bats(series_id);
CREATE INDEX IF NOT EXISTS idx_at_bats_player ON at_bats(player_id);
CREATE INDEX IF NOT EXISTS idx_at_bats_team   ON at_bats(team_id, series_id);
CREATE INDEX IF NOT EXISTS idx_players_team   ON players(team_id);
