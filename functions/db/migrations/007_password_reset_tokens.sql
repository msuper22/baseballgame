-- Migration 007: Admin-issued password reset tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token       TEXT PRIMARY KEY,
  player_id   INTEGER NOT NULL REFERENCES players(id),
  created_by  INTEGER NOT NULL REFERENCES players(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL,
  used_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_prt_player ON password_reset_tokens(player_id);
