import { Hono } from 'hono';
import { Env } from '../types';
import { authRequired } from '../middleware/auth';
import { autoActivateDueGames, autoEndStaleGames } from '../services/game-engine';

export const statsRoutes = new Hono<{ Bindings: Env }>();

// Get game state for a team (current diamond). Runners come ONLY from the
// team's current half-inning while they are actively batting; an idle team
// shows empty bases even if base_state still has stale runners from a prior
// game.
statsRoutes.get('/game-state/:teamId', authRequired, async (c) => {
  const teamId = c.req.param('teamId');
  const seriesId = c.req.query('series_id');

  const sid = seriesId
    ? parseInt(seriesId)
    : ((await c.env.DB.prepare(
        'SELECT id FROM series WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1'
      ).first<{ id: number }>())?.id);
  if (!sid) return c.json({ error: 'No game state found' }, 404);

  const state = await c.env.DB.prepare(`
    SELECT
      bs.series_id, bs.team_id, bs.total_runs, bs.total_bases,
      t.name as team_name,
      t.color as color,
      hi.first_base  AS first_base,
      hi.second_base AS second_base,
      hi.third_base  AS third_base,
      p1.display_name as first_base_name,
      p2.display_name as second_base_name,
      p3.display_name as third_base_name
    FROM base_state bs
    JOIN teams t ON bs.team_id = t.id
    LEFT JOIN games g
      ON g.series_id = bs.series_id
      AND g.status IN ('active', 'extra_innings')
      AND (g.home_team_id = bs.team_id OR g.away_team_id = bs.team_id)
    LEFT JOIN half_innings hi
      ON hi.game_id = g.id
      AND hi.inning_number = g.current_inning
      AND hi.half = g.current_half
      AND hi.batting_team_id = bs.team_id
      AND hi.is_complete = 0
    LEFT JOIN players p1 ON hi.first_base = p1.id
    LEFT JOIN players p2 ON hi.second_base = p2.id
    LEFT JOIN players p3 ON hi.third_base = p3.id
    WHERE bs.team_id = ? AND bs.series_id = ?
  `).bind(teamId, sid).first();

  if (!state) return c.json({ error: 'No game state found' }, 404);
  return c.json({ game_state: state });
});

