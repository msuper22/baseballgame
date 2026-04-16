import { Hono } from 'hono';
import { Env } from '../types';
import { authRequired, adminRequired } from '../middleware/auth';
import { logAudit } from '../services/audit';
import { updateTournamentStandings } from './tournaments';

export const gameRoutes = new Hono<{ Bindings: Env }>();

// List games with filters
gameRoutes.get('/', authRequired, async (c) => {
  const seriesId = c.req.query('series_id');
  const tournamentId = c.req.query('tournament_id');
  const teamId = c.req.query('team_id');
  const status = c.req.query('status');
  const date = c.req.query('date');

  let query = `SELECT g.*, ht.name as home_team_name, at.name as away_team_name,
    wt.name as winner_name, tr.name as tournament_name
    FROM games g
    JOIN teams ht ON g.home_team_id = ht.id
    JOIN teams at ON g.away_team_id = at.id
    LEFT JOIN teams wt ON g.winner_team_id = wt.id
    LEFT JOIN tournaments tr ON g.tournament_id = tr.id
    WHERE 1=1`;
  const params: any[] = [];

  if (seriesId) { query += ' AND g.series_id = ?'; params.push(seriesId); }
  if (tournamentId) { query += ' AND g.tournament_id = ?'; params.push(tournamentId); }
  if (teamId) { query += ' AND (g.home_team_id = ? OR g.away_team_id = ?)'; params.push(teamId, teamId); }
  if (status) { query += ' AND g.status = ?'; params.push(status); }
  if (date) { query += ' AND g.scheduled_date = ?'; params.push(date); }

  query += ' ORDER BY g.scheduled_date ASC, g.scheduled_time ASC, g.round ASC';

  const stmt = params.length ? c.env.DB.prepare(query).bind(...params) : c.env.DB.prepare(query);
  const games = await stmt.all();
  return c.json({ games: games.results });
});

// Get full schedule view (grouped by date)
gameRoutes.get('/schedule', authRequired, async (c) => {
  const seriesId = c.req.query('series_id');
  const teamId = c.req.query('team_id');

  let query = `SELECT g.*, ht.name as home_team_name, at.name as away_team_name,
    wt.name as winner_name, tr.name as tournament_name
    FROM games g
    JOIN teams ht ON g.home_team_id = ht.id
    JOIN teams at ON g.away_team_id = at.id
    LEFT JOIN teams wt ON g.winner_team_id = wt.id
    LEFT JOIN tournaments tr ON g.tournament_id = tr.id
    WHERE g.status != 'cancelled'`;
  const params: any[] = [];

  if (seriesId) { query += ' AND g.series_id = ?'; params.push(seriesId); }
  if (teamId) { query += ' AND (g.home_team_id = ? OR g.away_team_id = ?)'; params.push(teamId, teamId); }

  query += ' ORDER BY g.scheduled_date ASC, g.scheduled_time ASC';

  const stmt = params.length ? c.env.DB.prepare(query).bind(...params) : c.env.DB.prepare(query);
  const games = await stmt.all();
  return c.json({ games: games.results });
});

// Get my team's schedule
gameRoutes.get('/my-schedule', authRequired, async (c) => {
  const user = c.get('user');
  if (!user.team_id) return c.json({ games: [] });

  const games = await c.env.DB.prepare(
    `SELECT g.*, ht.name as home_team_name, at.name as away_team_name,
      wt.name as winner_name, tr.name as tournament_name
     FROM games g
     JOIN teams ht ON g.home_team_id = ht.id
     JOIN teams at ON g.away_team_id = at.id
     LEFT JOIN teams wt ON g.winner_team_id = wt.id
     LEFT JOIN tournaments tr ON g.tournament_id = tr.id
     WHERE (g.home_team_id = ? OR g.away_team_id = ?)
       AND g.status != 'cancelled'
     ORDER BY g.scheduled_date ASC, g.scheduled_time ASC`
  ).bind(user.team_id, user.team_id).all();

  return c.json({ games: games.results });
});

