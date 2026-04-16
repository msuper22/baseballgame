-- Migration: Add tournaments, games, challenges, and captain support
-- Run this against existing databases to add the new scheduling features

-- Add is_captain flag to players
ALTER TABLE players ADD COLUMN is_captain INTEGER NOT NULL DEFAULT 0;

-- Add game_id to at_bats (nullable for backward compat)
ALTER TABLE at_bats ADD COLUMN game_id INTEGER REFERENCES games(id);

-- Tournaments
CREATE TABLE IF NOT EXISTS tournaments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  series_id   INTEGER NOT NULL REFERENCES series(id),
  format      TEXT NOT NULL DEFAULT 'round_robin',
  status      TEXT NOT NULL DEFAULT 'draft',
  start_date  TEXT NOT NULL,
  end_date    TEXT NOT NULL,
  created_by  INTEGER NOT NULL REFERENCES players(id),
  created_at  TEXT DEFAULT (datetime('now'))
);

-- Games
CREATE TABLE IF NOT EXISTS games (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id   INTEGER REFERENCES tournaments(id),
  series_id       INTEGER NOT NULL REFERENCES series(id),
  home_team_id    INTEGER NOT NULL REFERENCES teams(id),
  away_team_id    INTEGER NOT NULL REFERENCES teams(id),
  scheduled_date  TEXT NOT NULL,
  scheduled_time  TEXT,
  status          TEXT NOT NULL DEFAULT 'scheduled',
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

-- Game base state
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

-- Challenges
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
  expires_at            TEXT NOT NULL,
  created_at            TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_challenges_teams ON challenges(challenged_team_id, status);
CREATE INDEX IF NOT EXISTS idx_challenges_status ON challenges(status);

-- Tournament standings
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