// Get all team game states (for dashboard or specific series)
statsRoutes.get('/game-states', authRequired, async (c) => {
  await autoActivateDueGames(c.env.DB); await autoEndStaleGames(c.env.DB);
  const seriesId = c.req.query('series_id');

  // Resolve the series we're reporting on
  const sid = seriesId
    ? parseInt(seriesId)
    : ((await c.env.DB.prepare(
        'SELECT id FROM series WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1'
      ).first<{ id: number }>())?.id);

  if (!sid) return c.json({ game_states: [] });

  // Pull series-level totals (runs, TB) — these are the aggregate scoreboard numbers.
  // Runners come ONLY from the team's current half-inning WHILE they are actively batting.
  // When a team is on defense (not batting), their diamond shows empty bases.
  const states = await c.env.DB.prepare(`
    SELECT
      bs.series_id, bs.team_id, bs.total_runs, bs.total_bases,
      t.name as team_name,
      t.color as color,
      hi.first_base  AS first_base,
      hi.second_base AS second_base,
      hi.third_base  AS third_base,
      p1.display_name as first_base_name,
      p2.display_name as second_base_name,
      p3.display_name as third_base_name
    FROM base_state bs
    JOIN teams t ON bs.team_id = t.id
    LEFT JOIN games g
      ON g.series_id = bs.series_id
      AND g.status IN ('active', 'extra_innings')
      AND (g.home_team_id = bs.team_id OR g.away_team_id = bs.team_id)
    LEFT JOIN half_innings hi
      ON hi.game_id = g.id
      AND hi.inning_number = g.current_inning
      AND hi.half = g.current_half
      AND hi.batting_team_id = bs.team_id
      AND hi.is_complete = 0
    LEFT JOIN players p1 ON hi.first_base = p1.id
    LEFT JOIN players p2 ON hi.second_base = p2.id
    LEFT JOIN players p3 ON hi.third_base = p3.id
    WHERE bs.series_id = ?1
    GROUP BY bs.team_id
    ORDER BY bs.total_runs DESC
  `).bind(sid).all();

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

// Who's Hot - top performers in last 48 hours
statsRoutes.get('/whos-hot', authRequired, async (c) => {
  const players = await c.env.DB.prepare(`
    SELECT p.id, p.display_name, t.name as team_name,
      COUNT(ab.id) as recent_at_bats,
      COALESCE(SUM(ab.bases), 0) as recent_bases,
      COALESCE(SUM(ab.runs_scored), 0) as recent_rbi,
      SUM(CASE WHEN ab.hit_type = 'home_run' THEN 1 ELSE 0 END) as recent_hr
    FROM at_bats ab
    JOIN players p ON ab.player_id = p.id
    JOIN teams t ON ab.team_id = t.id
    WHERE ab.created_at >= datetime('now', '-48 hours')
      AND ab.series_id = (SELECT id FROM series WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1)
    GROUP BY p.id
    ORDER BY recent_bases DESC, recent_rbi DESC
    LIMIT 5
  `).all();

  return c.json({ players: players.results });
});

// Awards/MVP for a series
statsRoutes.get('/awards/:seriesId', authRequired, async (c) => {
  const seriesId = c.req.param('seriesId');

  // Most RBIs
  const mostRbi = await c.env.DB.prepare(`
    SELECT p.id, p.display_name, t.name as team_name,
      COALESCE(SUM(ab.runs_scored), 0) as value
    FROM at_bats ab
    JOIN players p ON ab.player_id = p.id
    JOIN teams t ON ab.team_id = t.id
    WHERE ab.series_id = ?
    GROUP BY p.id
    ORDER BY value DESC LIMIT 1
  `).bind(seriesId).first();

  // Most Total Bases
  const mostTb = await c.env.DB.prepare(`
    SELECT p.id, p.display_name, t.name as team_name,
      COALESCE(SUM(ab.bases), 0) as value
    FROM at_bats ab
    JOIN players p ON ab.player_id = p.id
    JOIN teams t ON ab.team_id = t.id
    WHERE ab.series_id = ?
    GROUP BY p.id
    ORDER BY value DESC LIMIT 1
  `).bind(seriesId).first();

  // Most Home Runs
  const mostHr = await c.env.DB.prepare(`
    SELECT p.id, p.display_name, t.name as team_name,
      COUNT(*) as value
    FROM at_bats ab
    JOIN players p ON ab.player_id = p.id
    JOIN teams t ON ab.team_id = t.id
    WHERE ab.series_id = ? AND ab.hit_type = 'home_run'
    GROUP BY p.id
    ORDER BY value DESC LIMIT 1
  `).bind(seriesId).first();

  // Most At Bats (hustle award)
  const mostAb = await c.env.DB.prepare(`
    SELECT p.id, p.display_name, t.name as team_name,
      COUNT(*) as value
    FROM at_bats ab
    JOIN players p ON ab.player_id = p.id
    JOIN teams t ON ab.team_id = t.id
    WHERE ab.series_id = ?
    GROUP BY p.id
    ORDER BY value DESC LIMIT 1
  `).bind(seriesId).first();

  // Best SLG (min 5 AB)
  const bestSlg = await c.env.DB.prepare(`
    SELECT p.id, p.display_name, t.name as team_name,
      ROUND(CAST(SUM(ab.bases) AS REAL) / COUNT(ab.id), 3) as value
    FROM at_bats ab
    JOIN players p ON ab.player_id = p.id
    JOIN teams t ON ab.team_id = t.id
    WHERE ab.series_id = ?
    GROUP BY p.id
    HAVING COUNT(ab.id) >= 5
    ORDER BY value DESC LIMIT 1
  `).bind(seriesId).first();

  // Grand slams
  const grandSlams = await c.env.DB.prepare(`
    SELECT p.id, p.display_name, t.name as team_name,
      COUNT(*) as value
    FROM at_bats ab
    JOIN players p ON ab.player_id = p.id
    JOIN teams t ON ab.team_id = t.id
    WHERE ab.series_id = ? AND ab.runs_scored >= 4
    GROUP BY p.id
    ORDER BY value DESC
  `).bind(seriesId).all();

  // Winning team
  const winningTeam = await c.env.DB.prepare(`
    SELECT t.id, t.name, bs.total_runs as value
    FROM base_state bs
    JOIN teams t ON bs.team_id = t.id
    WHERE bs.series_id = ?
    ORDER BY bs.total_runs DESC LIMIT 1
  `).bind(seriesId).first();

  return c.json({
    awards: {
      mvp_rbi: mostRbi,
      mvp_bases: mostTb,
      hr_leader: mostHr,
      hustle: mostAb,
      best_slg: bestSlg,
      grand_slams: grandSlams?.results || [],
      winning_team: winningTeam,
    },
  });
});

// Head-to-head team comparison
statsRoutes.get('/head-to-head', authRequired, async (c) => {
  const team1 = c.req.query('team1');
  const team2 = c.req.query('team2');
  const seriesId = c.req.query('series_id');

  if (!team1 || !team2) return c.json({ error: 'team1 and team2 required' }, 400);

  const seriesSubquery = seriesId
    ? parseInt(seriesId).toString()
    : `(SELECT id FROM series WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1)`;

  const getTeamStats = async (teamId: string) => {
    return c.env.DB.prepare(`
      SELECT t.id, t.name,
        COALESCE(bs.total_runs, 0) as total_runs,
        COALESCE(bs.total_bases, 0) as total_bases,
        COUNT(ab.id) as total_at_bats,
        COALESCE(SUM(ab.runs_scored), 0) as total_rbi,
        SUM(CASE WHEN ab.hit_type = 'single' THEN 1 ELSE 0 END) as singles,
        SUM(CASE WHEN ab.hit_type = 'double' THEN 1 ELSE 0 END) as doubles,
        SUM(CASE WHEN ab.hit_type = 'triple' THEN 1 ELSE 0 END) as triples,
        SUM(CASE WHEN ab.hit_type = 'home_run' THEN 1 ELSE 0 END) as home_runs,
        CASE WHEN COUNT(ab.id) > 0 THEN ROUND(CAST(SUM(ab.bases) AS REAL) / COUNT(ab.id), 3) ELSE 0 END as slg
      FROM teams t
      LEFT JOIN base_state bs ON bs.team_id = t.id AND bs.series_id = ${seriesSubquery}
      LEFT JOIN at_bats ab ON ab.team_id = t.id AND ab.series_id = ${seriesSubquery}
      WHERE t.id = ?
      GROUP BY t.id
    `).bind(teamId).first();
  };

  const [stats1, stats2] = await Promise.all([getTeamStats(team1), getTeamStats(team2)]);

  return c.json({ team1: stats1, team2: stats2 });
});

// Highlights - big plays (multi-run events, grand slams)
statsRoutes.get('/highlights', authRequired, async (c) => {
  const seriesId = c.req.query('series_id');

  const seriesFilter = seriesId
    ? `ab.series_id = ${parseInt(seriesId)}`
    : `ab.series_id = (SELECT id FROM series WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1)`;

  const highlights = await c.env.DB.prepare(`
    SELECT ab.*, p.display_name as player_name, t.name as team_name
    FROM at_bats ab
    JOIN players p ON ab.player_id = p.id
    JOIN teams t ON ab.team_id = t.id
    WHERE ${seriesFilter} AND ab.runs_scored >= 2
    ORDER BY ab.runs_scored DESC, ab.created_at DESC
    LIMIT 20
  `).all();

  return c.json({ highlights: highlights.results });
});

// CSV export for player stats
statsRoutes.get('/export/players', authRequired, async (c) => {
  const seriesId = c.req.query('series_id');

  let where = seriesId
    ? `ab.series_id = ${parseInt(seriesId)}`
    : `ab.series_id = (SELECT id FROM series WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1)`;

  const players = await c.env.DB.prepare(`
    SELECT p.display_name, t.name as team_name,
      COUNT(ab.id) as at_bats,
      COALESCE(SUM(ab.bases), 0) as total_bases,
      COALESCE(SUM(ab.runs_scored), 0) as rbi,
      SUM(CASE WHEN ab.hit_type = 'single' THEN 1 ELSE 0 END) as singles,
      SUM(CASE WHEN ab.hit_type = 'double' THEN 1 ELSE 0 END) as doubles,
      SUM(CASE WHEN ab.hit_type = 'triple' THEN 1 ELSE 0 END) as triples,
      SUM(CASE WHEN ab.hit_type = 'home_run' THEN 1 ELSE 0 END) as home_runs,
      CASE WHEN COUNT(ab.id) > 0 THEN ROUND(CAST(SUM(ab.bases) AS REAL) / COUNT(ab.id), 3) ELSE 0 END as slg
    FROM players p
    JOIN teams t ON p.team_id = t.id
    LEFT JOIN at_bats ab ON ab.player_id = p.id AND ${where}
    WHERE p.is_active = 1 AND p.team_id IS NOT NULL
    GROUP BY p.id
    ORDER BY total_bases DESC
  `).all();

  let csv = 'Player,Team,AB,TB,RBI,1B,2B,3B,HR,SLG\n';
  for (const p of players.results as any[]) {
    csv += `"${p.display_name}","${p.team_name}",${p.at_bats},${p.total_bases},${p.rbi},${p.singles},${p.doubles},${p.triples},${p.home_runs},${p.slg}\n`;
  }

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="player-stats.csv"',
    },
  });
});

