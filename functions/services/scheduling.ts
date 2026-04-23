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
  daysBetweenRounds: number = 1
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

  // Circle method: fix first team, rotate the rest
  const fixed = teams[0];
  const rotating = teams.slice(1);

  for (let round = 0; round < totalRounds; round++) {
    const roundDate = addDays(startDate, round * daysBetweenRounds);
    let gameNumber = 1;

    for (let match = 0; match < gamesPerRound; match++) {
      // Circle positions: position 0 is fixed; positions 1..n-1 are the rotating array.
      // Each round pairs position m with position n-1-m.
      let home: number;
      let away: number;

      if (match === 0) {
        home = fixed;                         // position 0
        away = rotating[rotating.length - 1]; // position n-1
      } else {
        home = rotating[match - 1];           // position match
        away = rotating[rotating.length - 1 - match]; // position n-1-match
      }

      // Skip BYE games
      if (home === -1 || away === -1) continue;

      // Alternate home/away across rounds for fairness on the fixed-team matchup
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

    // Rotate: move last element to the front of the rotating array
    rotating.unshift(rotating.pop()!);
  }

  return games;
}

function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split('T')[0];
}
