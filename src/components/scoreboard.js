/**
 * Renders a classic baseball line score scoreboard.
 * Shows inning-by-inning runs with team names and total score.
 */
export function renderScoreboard(container, game, innings) {
  const totalInnings = game.total_innings || 9;
  const currentInning = game.current_inning || 1;
  const currentHalf = game.current_half || 'top';

  // Build inning columns
  let inningHeaders = '';
  let awayRow = '';
  let homeRow = '';

  for (let i = 1; i <= totalInnings; i++) {
    const isCurrent = i === currentInning;
    inningHeaders += `<th class="${isCurrent ? 'current-inning' : ''}">${i}</th>`;

    const topHalf = innings?.find(hi => hi.inning_number === i && hi.half === 'top');
    const botHalf = innings?.find(hi => hi.inning_number === i && hi.half === 'bottom');

    const awayRuns = topHalf ? topHalf.runs_scored : '';
    const homeRuns = botHalf ? botHalf.runs_scored : '';

    const awayActive = isCurrent && currentHalf === 'top' && game.status === 'active';
    const homeActive = isCurrent && currentHalf === 'bottom' && game.status === 'active';

    awayRow += `<td class="${awayActive ? 'active-cell' : ''}">${awayRuns}</td>`;
    homeRow += `<td class="${homeActive ? 'active-cell' : ''}">${homeRuns}</td>`;
  }

  container.innerHTML = `
    <div class="scoreboard">
      <table class="scoreboard-table">
        <thead>
          <tr>
            <th class="team-col"></th>
            ${inningHeaders}
            <th class="total-col">R</th>
          </tr>
        </thead>
        <tbody>
          <tr class="away-row">
            <td class="team-name-cell">${game.away_team_name || 'Away'}</td>
            ${awayRow}
            <td class="total-cell">${game.away_score || 0}</td>
          </tr>
          <tr class="home-row">
            <td class="team-name-cell">${game.home_team_name || 'Home'}</td>
            ${homeRow}
            <td class="total-cell">${game.home_score || 0}</td>
          </tr>
        </tbody>
      </table>
      <div class="scoreboard-status">
        ${game.status === 'active' ? `
          <span class="inning-indicator">
            <span class="half-arrow ${currentHalf}">${currentHalf === 'top' ? '\u25B2' : '\u25BC'}</span>
            ${currentInning}${getOrdinal(currentInning)}
          </span>
        ` : game.status === 'completed' ? '<span class="game-final">FINAL</span>' : '<span class="game-scheduled">SCHEDULED</span>'}
      </div>
    </div>`;
}

function getOrdinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

/**
 * Renders outs and strikes indicators.
 */
export function renderOutsStrikes(container, outs, strikes) {
  container.innerHTML = `
    <div class="outs-strikes-display">
      <div class="indicator-group">
        <span class="indicator-label">S</span>
        <div class="indicator-dots">
          ${[0, 1].map(i => `<span class="dot ${i < strikes ? 'filled strike-dot' : ''}"></span>`).join('')}
        </div>
      </div>
      <div class="indicator-group">
        <span class="indicator-label">O</span>
        <div class="indicator-dots">
          ${[0, 1, 2].map(i => `<span class="dot ${i < outs ? 'filled out-dot' : ''}"></span>`).join('')}
        </div>
      </div>
    </div>`;
}
