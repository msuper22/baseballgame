-- Migration v2: Team vs Team game structure
-- Run this against existing databases to add new columns and tables

-- Add new columns to at_bats
ALTER TABLE at_bats ADD COLUMN game_id INTEGER REFERENCES games(id);
ALTER TABLE at_bats ADD COLUMN half_inning_id INTEGER REFERENCES half_innings(id);
ALTER TABLE at_bats ADD COLUMN event_side TEXT;
ALTER TABLE at_bats ADD COLUMN credit_time TEXT;
ALTER TABLE at_bats ADD COLUMN strikes_caused INTEGER DEFAULT 0;
ALTER TABLE at_bats ADD COLUMN outs_caused INTEGER DEFAULT 0;

-- Games within a series (two teams paired)
CREATE TABLE IF NOT EXISTS games (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  series_id       INTEGER NOT NULL REFERENCES series(id),
  home_team_id    INTEGER NOT NULL REFERENCES teams(id),
  away_team_id    INTEGER NOT NULL REFERENCES teams(id),
  total_innings   INTEGER NOT NULL DEFAULT 9,
  status          TEXT NOT NULL DEFAULT 'scheduled',
  scheduled_at    TEXT,
  started_at      TEXT,
  completed_at    TEXT,
  current_inning  INTEGER NOT NULL DEFAULT 1,
  current_half    TEXT NOT NULL DEFAULT 'top',
  home_score      INTEGER NOT NULL DEFAULT 0,
  away_score      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT DEFAULT (datetime('now'))
);

-- Half-inning state
CREATE TABLE IF NOT EXISTS half_innings (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id          INTEGER NOT NULL REFERENCES games(id),
  inning_number    INTEGER NOT NULL,
  half             TEXT NOT NULL,
  batting_team_id  INTEGER NOT NULL REFERENCES teams(id),
  fielding_team_id INTEGER NOT NULL REFERENCES teams(id),
  outs             INTEGER NOT NULL DEFAULT 0,
  strikes          INTEGER NOT NULL DEFAULT 0,
  runs_scored      INTEGER NOT NULL DEFAULT 0,
  is_complete      INTEGER NOT NULL DEFAULT 0,
  ended_at         TEXT,
  first_base       INTEGER REFERENCES players(id),
  second_base      INTEGER REFERENCES players(id),
  third_base       INTEGER REFERENCES players(id),
  UNIQUE(game_id, inning_number, half)
);

-- Chat messages for spectator mode
CREATE TABLE IF NOT EXISTS chat_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id    INTEGER NOT NULL REFERENCES games(id),
  player_id  INTEGER NOT NULL REFERENCES players(id),
  message    TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Emoji reactions for spectator mode
CREATE TABLE IF NOT EXISTS reactions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id    INTEGER NOT NULL REFERENCES games(id),
  player_id  INTEGER NOT NULL REFERENCES players(id),
  emoji      TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_games_series       ON games(series_id);
CREATE INDEX IF NOT EXISTS idx_games_status        ON games(status);
CREATE INDEX IF NOT EXISTS idx_half_innings_game    ON half_innings(game_id);
CREATE INDEX IF NOT EXISTS idx_at_bats_game         ON at_bats(game_id);
CREATE INDEX IF NOT EXISTS idx_at_bats_half_inning  ON at_bats(half_inning_id);
CREATE INDEX IF NOT EXISTS idx_chat_game            ON chat_messages(game_id, created_at);
CREATE INDEX IF NOT EXISTS idx_reactions_game       ON reactions(game_id, created_at);
