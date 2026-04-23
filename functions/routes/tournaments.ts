import { Hono } from 'hono';
import { Env } from '../types';
import { authRequired, adminRequired } from '../middleware/auth';
import { generateRoundRobin } from '../services/scheduling';
import { clearSeriesBasesForGame, ensureInitialHalfInning } from '../services/game-engine';
import { logAudit } from '../services/audit';
import { centralDate, centralTimeHM, centralStamp } from '../services/tz';

export const tournamentRoutes = new Hono<{ Bindings: Env }>();

// List tournaments
tournamentRoutes.get('/', authRequired, async (c) => {
  const seriesId = c.req.query('series_id');
  let query = `SELECT t.*, s.name as series_name,
    (SELECT COUNT(*) FROM games g WHERE g.tournament_id = t.id) as game_count
    FROM tournaments t
    JOIN series s ON t.series_id = s.id`;
  const params: any[] = [];

  if (seriesId) {
    query += ' WHERE t.series_id = ?';
    params.push(seriesId);
  }
  query += ' ORDER BY t.created_at DESC';

  const stmt = params.length ? c.env.DB.prepare(query).bind(...params) : c.env.DB.prepare(query);
  const tournaments = await stmt.all();
  return c.json({ tournaments: tournaments.results });
});

// Get tournament details with standings and games
tournamentRoutes.get('/:id', authRequired, async (c) => {
  const id = c.req.param('id');

  const tournament = await c.env.DB.prepare(
    `SELECT t.*, s.name as series_name
     FROM tournaments t JOIN series s ON t.series_id = s.id
     WHERE t.id = ?`
  ).bind(id).first();

  if (!tournament) return c.json({ error: 'Tournament not found' }, 404);

  const standings = await c.env.DB.prepare(
    `SELECT ts.*, t.name as team_name
     FROM tournament_standings ts
     JOIN teams t ON ts.team_id = t.id
     WHERE ts.tournament_id = ?
     ORDER BY ts.wins DESC, (ts.runs_for - ts.runs_against) DESC`
  ).bind(id).all();

  const games = await c.env.DB.prepare(
    `SELECT g.*, ht.name as home_team_name, at.name as away_team_name,
       wt.name as winner_name
     FROM games g
     JOIN teams ht ON g.home_team_id = ht.id
     JOIN teams at ON g.away_team_id = at.id
     LEFT JOIN teams wt ON g.winner_team_id = wt.id
     WHERE g.tournament_id = ?
     ORDER BY g.round ASC, g.game_number ASC`
  ).bind(id).all();

  return c.json({
    tournament,
    standings: standings.results,
    games: games.results,
  });
});

// Create tournament (admin)
tournamentRoutes.post('/', authRequired, adminRequired, async (c) => {
  const user = c.get('user');
  const { name, series_id, start_date, end_date, team_ids, innings_per_game } = await c.req.json();

  if (!name || !series_id || !start_date || !end_date) {
    return c.json({ error: 'name, series_id, start_date, end_date required' }, 400);
  }

  // Verify series exists
  const series = await c.env.DB.prepare('SELECT id FROM series WHERE id = ?').bind(series_id).first();
  if (!series) return c.json({ error: 'Series not found' }, 404);

  const innings = innings_per_game || 9;

  const result = await c.env.DB.prepare(
    `INSERT INTO tournaments (name, series_id, format, status, start_date, end_date, created_by, innings_per_game)
     VALUES (?, ?, 'round_robin', 'draft', ?, ?, ?, ?)`
  ).bind(name, series_id, start_date, end_date, user.sub, innings).run();

  const tournamentId = result.meta.last_row_id as number;

  // If team_ids provided, initialize standings rows
  if (Array.isArray(team_ids) && team_ids.length > 0) {
    for (const teamId of team_ids) {
      await c.env.DB.prepare(
        'INSERT INTO tournament_standings (tournament_id, team_id) VALUES (?, ?)'
      ).bind(tournamentId, teamId).run();
    }
  }

  await logAudit(c.env.DB, user.sub, 'create_tournament', 'tournament', tournamentId, `Created tournament: ${name}`);

  return c.json({ tournament: { id: tournamentId, name, series_id, format: 'round_robin', status: 'draft', start_date, end_date } }, 201);
});

