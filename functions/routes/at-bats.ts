import { Hono } from 'hono';
import { Env, HitType, HIT_BASES, AtBat } from '../types';
import { authRequired, modRequired, adminRequired } from '../middleware/auth';
import { simulateAtBat, replayAtBats, RunnerState } from '../services/simulation';

export const atBatRoutes = new Hono<{ Bindings: Env }>();

// Log a production event (mod+ or self)
atBatRoutes.post('/', authRequired, async (c) => {
  const user = c.get('user');
  const { player_id, hit_type, description } = await c.req.json();

  // Players can log for themselves, mods/admins can log for anyone
  if (user.role === 'player' && player_id !== user.sub) {
    return c.json({ error: 'Players can only log their own events' }, 403);
  }

  if (!player_id || !hit_type) {
    return c.json({ error: 'player_id and hit_type required' }, 400);
  }

  const validTypes: HitType[] = ['single', 'double', 'triple', 'home_run'];
  if (!validTypes.includes(hit_type)) {
    return c.json({ error: 'Invalid hit_type. Must be: single, double, triple, home_run' }, 400);
  }

  // Get active series
  const series = await c.env.DB.prepare(
    'SELECT id FROM series WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1'
  ).first<{ id: number }>();
  if (!series) return c.json({ error: 'No active series' }, 400);

  // Get player's team
  const player = await c.env.DB.prepare(
    'SELECT id, team_id, display_name FROM players WHERE id = ? AND is_active = 1'
  ).bind(player_id).first<{ id: number; team_id: number; display_name: string }>();
  if (!player || !player.team_id) {
    return c.json({ error: 'Player not found or not on a team' }, 400);
  }

  // Get current base state
  let baseStateRow = await c.env.DB.prepare(
    'SELECT * FROM base_state WHERE series_id = ? AND team_id = ?'
  ).bind(series.id, player.team_id).first<any>();

  // Create base_state if it doesn't exist yet
  if (!baseStateRow) {
    await c.env.DB.prepare(
      'INSERT INTO base_state (series_id, team_id) VALUES (?, ?)'
    ).bind(series.id, player.team_id).run();
    baseStateRow = { first_base: null, second_base: null, third_base: null, total_runs: 0, total_bases: 0 };
  }

  const currentBases: RunnerState = {
    first: baseStateRow.first_base,
    second: baseStateRow.second_base,
    third: baseStateRow.third_base,
  };

  // Run simulation
  const result = simulateAtBat(currentBases, player.id, hit_type as HitType);
  const bases = HIT_BASES[hit_type as HitType];

  // Insert at-bat record
  await c.env.DB.prepare(
    `INSERT INTO at_bats (series_id, player_id, team_id, hit_type, bases, runs_scored, description, entered_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    series.id, player.id, player.team_id, hit_type, bases,
    result.runsScored, description || null, user.sub
  ).run();

  // Update base state
  await c.env.DB.prepare(
    `UPDATE base_state SET first_base = ?, second_base = ?, third_base = ?,
     total_runs = total_runs + ?, total_bases = total_bases + ?
     WHERE series_id = ? AND team_id = ?`
  ).bind(
    result.newBases.first, result.newBases.second, result.newBases.third,
    result.runsScored, bases, series.id, player.team_id
  ).run();

  // Fetch updated base state with player names
  const updatedState = await getBaseStateWithNames(c.env.DB, series.id, player.team_id);

  return c.json({
    at_bat: { player_name: player.display_name, hit_type, bases, runs_scored: result.runsScored },
    base_state: updatedState,
    scoring_players: result.scoringPlayerIds,
  }, 201);
});

// Get at-bat history
atBatRoutes.get('/', authRequired, async (c) => {
  const seriesId = c.req.query('series_id');
  const teamId = c.req.query('team_id');
  const playerId = c.req.query('player_id');

  let query = `SELECT ab.*, p.display_name as player_name, t.name as team_name
               FROM at_bats ab
               JOIN players p ON ab.player_id = p.id
               JOIN teams t ON ab.team_id = t.id
               WHERE 1=1`;
  const params: any[] = [];

  if (seriesId) { query += ' AND ab.series_id = ?'; params.push(seriesId); }
  if (teamId) { query += ' AND ab.team_id = ?'; params.push(teamId); }
  if (playerId) { query += ' AND ab.player_id = ?'; params.push(playerId); }

  query += ' ORDER BY ab.created_at DESC LIMIT 100';

  const stmt = params.length
    ? c.env.DB.prepare(query).bind(...params)
    : c.env.DB.prepare(query);
  const atBats = await stmt.all();
  return c.json({ at_bats: atBats.results });
});

// Delete at-bat (admin undo) - replays all events to rebuild state
atBatRoutes.delete('/:id', authRequired, adminRequired, async (c) => {
  const id = c.req.param('id');

  // Get the at-bat to find series_id and team_id
  const atBat = await c.env.DB.prepare(
    'SELECT * FROM at_bats WHERE id = ?'
  ).bind(id).first<AtBat>();
  if (!atBat) return c.json({ error: 'At-bat not found' }, 404);

  // Delete it
  await c.env.DB.prepare('DELETE FROM at_bats WHERE id = ?').bind(id).run();

  // Replay all remaining at-bats for this team+series
  const remaining = await c.env.DB.prepare(
    'SELECT player_id, hit_type FROM at_bats WHERE series_id = ? AND team_id = ? ORDER BY created_at ASC'
  ).bind(atBat.series_id, atBat.team_id).all();

  const replayed = replayAtBats(
    remaining.results as { player_id: number; hit_type: HitType }[]
  );

  // Update base state
  await c.env.DB.prepare(
    `UPDATE base_state SET first_base = ?, second_base = ?, third_base = ?,
     total_runs = ?, total_bases = ?
     WHERE series_id = ? AND team_id = ?`
  ).bind(
    replayed.bases.first, replayed.bases.second, replayed.bases.third,
    replayed.totalRuns, replayed.totalBases, atBat.series_id, atBat.team_id
  ).run();

  return c.json({ success: true, new_state: replayed });
});

async function getBaseStateWithNames(db: D1Database, seriesId: number, teamId: number) {
  const state = await db.prepare(`
    SELECT bs.*,
      p1.display_name as first_base_name,
      p2.display_name as second_base_name,
      p3.display_name as third_base_name
    FROM base_state bs
    LEFT JOIN players p1 ON bs.first_base = p1.id
    LEFT JOIN players p2 ON bs.second_base = p2.id
    LEFT JOIN players p3 ON bs.third_base = p3.id
    WHERE bs.series_id = ? AND bs.team_id = ?
  `).bind(seriesId, teamId).first();
  return state;
}
