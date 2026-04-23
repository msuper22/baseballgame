import { Hono } from 'hono';
import { Env, HitType, HIT_BASES, AtBat } from '../types';
import { authRequired, modRequired, adminRequired } from '../middleware/auth';
import { simulateAtBat, replayAtBats, RunnerState } from '../services/simulation';
import {
  clearSeriesBasesForGame,
  ensureInitialHalfInning,
  getCurrentHalfInning,
  determineEventSide,
  processOffenseEvent,
  processDefenseEvent,
  replayGameEvents,
} from '../services/game-engine';
import { logAudit } from '../services/audit';
import { centralStamp, centralStampFromLocal, centralDate, centralTimeHM } from '../services/tz';

export const atBatRoutes = new Hono<{ Bindings: Env }>();

// Log a production event (mod+ or self)
atBatRoutes.post('/', authRequired, async (c) => {
  const user = c.get('user');
  const { player_id, hit_type, description, game_id, credit_time } = await c.req.json();

  if (!credit_time) {
    return c.json({ error: 'credit_time is required — enter when the credit pull happened' }, 400);
  }

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
    'SELECT id, is_locked FROM series WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1'
  ).first<{ id: number; is_locked: number }>();
  if (!series) return c.json({ error: 'No active series' }, 400);
  if (series.is_locked) return c.json({ error: 'This series is locked. No new events can be logged.' }, 403);

  // Check for duplicate lead ID (non-admins only)
  if (description && user.role !== 'admin') {
    const dupe = await c.env.DB.prepare(
      'SELECT id FROM at_bats WHERE description = ? AND series_id = ?'
    ).bind(description, series.id).first();
    if (dupe) return c.json({ error: 'This Lead ID has already been used in the current series' }, 400);
  }

  // Get player's team
  const player = await c.env.DB.prepare(
    'SELECT id, team_id, display_name FROM players WHERE id = ? AND is_active = 1'
  ).bind(player_id).first<{ id: number; team_id: number; display_name: string }>();
  if (!player || !player.team_id) {
    return c.json({ error: 'Player not found or not on a team' }, 400);
  }

  const bases = HIT_BASES[hit_type as HitType];

  // ─── GAME-SCOPED EVENT: route through the engine for offense/defense split ───
  if (game_id) {
    let game = await c.env.DB.prepare(
      'SELECT * FROM games WHERE id = ? AND series_id = ?'
    ).bind(game_id, series.id).first<any>();

    if (!game) return c.json({ error: 'Game not found in current series' }, 400);
    if (game.status === 'completed') return c.json({ error: 'This game is already completed' }, 400);
    if (game.status === 'cancelled') return c.json({ error: 'This game has been cancelled' }, 400);

    if (player.team_id !== game.home_team_id && player.team_id !== game.away_team_id) {
      return c.json({ error: 'Player\'s team is not in this game' }, 400);
    }

    // A scheduled game can only accept events if its scheduled start time has
    // passed (Central) AND its tournament is active (if it belongs to one).
    if (game.status === 'scheduled') {
      const todayC = centralDate();
      const timeC = centralTimeHM();
      const hasStarted =
        game.scheduled_date < todayC ||
        (game.scheduled_date === todayC && (!game.scheduled_time || game.scheduled_time <= timeC));
      if (!hasStarted) {
        const when = game.scheduled_time
          ? `${game.scheduled_date} at ${game.scheduled_time} Central`
          : game.scheduled_date;
        return c.json({ error: `This game hasn't started yet — scheduled for ${when}` }, 400);
      }
      // Tournament gate: don't activate draft-tournament games until the admin activates.
      if (game.tournament_id) {
        const t = await c.env.DB.prepare('SELECT status FROM tournaments WHERE id = ?').bind(game.tournament_id).first<any>();
        if (t && t.status !== 'active') {
          return c.json({ error: 'This game\'s tournament is still in draft — an admin must activate it first' }, 400);
        }
      }
      await c.env.DB.prepare("UPDATE games SET status = 'active' WHERE id = ?").bind(game_id).run();
      await clearSeriesBasesForGame(c.env.DB, series.id, game.home_team_id, game.away_team_id);
      game.status = 'active';
    }

    // Guarantee a half-inning exists before routing through the engine
    await ensureInitialHalfInning(c.env.DB, game.id, game.home_team_id, game.away_team_id);
    game = await c.env.DB.prepare('SELECT * FROM games WHERE id = ?').bind(game.id).first<any>();

    const halfInning = await getCurrentHalfInning(c.env.DB, game);
    if (!halfInning) return c.json({ error: 'No current half-inning for this game' }, 500);

    const side = determineEventSide(game, player.team_id);
    // credit_time stored for records; the event ALWAYS applies to the game's
    // current half-inning — no back-dating to an inning that already ended.
    const creditTime = centralStampFromLocal(String(credit_time));

    // Ensure series base_state row exists (for leaderboard totals)
    await c.env.DB.prepare(
      'INSERT OR IGNORE INTO base_state (series_id, team_id) VALUES (?, ?)'
    ).bind(series.id, player.team_id).run();

    if (side === 'offense') {
      const off = await processOffenseEvent(
        c.env.DB, game, halfInning, player.id, hit_type as HitType,
        creditTime, description || null, user.sub
      );

      // Mirror runners/totals into game_base_state so per-team diamond UI stays accurate
      await c.env.DB.prepare(
        'INSERT OR IGNORE INTO game_base_state (game_id, team_id) VALUES (?, ?)'
      ).bind(game.id, player.team_id).run();

      const refreshedHi = await c.env.DB.prepare('SELECT * FROM half_innings WHERE id = ?').bind(halfInning.id).first<any>();
      await c.env.DB.prepare(
        `UPDATE game_base_state SET first_base = ?, second_base = ?, third_base = ?,
         total_runs = total_runs + ?, total_bases = total_bases + ?
         WHERE game_id = ? AND team_id = ?`
      ).bind(
        refreshedHi?.first_base ?? null, refreshedHi?.second_base ?? null, refreshedHi?.third_base ?? null,
        off.runsScored, bases, game.id, player.team_id
      ).run();

      // Series-level leaderboard totals (runs + TB)
      await c.env.DB.prepare(
        `UPDATE base_state SET total_runs = total_runs + ?, total_bases = total_bases + ?
         WHERE series_id = ? AND team_id = ?`
      ).bind(off.runsScored, bases, series.id, player.team_id).run();

      await logAudit(c.env.DB, user.sub, 'log_event', 'at_bat', off.atBatId,
        `${player.display_name} ${hit_type} (offense, ${off.runsScored} runs) [Game ${game.id}]`);

      const updatedState = await getBaseStateWithNames(c.env.DB, series.id, player.team_id);
      const final = await buildGameCompletionPayload(c.env.DB, game.id);
      return c.json({
        at_bat: {
          id: off.atBatId,
          player_id: player.id,
          player_name: player.display_name,
          hit_type,
          bases,
          runs_scored: off.runsScored,
          event_side: 'offense',
          created_at: centralStamp(),
        },
        event_side: 'offense',
        inning_changed: off.inningChanged,
        base_state: updatedState,
        scoring_players: off.scoringPlayerIds,
        ...final,
      }, 201);
    } else {
      // Defense event — engine handles strikes/outs/inning transitions
      const def = await processDefenseEvent(
        c.env.DB, game, halfInning, player.id, hit_type as HitType,
        creditTime, description || null, user.sub
      );

      // Series-level TB counter still accumulates (production is production)
      await c.env.DB.prepare(
        `UPDATE base_state SET total_bases = total_bases + ?
         WHERE series_id = ? AND team_id = ?`
      ).bind(bases, series.id, player.team_id).run();

      await logAudit(c.env.DB, user.sub, 'log_event', 'at_bat', def.atBatId,
        `${player.display_name} ${hit_type} (defense, +${def.defenseResult.strikesAdded}K +${def.defenseResult.outsAdded}O) [Game ${game.id}]`);

      const updatedState = await getBaseStateWithNames(c.env.DB, series.id, player.team_id);
      const final = await buildGameCompletionPayload(c.env.DB, game.id);
      return c.json({
        at_bat: {
          id: def.atBatId,
          player_id: player.id,
          player_name: player.display_name,
          hit_type,
          bases,
          runs_scored: 0,
          event_side: 'defense',
          created_at: centralStamp(),
        },
        event_side: 'defense',
        strikes_added: def.defenseResult.strikesAdded,
        outs_added: def.defenseResult.outsAdded,
        total_strikes: def.defenseResult.totalStrikes,
        total_outs: def.defenseResult.totalOuts,
        inning_transitioned: def.inningTransitioned,
        sides_swapped: def.defenseResult.sidesSwap,
        base_state: updatedState,
        ...final,
      }, 201);
    }
  }

  // ─── AD-HOC EVENT (no game_id): legacy offense-only path ───
  let baseStateRow = await c.env.DB.prepare(
    'SELECT * FROM base_state WHERE series_id = ? AND team_id = ?'
  ).bind(series.id, player.team_id).first<any>();

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

  const result = simulateAtBat(currentBases, player.id, hit_type as HitType);

  const insertResult = await c.env.DB.prepare(
    `INSERT INTO at_bats (series_id, player_id, team_id, hit_type, bases, runs_scored, description, entered_by, event_side)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'offense')`
  ).bind(
    series.id, player.id, player.team_id, hit_type, bases,
    result.runsScored, description || null, user.sub
  ).run();

  await c.env.DB.prepare(
    `UPDATE base_state SET first_base = ?, second_base = ?, third_base = ?,
     total_runs = total_runs + ?, total_bases = total_bases + ?
     WHERE series_id = ? AND team_id = ?`
  ).bind(
    result.newBases.first, result.newBases.second, result.newBases.third,
    result.runsScored, bases, series.id, player.team_id
  ).run();

  await logAudit(c.env.DB, user.sub, 'log_event', 'at_bat', insertResult.meta.last_row_id as number,
    `${player.display_name} hit ${hit_type} (${result.runsScored} runs)`);

  const updatedState = await getBaseStateWithNames(c.env.DB, series.id, player.team_id);

  return c.json({
    at_bat: {
      id: insertResult.meta.last_row_id,
      player_id: player.id,
      player_name: player.display_name,
      hit_type,
      bases,
      runs_scored: result.runsScored,
      event_side: 'offense',
      created_at: centralStamp(),
    },
    event_side: 'offense',
    base_state: updatedState,
    scoring_players: result.scoringPlayerIds,
  }, 201);
});

