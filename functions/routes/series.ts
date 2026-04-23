import { Hono } from 'hono';
import { Env } from '../types';
import { authRequired, adminRequired } from '../middleware/auth';
import { logAudit } from '../services/audit';
import { updateTournamentStandings } from './tournaments';
import { centralStamp } from '../services/tz';

export const seriesRoutes = new Hono<{ Bindings: Env }>();

// List all series
seriesRoutes.get('/', authRequired, async (c) => {
  const includeDeleted = c.req.query('include_deleted') === 'true';
  const where = includeDeleted ? '' : 'WHERE deleted_at IS NULL';
  const series = await c.env.DB.prepare(
    `SELECT * FROM series ${where} ORDER BY created_at DESC`
  ).all();
  return c.json({ series: series.results });
});

// Get active series
seriesRoutes.get('/active', authRequired, async (c) => {
  const series = await c.env.DB.prepare(
    'SELECT * FROM series WHERE is_active = 1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1'
  ).first();
  if (!series) return c.json({ error: 'No active series' }, 404);
  return c.json({ series });
});

// Create series (admin)
seriesRoutes.post('/', authRequired, adminRequired, async (c) => {
  const { name, start_date, end_date } = await c.req.json();
  if (!name || !start_date || !end_date) {
    return c.json({ error: 'name, start_date, end_date required' }, 400);
  }

  const result = await c.env.DB.prepare(
    'INSERT INTO series (name, start_date, end_date) VALUES (?, ?, ?)'
  ).bind(name, start_date, end_date).run();

  // Initialize base_state for all teams
  const teams = await c.env.DB.prepare('SELECT id FROM teams').all();
  const seriesId = result.meta.last_row_id;

  for (const team of teams.results as any[]) {
    await c.env.DB.prepare(
      'INSERT INTO base_state (series_id, team_id) VALUES (?, ?)'
    ).bind(seriesId, team.id).run();
  }

  return c.json({ series: { id: seriesId, name, start_date, end_date, is_active: 1 } }, 201);
});

// Delete series (admin). By default soft-deletes (sets deleted_at) so
// games/history are preserved. ?force=true performs the full cascade wipe.
seriesRoutes.delete('/:id', authRequired, adminRequired, async (c) => {
  const id = c.req.param('id');
  const force = c.req.query('force') === 'true';

  const series = await c.env.DB.prepare('SELECT id FROM series WHERE id = ?').bind(id).first();
  if (!series) return c.json({ error: 'Series not found' }, 404);

  if (!force) {
    await c.env.DB.prepare(
      'UPDATE series SET deleted_at = ?, is_active = 0 WHERE id = ?'
    ).bind(centralStamp(), id).run();
    return c.json({ success: true, mode: 'soft' });
  }

  // Hard cascade wipe. at_bats deletion must precede half_innings (FK).
  const db = c.env.DB;
  const gameSub = '(SELECT id FROM games WHERE series_id = ?)';
  await db.prepare(`DELETE FROM chat_messages WHERE game_id IN ${gameSub}`).bind(id).run();
  await db.prepare(`DELETE FROM reactions WHERE game_id IN ${gameSub}`).bind(id).run();
  await db.prepare(`DELETE FROM game_base_state WHERE game_id IN ${gameSub}`).bind(id).run();
  await db.prepare('DELETE FROM challenges WHERE series_id = ?').bind(id).run();
  await db.prepare('DELETE FROM tournament_standings WHERE tournament_id IN (SELECT id FROM tournaments WHERE series_id = ?)').bind(id).run();
  await db.prepare('DELETE FROM at_bats WHERE series_id = ?').bind(id).run();
  await db.prepare(`DELETE FROM half_innings WHERE game_id IN ${gameSub}`).bind(id).run();
  await db.prepare('DELETE FROM games WHERE series_id = ?').bind(id).run();
  await db.prepare('DELETE FROM tournaments WHERE series_id = ?').bind(id).run();
  await db.prepare('DELETE FROM base_state WHERE series_id = ?').bind(id).run();
  await db.prepare('DELETE FROM series WHERE id = ?').bind(id).run();

  return c.json({ success: true, mode: 'hard' });
});

// Update series (admin)
seriesRoutes.put('/:id', authRequired, adminRequired, async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const updates: string[] = [];
  const values: any[] = [];

  if (body.name !== undefined) { updates.push('name = ?'); values.push(body.name); }
  if (body.start_date !== undefined) { updates.push('start_date = ?'); values.push(body.start_date); }
  if (body.end_date !== undefined) { updates.push('end_date = ?'); values.push(body.end_date); }
  if (body.is_active !== undefined) { updates.push('is_active = ?'); values.push(body.is_active); }
  if (body.is_locked !== undefined) { updates.push('is_locked = ?'); values.push(body.is_locked); }

  if (updates.length === 0) return c.json({ error: 'No fields to update' }, 400);

  values.push(id);
  await c.env.DB.prepare(
    `UPDATE series SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...values).run();

  // Cascade: when ending a series, complete all games, tournaments, and expire challenges
  if (body.is_active === 0) {
    const user = c.get('user');
    await cascadeEndSeries(c.env.DB, parseInt(id as string), user.sub);
  }

  return c.json({ success: true });
});

async function cascadeEndSeries(db: D1Database, seriesId: number, userId: number) {
  // 1. Complete all active/scheduled games, determine winners
  const activeGames = await db.prepare(
    `SELECT id, tournament_id, home_team_id, away_team_id, home_runs, away_runs
     FROM games WHERE series_id = ? AND status IN ('scheduled', 'active')`
  ).bind(seriesId).all();

  for (const game of activeGames.results as any[]) {
    const winnerId = game.home_runs > game.away_runs ? game.home_team_id :
                     game.away_runs > game.home_runs ? game.away_team_id : null;
    await db.prepare(
      `UPDATE games SET status = 'completed', winner_team_id = ? WHERE id = ?`
    ).bind(winnerId, game.id).run();

    if (game.tournament_id) {
      await updateTournamentStandings(db, game.tournament_id, game);
    }
  }

  // 2. Complete all active/draft tournaments
  await db.prepare(
    `UPDATE tournaments SET status = 'completed' WHERE series_id = ? AND status IN ('draft', 'active')`
  ).bind(seriesId).run();

  // 3. Expire all pending challenges
  await db.prepare(
    `UPDATE challenges SET status = 'expired' WHERE series_id = ? AND status = 'pending'`
  ).bind(seriesId).run();

  await logAudit(db, userId, 'cascade_end_series', 'series', seriesId,
    `Ended ${activeGames.results.length} games, completed tournaments, expired challenges`);
}
