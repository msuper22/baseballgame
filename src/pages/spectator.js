import { api, isLoggedIn } from '../api.js';
import { navigate } from '../router.js';
import { showToast } from '../components/toast.js';

let refreshInterval = null;

export async function spectatorPage(app) {
  if (!isLoggedIn()) { navigate('/login'); return; }

  app.innerHTML = `
    <div class="container">
      <h1>&#127911; Spectator View</h1>
      <p class="subtitle">Watch all active games</p>
      <div id="spectator-games" class="spectator-games-grid">
        <div class="loading">Loading games...</div>
      </div>
    </div>`;

  await loadGames();
  refreshInterval = setInterval(loadGames, 8000);

  return () => {
    if (refreshInterval) { clearInterval(refreshInterval); refreshInterval = null; }
  };
}

async function loadGames() {
  const grid = document.getElementById('spectator-games');
  if (!grid) return;

  try {
    const res = await api('/spectator/games');
    if (!res.games?.length) {
      grid.innerHTML = '<p class="empty-state">No active games right now.</p>';
      return;
    }

    grid.innerHTML = res.games.map(g => `
      <div class="spectator-game-card" data-game-id="${g.id}">
        <div class="spec-card-teams">
          <span class="spec-away">${g.away_team_name}</span>
          <span class="spec-score">${g.away_score} - ${g.home_score}</span>
          <span class="spec-home">${g.home_team_name}</span>
        </div>
        <div class="spec-card-inning">
          <span class="half-arrow ${g.current_half}">${g.current_half === 'top' ? '\u25B2' : '\u25BC'}</span>
          ${g.current_inning}${getOrdinal(g.current_inning)} Inning
        </div>
        <div class="spec-card-action">Watch Game \u2192</div>
      </div>
    `).join('');

    grid.querySelectorAll('.spectator-game-card').forEach(card => {
      card.addEventListener('click', () => {
        navigate(`/spectator/${card.dataset.gameId}`);
      });
    });
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function getOrdinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
