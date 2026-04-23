-- Migration 006: Add unique colors to teams
-- Fixes collision where team_ids > 6 wrapped modulo the 6-color palette
-- producing duplicate colors (e.g. team 7 and team 1 both blue).

ALTER TABLE teams ADD COLUMN color TEXT;

-- Backfill with unique colors, in team creation order (rowid = insertion order).
-- 10 distinct values — plenty of headroom. Order chosen for high contrast between
-- adjacent ids since new teams typically get adjacent ids.
UPDATE teams
SET color = CASE (SELECT rnk FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY id) - 1 AS rnk FROM teams
) r WHERE r.id = teams.id) % 10
  WHEN 0 THEN '#1e88e5'   -- blue
  WHEN 1 THEN '#e53935'   -- red
  WHEN 2 THEN '#43a047'   -- green
  WHEN 3 THEN '#fb8c00'   -- orange
  WHEN 4 THEN '#8e24aa'   -- purple
  WHEN 5 THEN '#00acc1'   -- cyan
  WHEN 6 THEN '#f4511e'   -- deep-orange
  WHEN 7 THEN '#5e35b1'   -- deep-purple
  WHEN 8 THEN '#00897b'   -- teal
  WHEN 9 THEN '#c0ca33'   -- lime
END
WHERE color IS NULL;
