import { launchConfetti } from '../confetti.js';

/**
 * Shows an inning transition celebration overlay.
 */
export function showInningTransition(message = '3 OUTS!') {
  const overlay = document.createElement('div');
  overlay.className = 'celebration-overlay inning-transition';
  overlay.innerHTML = `
    <div class="celebration-content">
      <div class="celebration-text">${message}</div>
      <div class="celebration-sub">Switching Sides</div>
    </div>`;
  document.body.appendChild(overlay);

  requestAnimationFrame(() => overlay.classList.add('show'));

  setTimeout(() => {
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 500);
  }, 2500);
}

/**
 * Shows a game-over celebration with final score and stats.
 * stats: { mvp, topPlays, homeScore, awayScore, homeName, awayName, winner }
 */
export function showGameOver(stats) {
  const overlay = document.createElement('div');
  overlay.className = 'celebration-overlay game-over-overlay';

  const winnerName = stats.homeScore > stats.awayScore ? stats.homeName : stats.awayName;
  const isTie = stats.homeScore === stats.awayScore;

  overlay.innerHTML = `
    <div class="game-over-content">
      <div class="game-over-title">GAME OVER</div>
      <div class="game-over-score">
        <div class="game-over-team">
          <span class="game-over-name">${stats.awayName}</span>
          <span class="game-over-runs">${stats.awayScore}</span>
        </div>
        <span class="game-over-vs">-</span>
        <div class="game-over-team">
          <span class="game-over-runs">${stats.homeScore}</span>
          <span class="game-over-name">${stats.homeName}</span>
        </div>
      </div>
      ${!isTie ? `<div class="game-over-winner">${winnerName} Wins!</div>` : '<div class="game-over-winner">Tied! Extra Innings!</div>'}
      ${stats.mvp ? `
        <div class="game-over-mvp">
          <span class="mvp-label">Game MVP</span>
          <span class="mvp-name">${stats.mvp.player_name}</span>
          <span class="mvp-stats">${stats.mvp.total_bases} TB</span>
        </div>
      ` : ''}
      ${stats.topPlays?.length ? `
        <div class="game-over-highlights">
          <span class="highlights-label">Highlights</span>
          ${stats.topPlays.slice(0, 3).map(p => `
            <div class="highlight-line">${p.player_name} — ${p.total_bases} TB, ${p.home_runs} HR</div>
          `).join('')}
        </div>
      ` : ''}
      <button class="btn btn-primary game-over-dismiss">Continue</button>
    </div>`;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));

  // Confetti for the winner
  if (!isTie) {
    setTimeout(() => launchConfetti(4), 300);
  }

  overlay.querySelector('.game-over-dismiss')?.addEventListener('click', () => {
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 500);
  });
}

/**
 * Shows a streak notification.
 */
export function showStreakNotification(playerName, streakCount) {
  const el = document.createElement('div');
  el.className = 'streak-notification';
  el.innerHTML = `<span class="streak-fire">\u{1F525}</span> ${playerName} is on a ${streakCount}-game hit streak!`;
  document.body.appendChild(el);

  requestAnimationFrame(() => el.classList.add('show'));

  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 500);
  }, 3500);
}