// Generate round robin schedule
tournamentRoutes.post('/:id/generate-schedule', authRequired, adminRequired, async (c) => {
  const id = parseInt(c.req.param('id') as string);
  const user = c.get('user');
  const { team_ids, days_between_rounds, default_time, innings_per_game, exclude_dates } = await c.req.json();

  if (!Array.isArray(team_ids) || team_ids.length < 2) {
    return c.json({ error: 'At least 2 team_ids required' }, 400);
  }

  const tournament = await c.env.DB.prepare(
    'SELECT * FROM tournaments WHERE id = ?'
  ).bind(id).first<any>();

  if (!tournament) return c.json({ error: 'Tournament not found' }, 404);
  if (tournament.status !== 'draft') {
    return c.json({ error: 'Can only generate schedule for draft tournaments' }, 400);
  }

  // Update innings_per_game on tournament if provided
  const innings = innings_per_game || tournament.innings_per_game || 9;
  if (innings_per_game) {
    await c.env.DB.prepare('UPDATE tournaments SET innings_per_game = ? WHERE id = ?').bind(innings, id).run();
  }

  // Delete any existing games for this tournament
  await c.env.DB.prepare('DELETE FROM game_base_state WHERE game_id IN (SELECT id FROM games WHERE tournament_id = ?)').bind(id).run();
  await c.env.DB.prepare('DELETE FROM games WHERE tournament_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM tournament_standings WHERE tournament_id = ?').bind(id).run();

  // Generate the schedule. exclude_dates: array of 'YYYY-MM-DD' strings the
  // scheduler must not assign rounds to (off-days, holidays, etc.).
  const excluded = Array.isArray(exclude_dates) ? exclude_dates.filter(d => typeof d === 'string') : [];
  const schedule = generateRoundRobin(
    team_ids,
    tournament.start_date,
    days_between_rounds || 1,
    excluded
  );

  // Insert games and base states — all games created as 'scheduled'.
  // Past-date games only promote to 'active' when the tournament is activated.
  const gameIds: number[] = [];
  for (const game of schedule) {
    const gameResult = await c.env.DB.prepare(
      `INSERT INTO games (tournament_id, series_id, home_team_id, away_team_id, scheduled_date, scheduled_time, status, total_innings, round, game_number)
       VALUES (?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?)`
    ).bind(
      id, tournament.series_id, game.homeTeamId, game.awayTeamId,
      game.scheduledDate, default_time || null, innings, game.round, game.gameNumber
    ).run();

    const gameId = gameResult.meta.last_row_id as number;
    gameIds.push(gameId);

    // Create base state rows for both teams
    await c.env.DB.prepare(
      'INSERT OR REPLACE INTO game_base_state (game_id, team_id) VALUES (?, ?)'
    ).bind(gameId, game.homeTeamId).run();
    await c.env.DB.prepare(
      'INSERT OR REPLACE INTO game_base_state (game_id, team_id) VALUES (?, ?)'
    ).bind(gameId, game.awayTeamId).run();
  }

  // Initialize standings for all teams
  for (const teamId of team_ids) {
    await c.env.DB.prepare(
      'INSERT OR REPLACE INTO tournament_standings (tournament_id, team_id) VALUES (?, ?)'
    ).bind(id, teamId).run();
  }

  await logAudit(c.env.DB, user.sub, 'generate_schedule', 'tournament', id,
    `Generated ${schedule.length} games for ${team_ids.length} teams, ${innings} innings each`);

  return c.json({ games_created: schedule.length, schedule });
});

