import { Hono } from 'hono';
import { Env } from '../types';
import { authRequired, adminRequired } from '../middleware/auth';
import { logAudit } from '../services/audit';
import { clearSeriesBasesForGame, ensureInitialHalfInning, autoActivateDueGames, replayGameEvents } from '../services/game-engine';
import { updateTournamentStandings } from './tournaments';

export const gameRoutes = new Hono<{ Bindings: Env }>();

// Create a standalone game (admin) — no tournament wrapper
gameRoutes.post('/', authRequired, adminRequired, async (c) => {
  const user = c.get('user');
  const { home_team_id, away_team_id, scheduled_date, scheduled_time, total_innings, series_id } = await c.req.json();

  if (!home_team_id || !away_team_id) {
    return c.json({ error: 'home_team_id and away_team_id required' }, 400);
  }
  if (home_team_id === away_team_id) {
    return c.json({ error: 'Teams must be different' }, 400);
  }

  // Resolve series: explicit > active > most-recent > auto-create default
  let seriesId = series_id;
  if (!seriesId) {
    const active = await c.env.DB.prepare(
      'SELECT id FROM series WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1'
    ).first<{ id: number }>();
    if (active) {
      seriesId = active.id;
    } else {
      const recent = await c.env.DB.prepare(
        'SELECT id FROM series ORDER BY created_at DESC LIMIT 1'
      ).first<{ id: number }>();
      if (recent) {
        seriesId = recent.id;
      } else {
        // No series at all — bootstrap a default "Quick Games" series so admins
        // can run one-off matchups without having to create a series first.
        const today = new Date().toISOString().slice(0, 10);
        const monthOut = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
        const boot = await c.env.DB.prepare(
          `INSERT INTO series (name, start_date, end_date) VALUES ('Quick Games', ?, ?)`
        ).bind(today, monthOut).run();
        seriesId = boot.meta.last_row_id as number;

        // Seed base_state rows for every team so the first at-bat doesn't trip
        const teams = await c.env.DB.prepare('SELECT id FROM teams').all<{ id: number }>();
        for (const team of teams.results) {
          await c.env.DB.prepare(
            'INSERT INTO base_state (series_id, team_id) VALUES (?, ?)'
          ).bind(seriesId, team.id).run();
        }
      }
    }
  }

  const innings = Number.isInteger(total_innings) && total_innings >= 1 && total_innings <= 18 ? total_innings : 9;

  const result = await c.env.DB.prepare(
    `INSERT INTO games (series_id, home_team_id, away_team_id, scheduled_date, scheduled_time, status, total_innings)
     VALUES (?, ?, ?, ?, ?, 'scheduled', ?)`
  ).bind(seriesId, home_team_id, away_team_id, scheduled_date || null, scheduled_time || null, innings).run();

  const gameId = result.meta.last_row_id as number;

  // Seed game_base_state for both teams so the diamond view works
  await c.env.DB.prepare('INSERT INTO game_base_state (game_id, team_id) VALUES (?, ?)').bind(gameId, home_team_id).run();
  await c.env.DB.prepare('INSERT INTO game_base_state (game_id, team_id) VALUES (?, ?)').bind(gameId, away_team_id).run();

  await logAudit(c.env.DB, user.sub, 'create_game', 'game', gameId,
    `Created standalone game: teams ${home_team_id} vs ${away_team_id}, ${innings} innings`);

  return c.json({
    game: { id: gameId, series_id: seriesId, home_team_id, away_team_id, scheduled_date, scheduled_time, total_innings: innings, status: 'scheduled' }
  }, 201);
});

