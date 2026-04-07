import { Hono } from 'hono';
import { Env } from '../types';
import { authRequired } from '../middleware/auth';

export const statsRoutes = new Hono<{ Bindings: Env }>();

// Get game state for a team (current diamond)
statsRoutes.get('/game-state/:teamId', authRequired, async (c) => {
  const teamId = c.req.param('teamId');
  const seriesId = c.req.query('series_id');

  let query = `
    SELECT bs.*,
      t.name as team_name,
      p1.display_name as first_base_name,
      p2.display_name as second_base_name,
      p3.display_name as third_base_name
    FROM base_state bs
    JOIN teams t ON bs.team_id = t.id
    LEFT JOIN players p1 ON bs.first_base = p1.id
    LEFT JOIN players p2 ON bs.second_base = p2.id
    LEFT JOIN players p3 ON bs.third_base = p3.id
    WHERE bs.team_id = ?`;
  const params: any[] = [teamId];

  if (seriesId) {
    query += ' AND bs.series_id = ?';
    params.push(seriesId);
  } else {
    query += ' AND bs.series_id = (SELECT id FROM series WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1)';
  }

  const state = await c.env.DB.prepare(query).bind(...params).first();
  if (!state) return c.json({ error: 'No game state found' }, 404);
  return c.json({ game_state: state });
});

// Get all team game states (for dashboard or specific series)
statsRoutes.get('/game-states', authRequired, async (c) => {
  const seriesId = c.req.query('series_id');

  let seriesFilter: string;
  const params: any[] = [];

  if (seriesId) {
    seriesFilter = 'bs.series_id = ?';
    params.push(parseInt(seriesId));
  } else {
    seriesFilter = 'bs.series_id = (SELECT id FROM series WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1)';
  }

  const query = `
    SELECT bs.*,
      t.name as team_name,
      p1.display_name as first_base_name,
      p2.display_name as second_base_name,
      p3.display_name as third_base_name
    FROM base_state bs
    JOIN teams t ON bs.team_id = t.id
    LEFT JOIN players p1 ON bs.first_base = p1.id
    LEFT JOIN players p2 ON bs.second_base = p2.id
    LEFT JOIN players p3 ON bs.third_base = p3.id
    WHERE ${seriesFilter}
    ORDER BY bs.total_runs DESC`;

  const stmt = params.length
    ? c.env.DB.prepare(query).bind(...params)
    : c.env.DB.prepare(query);
  const states = await stmt.all();
  return c.json({ game_states: states.results });
});

// Team leaderboard
statsRoutes.get('/leaderboard/teams', authRequired, async (c) => {
  const seriesId = c.req.query('series_id');

  const seriesSubquery = seriesId
    ? parseInt(seriesId).toString()
    : `(SELECT id FROM series WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1)`;

  const teams = await c.env.DB.prepare(`
    SELECT t.id, t.name,
      COALESCE(bs.total_runs, 0) as total_runs,
      COALESCE(bs.total_bases, 0) as total_bases,
      COUNT(ab.id) as total_at_bats,
      SUM(CASE WHEN ab.hit_type = 'single' THEN 1 ELSE 0 END) as singles,
      SUM(CASE WHEN ab.hit_type = 'double' THEN 1 ELSE 0 END) as doubles,
      SUM(CASE WHEN ab.hit_type = 'triple' THEN 1 ELSE 0 END) as triples,
      SUM(CASE WHEN ab.hit_type = 'home_run' THEN 1 ELSE 0 END) as home_runs
    FROM teams t
    LEFT JOIN base_state bs ON bs.team_id = t.id
      AND bs.series_id = ${seriesSubquery}
    LEFT JOIN at_bats ab ON ab.team_id = t.id AND ab.series_id = ${seriesSubquery}
    GROUP BY t.id
    ORDER BY total_runs DESC, total_bases DESC
  `).all();

  return c.json({ teams: teams.results });
});

