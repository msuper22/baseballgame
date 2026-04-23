-- Teams competing in the series
CREATE TABLE IF NOT EXISTS teams (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  invite_code TEXT NOT NULL UNIQUE,
  color      TEXT,
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
  is_captain   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT DEFAULT (datetime('now'))
);

-- A competition week
CREATE TABLE IF NOT EXISTS series (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date   TEXT NOT NULL,
  is_active  INTEGER NOT NULL DEFAULT 1,
  is_locked  INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Every production event entered
CREATE TABLE IF NOT EXISTS at_bats (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  series_id      INTEGER NOT NULL REFERENCES series(id),
  player_id      INTEGER NOT NULL REFERENCES players(id),
  team_id        INTEGER NOT NULL REFERENCES teams(id),
  hit_type       TEXT NOT NULL,
  bases          INTEGER NOT NULL,
  runs_scored    INTEGER NOT NULL DEFAULT 0,
  description    TEXT,
  entered_by     INTEGER REFERENCES players(id),
  game_id        INTEGER REFERENCES games(id),
  half_inning_id INTEGER REFERENCES half_innings(id),
  event_side     TEXT,
  credit_time    TEXT,
  strikes_caused INTEGER DEFAULT 0,
  outs_caused    INTEGER DEFAULT 0,
  created_at     TEXT DEFAULT (datetime('now'))
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

-- Audit log for tracking actions
CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES players(id),
  action      TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id   INTEGER,
  details     TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);

-- Tournaments (round robin containers within a series)
CREATE TABLE IF NOT EXISTS tournaments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  series_id   INTEGER NOT NULL REFERENCES series(id),
  format      TEXT NOT NULL DEFAULT 'round_robin',
  status      TEXT NOT NULL DEFAULT 'draft',
  start_date  TEXT NOT NULL,
  end_date    TEXT NOT NULL,
  created_by  INTEGER NOT NULL REFERENCES players(id),
  innings_per_game INTEGER NOT NULL DEFAULT 9,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- Games (individual head-to-head matchups)
CREATE TABLE IF NOT EXISTS games (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id   INTEGER REFERENCES tournaments(id),
  series_id       INTEGER NOT NULL REFERENCES series(id),
  home_team_id    INTEGER NOT NULL REFERENCES teams(id),
  away_team_id    INTEGER NOT NULL REFERENCES teams(id),
  total_innings   INTEGER NOT NULL DEFAULT 9,
  scheduled_date  TEXT,
  scheduled_time  TEXT,
  scheduled_at    TEXT,
  started_at      TEXT,
  completed_at    TEXT,
  current_inning  INTEGER NOT NULL DEFAULT 1,
  current_half    TEXT NOT NULL DEFAULT 'top',
  status          TEXT NOT NULL DEFAULT 'scheduled',
  home_score      INTEGER NOT NULL DEFAULT 0,
  away_score      INTEGER NOT NULL DEFAULT 0,
  home_runs       INTEGER NOT NULL DEFAULT 0,
  away_runs       INTEGER NOT NULL DEFAULT 0,
  home_bases      INTEGER NOT NULL DEFAULT 0,
  away_bases      INTEGER NOT NULL DEFAULT 0,
  winner_team_id  INTEGER REFERENCES teams(id),
  round           INTEGER,
  game_number     INTEGER,
  created_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_games_series ON games(series_id);
CREATE INDEX IF NOT EXISTS idx_games_tournament ON games(tournament_id);
CREATE INDEX IF NOT EXISTS idx_games_teams ON games(home_team_id, away_team_id);
CREATE INDEX IF NOT EXISTS idx_games_date ON games(scheduled_date);

-- Per-game base state (two rows per game, one per team)
CREATE TABLE IF NOT EXISTS game_base_state (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id     INTEGER NOT NULL REFERENCES games(id),
  team_id     INTEGER NOT NULL REFERENCES teams(id),
  first_base  INTEGER REFERENCES players(id),
  second_base INTEGER REFERENCES players(id),
  third_base  INTEGER REFERENCES players(id),
  total_runs  INTEGER NOT NULL DEFAULT 0,
  total_bases INTEGER NOT NULL DEFAULT 0,
  UNIQUE(game_id, team_id)
);

-- Challenges (captain-initiated game requests)
CREATE TABLE IF NOT EXISTS challenges (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  series_id             INTEGER NOT NULL REFERENCES series(id),
  challenger_team_id    INTEGER NOT NULL REFERENCES teams(id),
  challenged_team_id    INTEGER NOT NULL REFERENCES teams(id),
  challenger_captain_id INTEGER NOT NULL REFERENCES players(id),
  proposed_date         TEXT NOT NULL,
  proposed_time         TEXT,
  message               TEXT,
  status                TEXT NOT NULL DEFAULT 'pending',
  responded_by          INTEGER REFERENCES players(id),
  responded_at          TEXT,
  game_id               INTEGER REFERENCES games(id),
  innings               INTEGER NOT NULL DEFAULT 9,
  expires_at            TEXT NOT NULL,
  created_at            TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_challenges_teams ON challenges(challenged_team_id, status);
CREATE INDEX IF NOT EXISTS idx_challenges_status ON challenges(status);

-- Tournament standings (cached W-L-T per team per tournament)
CREATE TABLE IF NOT EXISTS tournament_standings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id),
  team_id       INTEGER NOT NULL REFERENCES teams(id),
  wins          INTEGER NOT NULL DEFAULT 0,
  losses        INTEGER NOT NULL DEFAULT 0,
  ties          INTEGER NOT NULL DEFAULT 0,
  runs_for      INTEGER NOT NULL DEFAULT 0,
  runs_against  INTEGER NOT NULL DEFAULT 0,
  games_played  INTEGER NOT NULL DEFAULT 0,
  UNIQUE(tournament_id, team_id)
);

-- Half-inning state (per game)
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
CREATE INDEX IF NOT EXISTS idx_half_innings_game ON half_innings(game_id);

-- Chat messages for spectator mode
CREATE TABLE IF NOT EXISTS chat_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id    INTEGER NOT NULL REFERENCES games(id),
  player_id  INTEGER NOT NULL REFERENCES players(id),
  message    TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_chat_game ON chat_messages(game_id, created_at);

-- Emoji reactions for spectator mode
CREATE TABLE IF NOT EXISTS reactions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id    INTEGER NOT NULL REFERENCES games(id),
  player_id  INTEGER NOT NULL REFERENCES players(id),
  emoji      TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reactions_game ON reactions(game_id, created_at);