// Get at-bat history
atBatRoutes.get('/', authRequired, async (c) => {
  const seriesId = c.req.query('series_id');
  const teamId = c.req.query('team_id');
  const playerId = c.req.query('player_id');
  const limit = parseInt(c.req.query('limit') || '100');
  const minRuns = c.req.query('min_runs');

  let query = `SELECT ab.*, p.display_name as player_name, t.name as team_name
               FROM at_bats ab
               JOIN players p ON ab.player_id = p.id
               JOIN teams t ON ab.team_id = t.id
               WHERE 1=1`;
  const params: any[] = [];

  if (seriesId) { query += ' AND ab.series_id = ?'; params.push(seriesId); }
  if (teamId) { query += ' AND ab.team_id = ?'; params.push(teamId); }
  if (playerId) { query += ' AND ab.player_id = ?'; params.push(playerId); }
  if (minRuns) { query += ' AND ab.runs_scored >= ?'; params.push(parseInt(minRuns)); }

  query += ` ORDER BY ab.created_at DESC LIMIT ${Math.min(limit, 500)}`;

  const stmt = params.length
    ? c.env.DB.prepare(query).bind(...params)
    : c.env.DB.prepare(query);
  const atBats = await stmt.all();
  return c.json({ at_bats: atBats.results });
});