// Get single game with full details
gameRoutes.get('/:id', authRequired, async (c) => {
  const id = c.req.param('id');

  const game = await c.env.DB.prepare(
    `SELECT g.*, ht.name as home_team_name, at.name as away_team_name,
      wt.name as winner_name, tr.name as tournament_name
     FROM games g
     JOIN teams ht ON g.home_team_id = ht.id
     JOIN teams at ON g.away_team_id = at.id
     LEFT JOIN teams wt ON g.winner_team_id = wt.id
     LEFT JOIN tournaments tr ON g.tournament_id = tr.id
     WHERE g.id = ?`
  ).bind(id).first();

  if (!game) return c.json({ error: 'Game not found' }, 404);

  // Get base states for both teams with player names
  const baseStates = await c.env.DB.prepare(
    `SELECT gbs.*, t.name as team_name,
      p1.display_name as first_base_name,
      p2.display_name as second_base_name,
      p3.display_name as third_base_name
     FROM game_base_state gbs
     JOIN teams t ON gbs.team_id = t.id
     LEFT JOIN players p1 ON gbs.first_base = p1.id
     LEFT JOIN players p2 ON gbs.second_base = p2.id
     LEFT JOIN players p3 ON gbs.third_base = p3.id
     WHERE gbs.game_id = ?`
  ).bind(id).all();

  // Get recent at-bats for this game
  const atBats = await c.env.DB.prepare(
    `SELECT ab.*, p.display_name as player_name, t.name as team_name
     FROM at_bats ab
     JOIN players p ON ab.player_id = p.id
     JOIN teams t ON ab.team_id = t.id
     WHERE ab.game_id = ?
     ORDER BY ab.created_at DESC LIMIT 50`
  ).bind(id).all();

  return c.json({
    game,
    base_states: baseStates.results,
    at_bats: atBats.results,
  });
});

// Update game status (admin)
gameRoutes.put('/:id', authRequired, adminRequired, async (c) => {
  const id = parseInt(c.req.param('id') as string);
  const user = c.get('user');
  const body = await c.req.json();
  const updates: string[] = [];
  const values: any[] = [];

  if (body.status !== undefined) { updates.push('status = ?'); values.push(body.status); }
  if (body.scheduled_date !== undefined) { updates.push('scheduled_date = ?'); values.push(body.scheduled_date); }
  if (body.scheduled_time !== undefined) { updates.push('scheduled_time = ?'); values.push(body.scheduled_time); }

  if (updates.length === 0) return c.json({ error: 'No fields to update' }, 400);

  // If completing the game, determine winner
  if (body.status === 'completed') {
    const game = await c.env.DB.prepare('SELECT * FROM games WHERE id = ?').bind(id).first<any>();
    if (!game) return c.json({ error: 'Game not found' }, 404);

    const winnerId = game.home_runs > game.away_runs ? game.home_team_id :
                     game.away_runs > game.home_runs ? game.away_team_id : null;
    updates.push('winner_team_id = ?');
    values.push(winnerId);

    // Update tournament standings if this is a tournament game
    if (game.tournament_id) {
      await updateTournamentStandings(c.env.DB, game.tournament_id, game);
    }
  }

  values.push(id);
  await c.env.DB.prepare(
    `UPDATE games SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...values).run();

  await logAudit(c.env.DB, user.sub, 'update_game', 'game', id, `Updated: ${JSON.stringify(body)}`);

  return c.json({ success: true });
});

// Delete game (admin)
gameRoutes.delete('/:id', authRequired, adminRequired, async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');

  await c.env.DB.prepare('DELETE FROM game_base_state WHERE game_id = ?').bind(id).run();
  await c.env.DB.prepare('UPDATE at_bats SET game_id = NULL WHERE game_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM games WHERE id = ?').bind(id).run();

  await logAudit(c.env.DB, user.sub, 'delete_game', 'game', parseInt(id as string), 'Deleted game');

  return c.json({ success: true });
});
