import { HitType, HIT_BASES } from '../types';

export interface RunnerState {
  first: number | null;   // player_id or null
  second: number | null;
  third: number | null;
}

export interface SimulationResult {
  newBases: RunnerState;
  runsScored: number;
  scoringPlayerIds: number[];
}

export function simulateAtBat(
  baseState: RunnerState,
  batterId: number,
  hitType: HitType
): SimulationResult {
  const advanceBy = HIT_BASES[hitType];

  // Collect all runners: [{playerId, currentBase}]
  // Process from highest base first (3rd, 2nd, 1st, then batter at 0)
  const runners: { playerId: number; base: number }[] = [];

  if (baseState.third !== null) runners.push({ playerId: baseState.third, base: 3 });
  if (baseState.second !== null) runners.push({ playerId: baseState.second, base: 2 });
  if (baseState.first !== null) runners.push({ playerId: baseState.first, base: 1 });
  runners.push({ playerId: batterId, base: 0 });

  const newBases: RunnerState = { first: null, second: null, third: null };
  let runsScored = 0;
  const scoringPlayerIds: number[] = [];

  for (const runner of runners) {
    const newBase = runner.base + advanceBy;
    if (newBase >= 4) {
      runsScored++;
      scoringPlayerIds.push(runner.playerId);
    } else if (newBase === 3) {
      newBases.third = runner.playerId;
    } else if (newBase === 2) {
      newBases.second = runner.playerId;
    } else if (newBase === 1) {
      newBases.first = runner.playerId;
    }
  }

  return { newBases, runsScored, scoringPlayerIds };
}

export interface DefenseResult {
  strikesAdded: number;
  outsAdded: number;
  totalStrikes: number;
  totalOuts: number;
  inningEnded: boolean;
}

export function simulateDefenseEvent(
  currentStrikes: number,
  currentOuts: number,
  hitType: HitType
): DefenseResult {
  const bases = HIT_BASES[hitType];
  let strikesAdded = 0;
  let outsAdded = 0;

  if (hitType === 'single') {
    // Strikeout: 1 strike toward the count
    strikesAdded = 1;
  } else if (hitType === 'double') {
    // Caught out: direct out
    outsAdded = 1;
  } else if (hitType === 'triple') {
    // Double play: 2 outs
    outsAdded = 2;
  } else if (hitType === 'home_run') {
    // Triple play: 3 outs (inning over)
    outsAdded = 3;
  }

  let totalStrikes = currentStrikes + strikesAdded;
  let totalOuts = currentOuts + outsAdded;

  // 2 strikes = strikeout = 1 out
  if (totalStrikes >= 2) {
    totalOuts += 1;
    totalStrikes = 0;
  }

  const inningEnded = totalOuts >= 3;

  return { strikesAdded, outsAdded, totalStrikes, totalOuts, inningEnded };
}

/**
 * Replay all at-bats for a team+series to rebuild base state from scratch.
 * Used when an at-bat is deleted (undo).
 */
export function replayAtBats(
  atBats: { player_id: number; hit_type: HitType }[]
): { bases: RunnerState; totalRuns: number; totalBases: number } {
  let bases: RunnerState = { first: null, second: null, third: null };
  let totalRuns = 0;
  let totalBases = 0;

  for (const ab of atBats) {
    const result = simulateAtBat(bases, ab.player_id, ab.hit_type);
    bases = result.newBases;
    totalRuns += result.runsScored;
    totalBases += HIT_BASES[ab.hit_type];
  }

  return { bases, totalRuns, totalBases };
}