// Player self-undo: delete own last event within 2 minutes
atBatRoutes.delete('/undo-last', authRequired, async (c) => {
  const user = c.get('user');

  // Find player's most recent at-bat
  const lastAb = await c.env.DB.prepare(
    `SELECT * FROM at_bats WHERE player_id = ? ORDER BY created_at DESC LIMIT 1`
  ).bind(user.sub).first<AtBat>();

  if (!lastAb) return c.json({ error: 'No events to undo' }, 404);

  // Check 2-minute window
  const createdAt = new Date(lastAb.created_at + 'Z').getTime();
  const now = Date.now();
  const twoMinutes = 2 * 60 * 1000;
  if (now - createdAt > twoMinutes) {
    return c.json({ error: 'Undo window expired (2 minutes)' }, 403);
  }

  // Delete it
  await c.env.DB.prepare('DELETE FROM at_bats WHERE id = ?').bind(lastAb.id).run();

  // Replay all remaining at-bats for this team+series
  const remaining = await c.env.DB.prepare(
    'SELECT player_id, hit_type FROM at_bats WHERE series_id = ? AND team_id = ? ORDER BY created_at ASC'
  ).bind(lastAb.series_id, lastAb.team_id).all();

  const replayed = replayAtBats(
    remaining.results as { player_id: number; hit_type: HitType }[]
  );

  await c.env.DB.prepare(
    `UPDATE base_state SET first_base = ?, second_base = ?, third_base = ?,
     total_runs = ?, total_bases = ?
     WHERE series_id = ? AND team_id = ?`
  ).bind(
    replayed.bases.first, replayed.bases.second, replayed.bases.third,
    replayed.totalRuns, replayed.totalBases, lastAb.series_id, lastAb.team_id
  ).run();

  // If the undone at-bat had a game_id, replay game-level state too
  if (lastAb.game_id) {
    await replayGameEvents(c.env.DB, lastAb.game_id);
  }

  await logAudit(c.env.DB, user.sub, 'undo_event', 'at_bat', lastAb.id,
    `Self-undo: ${lastAb.hit_type || 'unknown'}`);

  return c.json({ success: true, undone: lastAb });
});

