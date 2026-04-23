/**
 * Round robin schedule generator using the circle method.
 * Given N teams, generates N-1 rounds (or N if odd count with BYE)
 * where each team plays every other team exactly once.
 */

export interface ScheduledGame {
  homeTeamId: number;
  awayTeamId: number;
  round: number;
  gameNumber: number;
  scheduledDate: string;
}

/**
 * Generate a round robin schedule for the given teams.
 * @param teamIds - array of team IDs participating
 * @param startDate - first round date (YYYY-MM-DD)
 * @param daysBetweenRounds - days between each round (default 1)
 * @returns array of scheduled games
 */
export function generateRoundRobin(
  teamIds: number[],
  startDate: string,
  daysBetweenRounds: number = 1,
  excludeDates: string[] = []
): ScheduledGame[] {
  if (teamIds.length < 2) return [];

  const teams = [...teamIds];
  const hasBye = teams.length % 2 !== 0;

  // Add a BYE placeholder (-1) if odd number of teams
  if (hasBye) teams.push(-1);

  const n = teams.length;
  const totalRounds = n - 1;
  const gamesPerRound = n / 2;
  const games: ScheduledGame[] = [];

  // Circle method: fix first team, rotate the rest. Pair position i with n-1-i.
  const fixed = teams[0];
  const rotating = teams.slice(1);
  const excluded = new Set(excludeDates);

  // Walk calendar day-by-day: step forward by daysBetweenRounds, skip any
  // excluded dates, and assign the next unassigned round to each eligible day.
  const roundDates: string[] = [];
  let cursor = startDate;
  while (roundDates.length < totalRounds) {
    if (!excluded.has(cursor)) roundDates.push(cursor);
    cursor = addDays(cursor, daysBetweenRounds);
  }

  for (let round = 0; round < totalRounds; round++) {
    const roundDate = roundDates[round];
    const positions = [fixed, ...rotating];
    let gameNumber = 1;

    for (let match = 0; match < gamesPerRound; match++) {
      let home: number;
      let away: number;

      if (match === 0) {
        home = fixed;
        away = rotating[rotating.length - 1];
      } else {
        home = rotating[match - 1];
        away = rotating[rotating.length - 1 - match];
      }

      if (home === -1 || away === -1) continue;

      if (round % 2 === 1 && match === 0) {
        [home, away] = [away, home];
      }

      games.push({
        homeTeamId: home,
        awayTeamId: away,
        round: round + 1,
        gameNumber,
        scheduledDate: roundDate,
      });
      gameNumber++;
    }

    // Rotate: move last element to the front
    rotating.unshift(rotating.pop()!);
  }

  return games;
}

function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split('T')[0];
}
