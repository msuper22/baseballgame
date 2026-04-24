import { HitType, HIT_BASES, Game, HalfInning, EventSide, InningHalf } from '../types';
import { simulateAtBat, simulateDefenseEvent, RunnerState } from './simulation';
import { centralDate, centralTimeHM, centralStamp } from './tz';

/**
 * Reset series-level runner positions for both teams in a game.
 * Called when a game transitions from scheduled to active — matches real
 * baseball where each new game starts with empty bases. Keeps series-level
 * run/total-base accumulators intact.
 */
export async function clearSeriesBasesForGame(
  db: D1Database,
  seriesId: number,
  homeTeamId: number,
  awayTeamId: number,
): Promise<void> {
  await db.prepare(
    `UPDATE base_state SET first_base = NULL, second_base = NULL, third_base = NULL
     WHERE series_id = ? AND team_id IN (?, ?)`
  ).bind(seriesId, homeTeamId, awayTeamId).run();
}

/**
 * Ensure a game has a top-of-1st half-inning row. Idempotent — safe to call
 * every time a game transitions scheduled→active. Also sets current_inning=1
 * and current_half='top' on the game if they weren't already.
 */
export async function ensureInitialHalfInning(
  db: D1Database,
  gameId: number,
  homeTeamId: number,
  awayTeamId: number,
): Promise<void> {
  const existing = await db.prepare(
    `SELECT id FROM half_innings WHERE game_id = ? LIMIT 1`
  ).bind(gameId).first();
  if (existing) return;

  await db.prepare(
    `INSERT INTO half_innings (game_id, inning_number, half, batting_team_id, fielding_team_id)
     VALUES (?, 1, 'top', ?, ?)`
  ).bind(gameId, awayTeamId, homeTeamId).run();

  await db.prepare(
    `UPDATE games SET current_inning = 1, current_half = 'top' WHERE id = ?`
  ).bind(gameId).run();
}

/**
 * Auto-activate any scheduled games whose scheduled_date + scheduled_time
 * have passed. Call from read-heavy endpoints (schedule, game list, stats)
 * so the game flips to 'active' without a manual admin click.
 */
export async function autoActivateDueGames(db: D1Database): Promise<void> {
  const today = centralDate();
  const timeHM = centralTimeHM();

  // Only auto-activate games that are either standalone (no tournament) or
  // belong to an ACTIVE tournament. Games in draft tournaments must never
  // auto-start — the admin has to promote the tournament first.
  const due = await db.prepare(
    `SELECT g.id, g.series_id, g.home_team_id, g.away_team_id FROM games g
     LEFT JOIN tournaments t ON g.tournament_id = t.id
     WHERE g.status = 'scheduled'
       AND (g.tournament_id IS NULL OR t.status = 'active')
       AND (
         g.scheduled_date < ?
         OR (g.scheduled_date = ? AND (g.scheduled_time IS NULL OR g.scheduled_time <= ?))
       )`
  ).bind(today, today, timeHM).all<any>();

  for (const g of (due.results || [])) {
    await db.prepare("UPDATE games SET status = 'active' WHERE id = ?").bind(g.id).run();
    if (g.series_id) {
      await clearSeriesBasesForGame(db, g.series_id, g.home_team_id, g.away_team_id);
    }
    await ensureInitialHalfInning(db, g.id, g.home_team_id, g.away_team_id);
  }
}

/**
 * Auto-end games that are still active past 1:00 AM Central on the day AFTER
 * their scheduled_date. Winner is determined by current score (ties = no winner).
 * Call from the same read endpoints as autoActivateDueGames.
 */