// Admin edit at-bat (change hit type or player)
atBatRoutes.put('/:id', authRequired, adminRequired, async (c) => {
  const id = c.req.param('id');
  const { hit_type, player_id, description } = await c.req.json();
  const user = c.get('user');

  const atBat = await c.env.DB.prepare('SELECT * FROM at_bats WHERE id = ?').bind(id).first<AtBat>();
  if (!atBat) return c.json({ error: 'At-bat not found' }, 404);

  const validTypes: HitType[] = ['single', 'double', 'triple', 'home_run'];
  const newHitType = hit_type && validTypes.includes(hit_type) ? hit_type : atBat.hit_type;
  const newPlayerId = player_id || atBat.player_id;
  const newDesc = description !== undefined ? description : atBat.description;
  const newBases = HIT_BASES[newHitType as HitType];

  // Update the at-bat record
  await c.env.DB.prepare(
    `UPDATE at_bats SET hit_type = ?, bases = ?, player_id = ?, description = ? WHERE id = ?`
  ).bind(newHitType, newBases, newPlayerId, newDesc, id).run();

  // Replay all at-bats for this team+series to recalculate state
  const remaining = await c.env.DB.prepare(
    'SELECT player_id, hit_type FROM at_bats WHERE series_id = ? AND team_id = ? ORDER BY created_at ASC'
  ).bind(atBat.series_id, atBat.team_id).all();

  const replayed = replayAtBats(
    remaining.results as { player_id: number; hit_type: HitType }[]
  );

  await c.env.DB.prepare(
    `UPDATE base_state SET first_base = ?, second_base = ?, third_base = ?,
     total_runs = ?, total_bases = ?
     WHERE series_id = ? AND team_id = ?`
  ).bind(
    replayed.bases.first, replayed.bases.second, replayed.bases.third,
    replayed.totalRuns, replayed.totalBases, atBat.series_id, atBat.team_id
  ).run();

  // If the at-bat had a game_id, do a full replay (rebuilds half-innings
  // strikes/outs + bases + scoreboard + per-team rolling state)
  if (atBat.game_id) {
    await replayGameEvents(c.env.DB, atBat.game_id);
  }

  await logAudit(c.env.DB, user.sub, 'edit_event', 'at_bat', parseInt(id as string),
    `Changed from ${atBat.hit_type} to ${newHitType}`);

  return c.json({ success: true });
});