// List games with filters
gameRoutes.get('/', authRequired, async (c) => {
  await autoActivateDueGames(c.env.DB);
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
  await autoActivateDueGames(c.env.DB);
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
  await autoActivateDueGames(c.env.DB);
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
  await autoActivateDueGames(c.env.DB);
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

  // Current half-inning (for offense/defense context + outs/strikes display)
  const g = game as any;
  const currentHalfInning = await c.env.DB.prepare(
    `SELECT hi.*, bt.name as batting_team_name, ft.name as fielding_team_name
     FROM half_innings hi
     JOIN teams bt ON hi.batting_team_id = bt.id
     JOIN teams ft ON hi.fielding_team_id = ft.id
     WHERE hi.game_id = ? AND hi.inning_number = ? AND hi.half = ?`
  ).bind(id, g.current_inning, g.current_half).first();

  return c.json({
    game,
    base_states: baseStates.results,
    at_bats: atBats.results,
    current_half_inning: currentHalfInning,
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

  // Reschedule-revert: if admin is changing scheduled_date/time on a game that's
  // currently 'active' with NO at-bats logged yet (a premature auto-start), flip
  // it back to 'scheduled' and wipe its empty half-inning + scoreboard state.
  const isReschedule =
    body.status === undefined &&
    (body.scheduled_date !== undefined || body.scheduled_time !== undefined);
  if (isReschedule) {
    const existing = await c.env.DB.prepare(
      'SELECT status FROM games WHERE id = ?'
    ).bind(id).first<any>();
    if (existing && existing.status === 'active') {
      const abCount = await c.env.DB.prepare(
        'SELECT COUNT(*) as c FROM at_bats WHERE game_id = ?'
      ).bind(id).first<any>();
      if ((abCount?.c ?? 0) === 0) {
        updates.push('status = ?'); values.push('scheduled');
        updates.push('started_at = ?'); values.push(null);
        updates.push('current_inning = ?'); values.push(1);
        updates.push("current_half = 'top'");
        updates.push('home_score = 0, away_score = 0, home_runs = 0, away_runs = 0, home_bases = 0, away_bases = 0');
        await c.env.DB.prepare('DELETE FROM half_innings WHERE game_id = ?').bind(id).run();
      } else {
        return c.json({ error: 'Cannot reschedule an active game that has events logged' }, 400);
      }
    }
  }

  // If activating the game, clear series-level bases + ensure a half-inning exists
  if (body.status === 'active') {
    const game = await c.env.DB.prepare('SELECT status, series_id, home_team_id, away_team_id FROM games WHERE id = ?').bind(id).first<any>();
    if (game && game.status !== 'active') {
      await clearSeriesBasesForGame(c.env.DB, game.series_id, game.home_team_id, game.away_team_id);
      await ensureInitialHalfInning(c.env.DB, id, game.home_team_id, game.away_team_id);
    }
  }

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

  // If the game's date moved and it belongs to a tournament, recompute round
  // numbers for the tournament so rounds stay ordered by date.
  if (body.scheduled_date !== undefined) {
    const g = await c.env.DB.prepare(
      'SELECT tournament_id FROM games WHERE id = ?'
    ).bind(id).first<any>();
    if (g?.tournament_id) {
      await renumberTournamentRounds(c.env.DB, g.tournament_id);
    }
  }

  await logAudit(c.env.DB, user.sub, 'update_game', 'game', id, `Updated: ${JSON.stringify(body)}`);

  return c.json({ success: true });
});

/**
 * Assign round numbers by scheduled_date ascending. Games sharing a date share
 * a round. Games without a scheduled_date get round=NULL.
 */
async function renumberTournamentRounds(db: D1Database, tournamentId: number): Promise<void> {
  const rows = await db.prepare(
    `SELECT id, scheduled_date FROM games WHERE tournament_id = ?
     ORDER BY (scheduled_date IS NULL), scheduled_date ASC, id ASC`
  ).bind(tournamentId).all<any>();

  const dateToRound = new Map<string, number>();
  let next = 1;
  for (const row of (rows.results || [])) {
    if (row.scheduled_date && !dateToRound.has(row.scheduled_date)) {
      dateToRound.set(row.scheduled_date, next++);
    }
  }

  for (const row of (rows.results || [])) {
    const r = row.scheduled_date ? dateToRound.get(row.scheduled_date) : null;
    await db.prepare('UPDATE games SET round = ? WHERE id = ?').bind(r ?? null, row.id).run();
  }
}

// Delete game (admin)
gameRoutes.delete('/:id', authRequired, adminRequired, async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const db = c.env.DB;

  // Clean up all tables that FK into games.id (and indirectly into half_innings.id)
  await db.prepare('DELETE FROM chat_messages WHERE game_id = ?').bind(id).run();
  await db.prepare('DELETE FROM reactions WHERE game_id = ?').bind(id).run();
  // at_bats.half_inning_id references half_innings(id); null it out before deleting half_innings
  await db.prepare(
    'UPDATE at_bats SET half_inning_id = NULL WHERE half_inning_id IN (SELECT id FROM half_innings WHERE game_id = ?)'
  ).bind(id).run();
  await db.prepare('DELETE FROM half_innings WHERE game_id = ?').bind(id).run();
  await db.prepare('DELETE FROM game_base_state WHERE game_id = ?').bind(id).run();
  await db.prepare('UPDATE challenges SET game_id = NULL WHERE game_id = ?').bind(id).run();
  await db.prepare('UPDATE at_bats SET game_id = NULL WHERE game_id = ?').bind(id).run();
  await db.prepare('DELETE FROM games WHERE id = ?').bind(id).run();

  await logAudit(db, user.sub, 'delete_game', 'game', parseInt(id as string), 'Deleted game');

  return c.json({ success: true });
});

// Admin: replay a game through the engine (re-derive all state from at-bats)
gameRoutes.post('/:id/replay', authRequired, adminRequired, async (c) => {
  const id = parseInt(c.req.param('id') as string);
  const user = c.get('user');

  const game = await c.env.DB.prepare('SELECT * FROM games WHERE id = ?').bind(id).first();
  if (!game) return c.json({ error: 'Game not found' }, 404);

  await replayGameEvents(c.env.DB, id);

  const updated = await c.env.DB.prepare('SELECT status, home_score, away_score, current_inning, current_half, winner_team_id FROM games WHERE id = ?').bind(id).first();

  await logAudit(c.env.DB, user.sub, 'replay_game', 'game', id, `Replayed game — now ${updated?.status}`);

  return c.json({ success: true, game: updated });
});