// CSV export for team stats
statsRoutes.get('/export/teams', authRequired, async (c) => {
  const seriesId = c.req.query('series_id');

  const seriesSubquery = seriesId
    ? parseInt(seriesId).toString()
    : `(SELECT id FROM series WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1)`;

  const teams = await c.env.DB.prepare(`
    SELECT t.name,
      COALESCE(bs.total_runs, 0) as runs,
      COALESCE(bs.total_bases, 0) as total_bases,
      COUNT(ab.id) as at_bats,
      SUM(CASE WHEN ab.hit_type = 'single' THEN 1 ELSE 0 END) as singles,
      SUM(CASE WHEN ab.hit_type = 'double' THEN 1 ELSE 0 END) as doubles,
      SUM(CASE WHEN ab.hit_type = 'triple' THEN 1 ELSE 0 END) as triples,
      SUM(CASE WHEN ab.hit_type = 'home_run' THEN 1 ELSE 0 END) as home_runs
    FROM teams t
    LEFT JOIN base_state bs ON bs.team_id = t.id AND bs.series_id = ${seriesSubquery}
    LEFT JOIN at_bats ab ON ab.team_id = t.id AND ab.series_id = ${seriesSubquery}
    GROUP BY t.id
    ORDER BY runs DESC
  `).all();

  let csv = 'Team,Runs,TB,AB,1B,2B,3B,HR\n';
  for (const t of teams.results as any[]) {
    csv += `"${t.name}",${t.runs},${t.total_bases},${t.at_bats},${t.singles},${t.doubles},${t.triples},${t.home_runs}\n`;
  }

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="team-stats.csv"',
    },
  });
});

// Audit log (admin only)
statsRoutes.get('/audit-log', authRequired, async (c) => {
  const user = c.get('user');
  if (user.role !== 'admin') return c.json({ error: 'Admin access required' }, 403);

  const limit = parseInt(c.req.query('limit') || '50');
  const logs = await c.env.DB.prepare(`
    SELECT al.*, p.display_name as user_name
    FROM audit_log al
    JOIN players p ON al.user_id = p.id
    ORDER BY al.created_at DESC
    LIMIT ?
  `).bind(Math.min(limit, 200)).all();

  return c.json({ logs: logs.results });
});