// Delete at-bat (admin undo) - replays all events to rebuild state
atBatRoutes.delete('/:id', authRequired, adminRequired, async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');

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

  // If the at-bat had a game_id, do a full replay (rebuilds half-innings
  // strikes/outs + bases + scoreboard + per-team rolling state)
  if (atBat.game_id) {
    await replayGameEvents(c.env.DB, atBat.game_id);
  }

  await logAudit(c.env.DB, user.sub, 'delete_event', 'at_bat', parseInt(id as string),
    `Deleted ${atBat.hit_type} by player ${atBat.player_id}`);

  return c.json({ success: true, new_state: replayed });
});

/**
 * Replay all at-bats for a specific game+team to rebuild game_base_state from scratch.
 * Also updates the denormalized game scores.
 */
async function replayGameState(db: D1Database, gameId: number, teamId: number) {
  const gameAtBats = await db.prepare(
    'SELECT player_id, hit_type FROM at_bats WHERE game_id = ? AND team_id = ? ORDER BY created_at ASC'
  ).bind(gameId, teamId).all();

  const replayed = replayAtBats(
    gameAtBats.results as { player_id: number; hit_type: HitType }[]
  );

  await db.prepare(
    `UPDATE game_base_state SET first_base = ?, second_base = ?, third_base = ?,
     total_runs = ?, total_bases = ?
     WHERE game_id = ? AND team_id = ?`
  ).bind(
    replayed.bases.first, replayed.bases.second, replayed.bases.third,
    replayed.totalRuns, replayed.totalBases, gameId, teamId
  ).run();

  // Update denormalized game scores
  const game = await db.prepare('SELECT home_team_id, away_team_id FROM games WHERE id = ?').bind(gameId).first<any>();
  if (game) {
    if (teamId === game.home_team_id) {
      await db.prepare('UPDATE games SET home_runs = ?, home_bases = ? WHERE id = ?')
        .bind(replayed.totalRuns, replayed.totalBases, gameId).run();
    } else {
      await db.prepare('UPDATE games SET away_runs = ?, away_bases = ? WHERE id = ?')
        .bind(replayed.totalRuns, replayed.totalBases, gameId).run();
    }
  }
}

/**
 * After any at-bat that might have completed the game, return the final-state
 * payload for the client: winner name, score, MVP (top TB). Returns empty fields
 * when the game is not yet completed.
 */
async function buildGameCompletionPayload(db: D1Database, gameId: number) {
  const g = await db.prepare(
    `SELECT g.*, ht.name as home_team_name, awt.name as away_team_name, wt.name as winner_name
     FROM games g
     JOIN teams ht ON g.home_team_id = ht.id
     JOIN teams awt ON g.away_team_id = awt.id
     LEFT JOIN teams wt ON g.winner_team_id = wt.id
     WHERE g.id = ?`
  ).bind(gameId).first<any>();
  if (!g || g.status !== 'completed') {
    return { game_completed: false };
  }

  const mvp = await db.prepare(
    `SELECT p.display_name as player_name, SUM(ab.bases) as total_bases
     FROM at_bats ab
     JOIN players p ON p.id = ab.player_id
     WHERE ab.game_id = ? AND ab.event_side = 'offense'
     GROUP BY ab.player_id
     ORDER BY total_bases DESC LIMIT 1`
  ).bind(gameId).first<any>();

  return {
    game_completed: true,
    final: {
      winner_team_id: g.winner_team_id,
      winner_name: g.winner_name,
      home_name: g.home_team_name, home_runs: g.home_runs,
      away_name: g.away_team_name, away_runs: g.away_runs,
      mvp: mvp || null,
    },
  };
}

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
