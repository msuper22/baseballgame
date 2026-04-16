import { HitType, HIT_BASES, Game, HalfInning, EventSide, InningHalf } from '../types';
import { simulateAtBat, simulateDefenseEvent, RunnerState } from './simulation';

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
  // Credit time validation: if this half-inning is complete and credit_time > ended_at,
  // the event should go to the next offensive half-inning for this team
  let targetHalfInning = halfInning;
  let targetGame = game;
  if (halfInning.is_complete && halfInning.ended_at && creditTime > halfInning.ended_at) {
    const next = await findNextOffensiveHalfInning(db, game, halfInning.batting_team_id, halfInning.inning_number, halfInning.half);
    if (!next) throw new Error('Game is over — no more offensive innings available');
    targetHalfInning = next.halfInning;
    targetGame = next.game;
  }

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

  // Update game score
  if (result.runsScored > 0) {
    const isHome = targetHalfInning.batting_team_id === targetGame.home_team_id;
    const scoreCol = isHome ? 'home_score' : 'away_score';
    await db.prepare(
      `UPDATE games SET ${scoreCol} = ${scoreCol} + ? WHERE id = ?`
    ).bind(result.runsScored, targetGame.id).run();

    // Golden score: first team to score wins
    const currentGame = await db.prepare('SELECT * FROM games WHERE id = ?').bind(targetGame.id).first<Game>();
    if (currentGame && currentGame.status === 'golden_score') {
      const winNow = new Date().toISOString().replace('T', ' ').slice(0, 19);
      await db.prepare(
        "UPDATE games SET status = 'completed', completed_at = ? WHERE id = ?"
      ).bind(winNow, targetGame.id).run();
    }
  }

  return {
    atBatId: insertResult.meta.last_row_id as number,
    runsScored: result.runsScored,
    scoringPlayerIds: result.scoringPlayerIds,
    inningChanged: targetHalfInning.id !== halfInning.id,
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
    await transitionInning(db, game);
    inningTransitioned = true;
  }

  return {
    atBatId: insertResult.meta.last_row_id as number,
    defenseResult,
    inningTransitioned,
  };
}