// Individual player profile stats
statsRoutes.get('/player/:id', authRequired, async (c) => {
  const playerId = c.req.param('id');

  // Player info
  const player = await c.env.DB.prepare(`
    SELECT p.id, p.display_name, p.username, p.role, p.created_at,
      t.name as team_name, t.id as team_id
    FROM players p
    LEFT JOIN teams t ON p.team_id = t.id
    WHERE p.id = ?
  `).bind(playerId).first();
  if (!player) return c.json({ error: 'Player not found' }, 404);

  // Career totals (all series combined)
  const career = await c.env.DB.prepare(`
    SELECT
      COUNT(id) as total_at_bats,
      COALESCE(SUM(bases), 0) as total_bases,
      COALESCE(SUM(runs_scored), 0) as runs_batted_in,
      SUM(CASE WHEN hit_type = 'single' THEN 1 ELSE 0 END) as singles,
      SUM(CASE WHEN hit_type = 'double' THEN 1 ELSE 0 END) as doubles,
      SUM(CASE WHEN hit_type = 'triple' THEN 1 ELSE 0 END) as triples,
      SUM(CASE WHEN hit_type = 'home_run' THEN 1 ELSE 0 END) as home_runs
    FROM at_bats
    WHERE player_id = ?
  `).bind(playerId).first();

  // Per-series breakdown
  const seriesStats = await c.env.DB.prepare(`
    SELECT s.id as series_id, s.name as series_name, s.start_date, s.end_date, s.is_active,
      COUNT(ab.id) as total_at_bats,
      COALESCE(SUM(ab.bases), 0) as total_bases,
      COALESCE(SUM(ab.runs_scored), 0) as runs_batted_in,
      SUM(CASE WHEN ab.hit_type = 'single' THEN 1 ELSE 0 END) as singles,
      SUM(CASE WHEN ab.hit_type = 'double' THEN 1 ELSE 0 END) as doubles,
      SUM(CASE WHEN ab.hit_type = 'triple' THEN 1 ELSE 0 END) as triples,
      SUM(CASE WHEN ab.hit_type = 'home_run' THEN 1 ELSE 0 END) as home_runs
    FROM series s
    INNER JOIN at_bats ab ON ab.series_id = s.id AND ab.player_id = ?
    GROUP BY s.id
    ORDER BY s.created_at DESC
  `).bind(playerId).all();

  return c.json({ player, career, series_stats: seriesStats.results });
});

// Individual player leaderboard
statsRoutes.get('/leaderboard/players', authRequired, async (c) => {
  const seriesId = c.req.query('series_id');
  const teamId = c.req.query('team_id');

  let where = seriesId
    ? `ab.series_id = ${parseInt(seriesId)}`
    : `ab.series_id = (SELECT id FROM series WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1)`;

  if (teamId) where += ` AND ab.team_id = ${parseInt(teamId)}`;

  const players = await c.env.DB.prepare(`
    SELECT p.id, p.display_name, t.name as team_name,
      COUNT(ab.id) as total_at_bats,
      COALESCE(SUM(ab.bases), 0) as total_bases,
      COALESCE(SUM(ab.runs_scored), 0) as runs_batted_in,
      SUM(CASE WHEN ab.hit_type = 'single' THEN 1 ELSE 0 END) as singles,
      SUM(CASE WHEN ab.hit_type = 'double' THEN 1 ELSE 0 END) as doubles,
      SUM(CASE WHEN ab.hit_type = 'triple' THEN 1 ELSE 0 END) as triples,
      SUM(CASE WHEN ab.hit_type = 'home_run' THEN 1 ELSE 0 END) as home_runs
    FROM players p
    JOIN teams t ON p.team_id = t.id
    LEFT JOIN at_bats ab ON ab.player_id = p.id AND ${where}
    WHERE p.is_active = 1 AND p.team_id IS NOT NULL
    GROUP BY p.id
    ORDER BY total_bases DESC, runs_batted_in DESC
  `).all();

  return c.json({ players: players.results });
});