export async function autoEndStaleGames(db: D1Database): Promise<void> {
  const today = centralDate();
  const timeHM = centralTimeHM();

  // A game expires when (now Central) >= (scheduled_date + 1 day, 01:00 Central).
  // SQL: date(scheduled_date, '+1 day') < today  OR  (= today AND time >= '01:00')
  const stale = await db.prepare(
    `SELECT id, home_runs, away_runs, home_team_id, away_team_id, tournament_id
     FROM games
     WHERE status IN ('active', 'extra_innings')
       AND scheduled_date IS NOT NULL
       AND (
         date(scheduled_date, '+1 day') < ?
         OR (date(scheduled_date, '+1 day') = ? AND ? >= '01:00')
       )`
  ).bind(today, today, timeHM).all<any>();

  const now = centralStamp();
  for (const g of (stale.results || [])) {
    const winner =
      g.home_runs > g.away_runs ? g.home_team_id :
      g.away_runs > g.home_runs ? g.away_team_id :
      null;

    await db.prepare(
      "UPDATE games SET status = 'completed', completed_at = ?, winner_team_id = ? WHERE id = ?"
    ).bind(now, winner, g.id).run();

    // Mark any open half-innings as complete
    await db.prepare(
      "UPDATE half_innings SET is_complete = 1, ended_at = ? WHERE game_id = ? AND is_complete = 0"
    ).bind(now, g.id).run();

    if (g.tournament_id) {
      const freshGame = await db.prepare('SELECT * FROM games WHERE id = ?').bind(g.id).first<any>();
      if (freshGame) await updateTournamentStandingsInline(db, g.tournament_id, freshGame);
    }
  }
}

export function determineEventSide(game: Game, playerTeamId: number): EventSide {
  const battingTeamId = game.current_half === 'top' ? game.away_team_id : game.home_team_id;
  if (playerTeamId === battingTeamId) return 'offense';
  const fieldingTeamId = game.current_half === 'top' ? game.home_team_id : game.away_team_id;
  if (playerTeamId === fieldingTeamId) return 'defense';
  throw new Error('Player team is not in this game');
}

export async function getCurrentHalfInning(db: D1Database, game: Game): Promise<HalfInning | null> {
  return db.prepare(
    'SELECT * FROM half_innings WHERE game_id = ? AND inning_number = ? AND half = ?'
  ).bind(game.id, game.current_inning, game.current_half).first<HalfInning>();
}

export async function processOffenseEvent(
  db: D1Database,
  game: Game,
  halfInning: HalfInning,
  playerId: number,
  hitType: HitType,
  creditTime: string,
  description: string | null,
  enteredBy: number
): Promise<{ atBatId: number; runsScored: number; scoringPlayerIds: number[]; inningChanged: boolean }> {
  // Events ALWAYS apply to the game's current half-inning, never back-date.
  const targetHalfInning = halfInning;
  const targetGame = game;

  const currentBases: RunnerState = {
    first: targetHalfInning.first_base,
    second: targetHalfInning.second_base,
    third: targetHalfInning.third_base,
  };

  const result = simulateAtBat(currentBases, playerId, hitType);
  const bases = HIT_BASES[hitType];

  // Insert at-bat record
  const insertResult = await db.prepare(
    `INSERT INTO at_bats (series_id, player_id, team_id, hit_type, bases, runs_scored, description, entered_by,
     game_id, half_inning_id, event_side, credit_time, strikes_caused, outs_caused)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'offense', ?, 0, 0)`
  ).bind(
    targetGame.series_id, playerId, targetHalfInning.batting_team_id, hitType, bases,
    result.runsScored, description, enteredBy,
    targetGame.id, targetHalfInning.id, creditTime
  ).run();

  // Update half-inning base state and runs
  await db.prepare(
    `UPDATE half_innings SET first_base = ?, second_base = ?, third_base = ?,
     runs_scored = runs_scored + ? WHERE id = ?`
  ).bind(
    result.newBases.first, result.newBases.second, result.newBases.third,
    result.runsScored, targetHalfInning.id
  ).run();

  // Update game score. Keep the denormalized *_runs / *_bases columns in sync
  // with *_score so existing UI (which reads home_runs / away_runs) stays correct.
  const isHome = targetHalfInning.batting_team_id === targetGame.home_team_id;
  if (isHome) {
    await db.prepare(
      `UPDATE games SET home_score = home_score + ?, home_runs = home_runs + ?, home_bases = home_bases + ? WHERE id = ?`
    ).bind(result.runsScored, result.runsScored, bases, targetGame.id).run();
  } else {
    await db.prepare(
      `UPDATE games SET away_score = away_score + ?, away_runs = away_runs + ?, away_bases = away_bases + ? WHERE id = ?`
    ).bind(result.runsScored, result.runsScored, bases, targetGame.id).run();
  }

  // Walk-off check: if the home team just scored in the bottom half and now leads,
  // the game ends immediately — no need to wait for 3 outs. This applies to:
  //   - Bottom of the last regulation inning (home team was trailing or tied, scores to lead)
  //   - Bottom of any extra inning (home team scores to lead)
  let walkoff = false;
  if (result.runsScored > 0 && isHome && targetGame.current_half === 'bottom') {
    const isLateGame = targetGame.current_inning >= targetGame.total_innings;
    const isExtra = targetGame.status === 'extra_innings';
    if (isLateGame || isExtra) {
      const updatedGame = await db.prepare('SELECT * FROM games WHERE id = ?').bind(targetGame.id).first<Game>();
      if (updatedGame && updatedGame.home_score > updatedGame.away_score) {
        const now = centralStamp();
        // Mark the current half-inning as complete
        await db.prepare(
          'UPDATE half_innings SET is_complete = 1, ended_at = ? WHERE id = ?'
        ).bind(now, targetHalfInning.id).run();
        // Complete the game with home team as winner
        await db.prepare(
          "UPDATE games SET status = 'completed', completed_at = ?, winner_team_id = ? WHERE id = ?"
        ).bind(now, updatedGame.home_team_id, targetGame.id).run();
        // Update tournament standings if applicable
        if (updatedGame.tournament_id) {
          await updateTournamentStandingsInline(db, updatedGame.tournament_id, updatedGame);
        }
        walkoff = true;
      }
    }
  }

  return {
    atBatId: insertResult.meta.last_row_id as number,
    runsScored: result.runsScored,
    scoringPlayerIds: result.scoringPlayerIds,
    inningChanged: targetHalfInning.id !== halfInning.id || walkoff,
  };
}