export async function transitionInning(db: D1Database, game: Game): Promise<void> {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

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

  // Check if game is over
  if (nextInning > game.total_innings && nextHalf === 'top') {
    // Check for tie — enter golden score
    const currentGame = await db.prepare('SELECT * FROM games WHERE id = ?').bind(game.id).first<Game>();
    if (currentGame && currentGame.home_score === currentGame.away_score) {
      // Golden score: both teams on offense, first to score wins
      await db.prepare(
        "UPDATE games SET status = 'golden_score', current_inning = ?, current_half = 'top' WHERE id = ?"
      ).bind(nextInning, game.id).run();

      // Create half-innings for both teams simultaneously
      await db.prepare(
        `INSERT INTO half_innings (game_id, inning_number, half, batting_team_id, fielding_team_id)
         VALUES (?, ?, 'top', ?, ?)`
      ).bind(game.id, nextInning, game.away_team_id, game.home_team_id).run();
      await db.prepare(
        `INSERT INTO half_innings (game_id, inning_number, half, batting_team_id, fielding_team_id)
         VALUES (?, ?, 'bottom', ?, ?)`
      ).bind(game.id, nextInning, game.home_team_id, game.away_team_id).run();
      return;
    }

    await db.prepare(
      "UPDATE games SET status = 'completed', completed_at = ?, current_half = 'bottom' WHERE id = ?"
    ).bind(now, game.id).run();
    return;
  }

  // Determine batting/fielding for next half
  const battingTeamId = nextHalf === 'top' ? game.away_team_id : game.home_team_id;
  const fieldingTeamId = nextHalf === 'top' ? game.home_team_id : game.away_team_id;

  // Create next half-inning
  await db.prepare(
    `INSERT INTO half_innings (game_id, inning_number, half, batting_team_id, fielding_team_id)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(game.id, nextInning, nextHalf, battingTeamId, fieldingTeamId).run();

  // Update game state
  await db.prepare(
    'UPDATE games SET current_inning = ?, current_half = ? WHERE id = ?'
  ).bind(nextInning, nextHalf, game.id).run();
}

async function findNextOffensiveHalfInning(
  db: D1Database,
  game: Game,
  teamId: number,
  afterInning: number,
  afterHalf: InningHalf
): Promise<{ halfInning: HalfInning; game: Game } | null> {
  // Look for an existing incomplete half-inning where this team bats
  const existing = await db.prepare(
    `SELECT * FROM half_innings WHERE game_id = ? AND batting_team_id = ? AND is_complete = 0
     AND (inning_number > ? OR (inning_number = ? AND half > ?))
     ORDER BY inning_number ASC, half ASC LIMIT 1`
  ).bind(game.id, teamId, afterInning, afterInning, afterHalf).first<HalfInning>();

  if (existing) {
    const currentGame = await db.prepare('SELECT * FROM games WHERE id = ?').bind(game.id).first<Game>();
    return { halfInning: existing, game: currentGame! };
  }

  // Check if the game's current half-inning is for this team and is not complete
  const current = await db.prepare(
    'SELECT * FROM half_innings WHERE game_id = ? AND inning_number = ? AND half = ? AND batting_team_id = ? AND is_complete = 0'
  ).bind(game.id, game.current_inning, game.current_half, teamId).first<HalfInning>();

  if (current) {
    return { halfInning: current, game };
  }

  return null;
}

export async function replayGameEvents(
  db: D1Database,
  gameId: number
): Promise<void> {
  // Get all half-innings for this game in order
  const halfInnings = await db.prepare(
    'SELECT * FROM half_innings WHERE game_id = ? ORDER BY inning_number ASC, half ASC'
  ).bind(gameId).all<HalfInning>();

  let homeScore = 0;
  let awayScore = 0;

  const game = await db.prepare('SELECT * FROM games WHERE id = ?').bind(gameId).first<Game>();
  if (!game) return;

  for (const hi of halfInnings.results) {
    // Get offense events for this half-inning
    const offenseEvents = await db.prepare(
      "SELECT player_id, hit_type FROM at_bats WHERE half_inning_id = ? AND event_side = 'offense' ORDER BY created_at ASC"
    ).bind(hi.id).all<{ player_id: number; hit_type: HitType }>();

    // Get defense events for this half-inning
    const defenseEvents = await db.prepare(
      "SELECT hit_type FROM at_bats WHERE half_inning_id = ? AND event_side = 'defense' ORDER BY created_at ASC"
    ).bind(hi.id).all<{ hit_type: HitType }>();

    // Replay offense
    let bases: RunnerState = { first: null, second: null, third: null };
    let hiRuns = 0;
    for (const e of offenseEvents.results) {
      const result = simulateAtBat(bases, e.player_id, e.hit_type);
      bases = result.newBases;
      hiRuns += result.runsScored;
    }

    // Replay defense
    let strikes = 0;
    let outs = 0;
    for (const e of defenseEvents.results) {
      const dr = simulateDefenseEvent(strikes, outs, e.hit_type);
      strikes = dr.totalStrikes;
      outs = dr.totalOuts;
    }

    const isComplete = outs >= 3 ? 1 : 0;

    // Update half-inning state
    await db.prepare(
      `UPDATE half_innings SET first_base = ?, second_base = ?, third_base = ?,
       runs_scored = ?, outs = ?, strikes = ?, is_complete = ? WHERE id = ?`
    ).bind(bases.first, bases.second, bases.third, hiRuns, outs, strikes, isComplete, hi.id).run();

    if (hi.batting_team_id === game.home_team_id) {
      homeScore += hiRuns;
    } else {
      awayScore += hiRuns;
    }
  }

  // Update game scores
  await db.prepare(
    'UPDATE games SET home_score = ?, away_score = ? WHERE id = ?'
  ).bind(homeScore, awayScore, gameId).run();
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