// Update tournament (admin)
tournamentRoutes.put('/:id', authRequired, adminRequired, async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const body = await c.req.json();
  const updates: string[] = [];
  const values: any[] = [];

  if (body.name !== undefined) { updates.push('name = ?'); values.push(body.name); }
  if (body.status !== undefined) { updates.push('status = ?'); values.push(body.status); }
  if (body.start_date !== undefined) { updates.push('start_date = ?'); values.push(body.start_date); }
  if (body.end_date !== undefined) { updates.push('end_date = ?'); values.push(body.end_date); }

  if (updates.length === 0) return c.json({ error: 'No fields to update' }, 400);

  values.push(id);
  await c.env.DB.prepare(
    `UPDATE tournaments SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...values).run();

  // If activating the tournament, promote any past-date scheduled games to 'active'.
  // Compare scheduled_date/time against Central-time strings, NOT UTC-parsed Date.
  if (body.status === 'active') {
    const todayC = centralDate();
    const timeC = centralTimeHM();
    const nowStr = centralStamp();
    const pending = await c.env.DB.prepare(
      `SELECT id, home_team_id, away_team_id, scheduled_date, scheduled_time, series_id FROM games
       WHERE tournament_id = ? AND status = 'scheduled'`
    ).bind(id).all();

    for (const game of pending.results as any[]) {
      const isPastOrNow =
        game.scheduled_date < todayC ||
        (game.scheduled_date === todayC && (!game.scheduled_time || game.scheduled_time <= timeC));
      if (!isPastOrNow) continue;

      await c.env.DB.prepare(
        `UPDATE games SET status = 'active', started_at = ? WHERE id = ?`
      ).bind(nowStr, game.id).run();

      await ensureInitialHalfInning(c.env.DB, game.id, game.home_team_id, game.away_team_id);
      await clearSeriesBasesForGame(c.env.DB, game.series_id, game.home_team_id, game.away_team_id);
    }
  }

  // If completing the tournament, complete all its remaining games
  if (body.status === 'completed') {
    const activeGames = await c.env.DB.prepare(
      `SELECT id, home_team_id, away_team_id, home_runs, away_runs FROM games
       WHERE tournament_id = ? AND status IN ('scheduled', 'active')`
    ).bind(id).all();

    for (const game of activeGames.results as any[]) {
      const winnerId = game.home_runs > game.away_runs ? game.home_team_id :
                       game.away_runs > game.home_runs ? game.away_team_id : null;
      await c.env.DB.prepare(
        `UPDATE games SET status = 'completed', winner_team_id = ? WHERE id = ?`
      ).bind(winnerId, game.id).run();

      await updateTournamentStandings(c.env.DB, parseInt(id as string), game);
    }
  }

  await logAudit(c.env.DB, user.sub, 'update_tournament', 'tournament', parseInt(id as string),
    `Updated: ${JSON.stringify(body)}`);

  return c.json({ success: true });
});

// Delete tournament (admin)
tournamentRoutes.delete('/:id', authRequired, adminRequired, async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');

  // Clean up associated data
  await c.env.DB.prepare('DELETE FROM game_base_state WHERE game_id IN (SELECT id FROM games WHERE tournament_id = ?)').bind(id).run();
  await c.env.DB.prepare('DELETE FROM games WHERE tournament_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM tournament_standings WHERE tournament_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM tournaments WHERE id = ?').bind(id).run();

  await logAudit(c.env.DB, user.sub, 'delete_tournament', 'tournament', parseInt(id as string), 'Deleted tournament');

  return c.json({ success: true });
});

// Helper: update tournament standings after a game completes
async function updateTournamentStandings(db: D1Database, tournamentId: number, game: any) {
  const homeWon = game.home_runs > game.away_runs;
  const tie = game.home_runs === game.away_runs;

  // Update home team
  await db.prepare(
    `UPDATE tournament_standings SET
      wins = wins + ?, losses = losses + ?, ties = ties + ?,
      runs_for = runs_for + ?, runs_against = runs_against + ?,
      games_played = games_played + 1
     WHERE tournament_id = ? AND team_id = ?`
  ).bind(
    homeWon ? 1 : 0, !homeWon && !tie ? 1 : 0, tie ? 1 : 0,
    game.home_runs, game.away_runs,
    tournamentId, game.home_team_id
  ).run();

  // Update away team
  await db.prepare(
    `UPDATE tournament_standings SET
      wins = wins + ?, losses = losses + ?, ties = ties + ?,
      runs_for = runs_for + ?, runs_against = runs_against + ?,
      games_played = games_played + 1
     WHERE tournament_id = ? AND team_id = ?`
  ).bind(
    !homeWon && !tie ? 1 : 0, homeWon ? 1 : 0, tie ? 1 : 0,
    game.away_runs, game.home_runs,
    tournamentId, game.away_team_id
  ).run();
}

export { updateTournamentStandings };