export async function processDefenseEvent(
  db: D1Database,
  game: Game,
  halfInning: HalfInning,
  playerId: number,
  hitType: HitType,
  creditTime: string,
  description: string | null,
  enteredBy: number
): Promise<{ atBatId: number; defenseResult: ReturnType<typeof simulateDefenseEvent>; inningTransitioned: boolean }> {
  const defenseResult = simulateDefenseEvent(halfInning.strikes, halfInning.outs, hitType);
  const bases = HIT_BASES[hitType];

  // Insert at-bat record
  const insertResult = await db.prepare(
    `INSERT INTO at_bats (series_id, player_id, team_id, hit_type, bases, runs_scored, description, entered_by,
     game_id, half_inning_id, event_side, credit_time, strikes_caused, outs_caused)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 'defense', ?, ?, ?)`
  ).bind(
    game.series_id, playerId, halfInning.fielding_team_id, hitType, bases,
    description, enteredBy,
    game.id, halfInning.id, creditTime,
    defenseResult.strikesAdded, defenseResult.outsAdded
  ).run();

  // Update half-inning strikes and outs
  await db.prepare(
    'UPDATE half_innings SET strikes = ?, outs = ? WHERE id = ?'
  ).bind(defenseResult.totalStrikes, defenseResult.totalOuts, halfInning.id).run();

  let inningTransitioned = false;
  if (defenseResult.inningEnded) {
    if (defenseResult.sidesSwap) {
      await swapSidesOnDefenseHR(db, game);
    } else {
      await transitionInning(db, game);
    }
    inningTransitioned = true;
  }

  return {
    atBatId: insertResult.meta.last_row_id as number,
    defenseResult,
    inningTransitioned,
  };
}

// Duplicated here (rather than imported from routes/tournaments.ts) to avoid
// a circular import — tournaments.ts already imports this module.
async function updateTournamentStandingsInline(db: D1Database, tournamentId: number, game: any): Promise<void> {
  const homeWon = game.home_runs > game.away_runs;
  const tie = game.home_runs === game.away_runs;

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

/**
 * Defense HR: current half-inning ends, fielding team becomes batting team.
 * Unlike transitionInning, this NEVER completes the game — it just swaps sides.
 * If the swap pushes us past regulation, status flips to 'extra_innings'.
 */
async function swapSidesOnDefenseHR(db: D1Database, game: Game): Promise<void> {
  const now = centralStamp();

  await db.prepare(
    'UPDATE half_innings SET is_complete = 1, ended_at = ?, strikes = 0 WHERE game_id = ? AND inning_number = ? AND half = ?'
  ).bind(now, game.id, game.current_inning, game.current_half).run();

  let nextInning = game.current_inning;
  let nextHalf: InningHalf;
  if (game.current_half === 'top') {
    nextHalf = 'bottom';
  } else {
    nextInning = game.current_inning + 1;
    nextHalf = 'top';
  }

  const battingTeamId = nextHalf === 'top' ? game.away_team_id : game.home_team_id;
  const fieldingTeamId = nextHalf === 'top' ? game.home_team_id : game.away_team_id;

  const exists = await db.prepare(
    'SELECT id FROM half_innings WHERE game_id = ? AND inning_number = ? AND half = ?'
  ).bind(game.id, nextInning, nextHalf).first();

  if (!exists) {
    await db.prepare(
      `INSERT INTO half_innings (game_id, inning_number, half, batting_team_id, fielding_team_id)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(game.id, nextInning, nextHalf, battingTeamId, fieldingTeamId).run();
  }

  const newStatus = nextInning > game.total_innings ? 'extra_innings' : game.status;
  await db.prepare(
    'UPDATE games SET current_inning = ?, current_half = ?, status = ? WHERE id = ?'
  ).bind(nextInning, nextHalf, newStatus, game.id).run();
}

export async function transitionInning(db: D1Database, game: Game): Promise<void> {
  const now = centralStamp();

  // Mark current half-inning as complete
  await db.prepare(
    'UPDATE half_innings SET is_complete = 1, ended_at = ?, strikes = 0 WHERE game_id = ? AND inning_number = ? AND half = ?'
  ).bind(now, game.id, game.current_inning, game.current_half).run();

  let nextInning = game.current_inning;
  let nextHalf: InningHalf;

  if (game.current_half === 'top') {
    nextHalf = 'bottom';
  } else {
    nextInning = game.current_inning + 1;
    nextHalf = 'top';
  }

  // --- Game-over checks (real baseball rules) ---
  const freshGame = await db.prepare('SELECT * FROM games WHERE id = ?').bind(game.id).first<Game>();

  // 1) "Bottom not needed" — after the top of the last regulation inning (or any
  //    extra inning top), if the home team is already ahead, the game ends
  //    immediately. The home team doesn't need to bat.
  if (nextHalf === 'bottom' && nextInning >= (freshGame?.total_innings ?? game.total_innings)) {
    if (freshGame && freshGame.home_score > freshGame.away_score) {
      await db.prepare(
        "UPDATE games SET status = 'completed', completed_at = ?, winner_team_id = ? WHERE id = ?"
      ).bind(now, freshGame.home_team_id, game.id).run();

      if (freshGame.tournament_id) {
        await updateTournamentStandingsInline(db, freshGame.tournament_id, freshGame);
      }
      return;
    }
  }

  // 2) End-of-bottom check — after the bottom of the last regulation inning (or
  //    any extra inning bottom), if scores differ the game is over.
  if (nextHalf === 'top' && nextInning > (freshGame?.total_innings ?? game.total_innings)) {
    const tied = freshGame && freshGame.home_score === freshGame.away_score;

    if (!tied) {
      const winnerId = freshGame && freshGame.home_score > freshGame.away_score ? freshGame.home_team_id :
                       freshGame && freshGame.away_score > freshGame.home_score ? freshGame.away_team_id : null;

      await db.prepare(
        "UPDATE games SET status = 'completed', completed_at = ?, current_half = 'bottom', winner_team_id = ? WHERE id = ?"
      ).bind(now, winnerId, game.id).run();

      if (freshGame && freshGame.tournament_id) {
        await updateTournamentStandingsInline(db, freshGame.tournament_id, freshGame);
      }
      return;
    }
    // Tied → fall through to create the next top-half as an extra inning
  }

  // Determine batting/fielding for next half
  const battingTeamId = nextHalf === 'top' ? game.away_team_id : game.home_team_id;
  const fieldingTeamId = nextHalf === 'top' ? game.home_team_id : game.away_team_id;

  // Create next half-inning
  await db.prepare(
    `INSERT INTO half_innings (game_id, inning_number, half, batting_team_id, fielding_team_id)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(game.id, nextInning, nextHalf, battingTeamId, fieldingTeamId).run();

  // Entering or continuing extra innings: flip the game status for the UI.
  const newStatus = nextInning > game.total_innings ? 'extra_innings' : game.status;

  await db.prepare(
    'UPDATE games SET current_inning = ?, current_half = ?, status = ? WHERE id = ?'
  ).bind(nextInning, nextHalf, newStatus, game.id).run();
}

/**
 * Full replay: wipe all derived state for this game and re-apply every at-bat
 * in chronological order through the engine. Used after admin edit/delete so
 * that inning transitions and game-completion are fully reversible.
 */
export async function replayGameEvents(
  db: D1Database,
  gameId: number
): Promise<void> {
  const originalGame = await db.prepare('SELECT * FROM games WHERE id = ?').bind(gameId).first<any>();
  if (!originalGame) return;

  // 1. If the game was completed via a tournament, roll back prior standings.
  if (originalGame.status === 'completed' && originalGame.tournament_id) {
    await rollbackTournamentStandingsInline(db, originalGame.tournament_id, originalGame);
  }

  // 2. Snapshot at-bats for this game in chronological order.
  const abRes = await db.prepare(
    `SELECT id, player_id, team_id, hit_type, description, entered_by, created_at, credit_time, event_side
     FROM at_bats WHERE game_id = ? ORDER BY created_at ASC, id ASC`
  ).bind(gameId).all<any>();
  const atBats = abRes.results || [];

  // 3. Wipe derived state. Null out at_bats.half_inning_id first so we can DELETE half_innings.
  await db.prepare('UPDATE at_bats SET half_inning_id = NULL WHERE game_id = ?').bind(gameId).run();
  await db.prepare('DELETE FROM half_innings WHERE game_id = ?').bind(gameId).run();
  await db.prepare('DELETE FROM at_bats WHERE game_id = ?').bind(gameId).run();

  // 4. Reset the game row (preserve 'cancelled').
  const resetStatus = originalGame.status === 'cancelled' ? 'cancelled' : 'active';
  await db.prepare(
    `UPDATE games SET status = ?, current_inning = 1, current_half = 'top',
     completed_at = NULL, winner_team_id = NULL,
     home_score = 0, away_score = 0, home_runs = 0, away_runs = 0,
     home_bases = 0, away_bases = 0 WHERE id = ?`
  ).bind(resetStatus, gameId).run();

  // 5. Reset per-team rolling runner state.
  await db.prepare(
    `UPDATE game_base_state SET first_base = NULL, second_base = NULL, third_base = NULL,
     total_runs = 0, total_bases = 0 WHERE game_id = ?`
  ).bind(gameId).run();

  if (atBats.length === 0) return;

  // 6. Seed a fresh top-of-1 half-inning.
  await ensureInitialHalfInning(db, gameId, originalGame.home_team_id, originalGame.away_team_id);

  // 7. Replay each at-bat through the engine. Re-fetch game + half on every step
  // because defense events may trigger transitions that change the game state.
  for (const a of atBats) {
    const game = await db.prepare('SELECT * FROM games WHERE id = ?').bind(gameId).first<Game>();
    if (!game || game.status === 'completed' || game.status === 'cancelled') break;

    const half = await getCurrentHalfInning(db, game);
    if (!half) break;

    let side: EventSide;
    try { side = determineEventSide(game, a.team_id); }
    catch { continue; /* player's team no longer in this game — skip */ }

    const ct = a.credit_time || a.created_at || centralStamp();

    let newId: number;
    if (side === 'offense') {
      const r = await processOffenseEvent(db, game, half, a.player_id, a.hit_type, ct, a.description, a.entered_by);
      newId = r.atBatId;
    } else {
      const r = await processDefenseEvent(db, game, half, a.player_id, a.hit_type, ct, a.description, a.entered_by);
      newId = r.atBatId;
    }

    // Preserve original created_at for history display
    if (a.created_at) {
      await db.prepare('UPDATE at_bats SET created_at = ? WHERE id = ?').bind(a.created_at, newId).run();
    }
  }

  // 8. Rebuild game_base_state from the final half-innings.
  await rebuildGameBaseStateFromHalves(db, gameId);

  // 9. Resync series-level base_state totals for both teams. Replay doesn't
  // touch base_state as it recreates at_bats, so without this the series
  // leaderboard drifts relative to the at_bat records.
  if (originalGame.series_id) {
    for (const teamId of [originalGame.home_team_id, originalGame.away_team_id]) {
      await db.prepare(
        `UPDATE base_state
         SET total_runs = COALESCE((
               SELECT SUM(runs_scored) FROM at_bats
               WHERE series_id = ? AND team_id = ? AND event_side = 'offense'
             ), 0),
             total_bases = COALESCE((
               SELECT SUM(bases) FROM at_bats
               WHERE series_id = ? AND team_id = ?
             ), 0)
         WHERE series_id = ? AND team_id = ?`
      ).bind(
        originalGame.series_id, teamId,
        originalGame.series_id, teamId,
        originalGame.series_id, teamId,
      ).run();
    }
  }
}

async function rollbackTournamentStandingsInline(db: D1Database, tournamentId: number, game: any): Promise<void> {
  const homeWon = game.home_runs > game.away_runs;
  const tie = game.home_runs === game.away_runs;

  await db.prepare(
    `UPDATE tournament_standings SET
      wins = MAX(0, wins - ?), losses = MAX(0, losses - ?), ties = MAX(0, ties - ?),
      runs_for = MAX(0, runs_for - ?), runs_against = MAX(0, runs_against - ?),
      games_played = MAX(0, games_played - 1)
     WHERE tournament_id = ? AND team_id = ?`
  ).bind(
    homeWon ? 1 : 0, !homeWon && !tie ? 1 : 0, tie ? 1 : 0,
    game.home_runs, game.away_runs,
    tournamentId, game.home_team_id
  ).run();

  await db.prepare(
    `UPDATE tournament_standings SET
      wins = MAX(0, wins - ?), losses = MAX(0, losses - ?), ties = MAX(0, ties - ?),
      runs_for = MAX(0, runs_for - ?), runs_against = MAX(0, runs_against - ?),
      games_played = MAX(0, games_played - 1)
     WHERE tournament_id = ? AND team_id = ?`
  ).bind(
    !homeWon && !tie ? 1 : 0, homeWon ? 1 : 0, tie ? 1 : 0,
    game.away_runs, game.home_runs,
    tournamentId, game.away_team_id
  ).run();
}

async function rebuildGameBaseStateFromHalves(db: D1Database, gameId: number): Promise<void> {
  const game = await db.prepare('SELECT * FROM games WHERE id = ?').bind(gameId).first<Game>();
  if (!game) return;

  const halves = await db.prepare(
    'SELECT * FROM half_innings WHERE game_id = ? ORDER BY inning_number ASC, half ASC'
  ).bind(gameId).all<any>();

  // Per-team totals are derived from summed at_bats.
  const teams = [game.home_team_id, game.away_team_id];
  const lastHi: Record<number, any> = {};
  for (const hi of (halves.results || [])) {
    if (hi.batting_team_id) lastHi[hi.batting_team_id] = hi;
  }

  for (const teamId of teams) {
    const totals = await db.prepare(
      `SELECT COALESCE(SUM(bases), 0) as tb, COALESCE(SUM(runs_scored), 0) as runs
       FROM at_bats WHERE game_id = ? AND team_id = ? AND event_side = 'offense'`
    ).bind(gameId, teamId).first<any>();

    const last = lastHi[teamId];
    await db.prepare(
      `INSERT INTO game_base_state (game_id, team_id, first_base, second_base, third_base, total_runs, total_bases)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(game_id, team_id) DO UPDATE SET
         first_base = excluded.first_base,
         second_base = excluded.second_base,
         third_base = excluded.third_base,
         total_runs = excluded.total_runs,
         total_bases = excluded.total_bases`
    ).bind(
      gameId, teamId,
      last?.first_base ?? null, last?.second_base ?? null, last?.third_base ?? null,
      totals?.runs ?? 0, totals?.tb ?? 0
    ).run();
  }
}

export async function getGameStateWithNames(db: D1Database, gameId: number) {
  const game = await db.prepare(`
    SELECT g.*,
      ht.name as home_team_name,
      at2.name as away_team_name
    FROM games g
    JOIN teams ht ON g.home_team_id = ht.id
    JOIN teams at2 ON g.away_team_id = at2.id
    WHERE g.id = ?
  `).bind(gameId).first();

  if (!game) return null;

  const halfInning = await db.prepare(`
    SELECT hi.*,
      p1.display_name as first_base_name,
      p2.display_name as second_base_name,
      p3.display_name as third_base_name
    FROM half_innings hi
    LEFT JOIN players p1 ON hi.first_base = p1.id
    LEFT JOIN players p2 ON hi.second_base = p2.id
    LEFT JOIN players p3 ON hi.third_base = p3.id
    WHERE hi.game_id = ? AND hi.inning_number = ? AND hi.half = ?
  `).bind(gameId, (game as any).current_inning, (game as any).current_half).first();

  return { game, halfInning };
}
