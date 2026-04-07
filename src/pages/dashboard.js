import { api, isLoggedIn } from '../api.js';
import { navigate } from '../router.js';
import { renderDiamond } from '../components/diamond.js';
import { showToast } from '../components/toast.js';

export async function dashboardPage(app) {
  if (!isLoggedIn()) { navigate('/login'); return; }

  app.innerHTML = `
    <div class="container">
      <div class="dashboard-header">
        <h1>&#127935; Game Dashboard</h1>
        <div id="series-info" class="series-info"></div>
      </div>
      <div id="diamonds-grid" class="diamonds-grid">
        <div class="loading">Loading game state...</div>
      </div>
      <div id="recent-plays" class="recent-plays"></div>
    </div>`;

  try {
    // Load series info
    try {
      const seriesRes = await api('/series/active');
      const s = seriesRes.series;
      document.getElementById('series-info').innerHTML =
        `<span class="series-name">${s.name}</span> <span class="series-dates">${s.start_date} - ${s.end_date}</span>`;
    } catch {
      document.getElementById('series-info').innerHTML =
        '<span class="warn">No active series. Admin needs to create one.</span>';
    }

    // Load game states
    const statesRes = await api('/stats/game-states');
    const grid = document.getElementById('diamonds-grid');

    if (!statesRes.game_states?.length) {
      grid.innerHTML = '<p class="empty-state">No teams in the current series yet. Create teams and start a series from the Admin panel.</p>';
      return;
    }

    grid.innerHTML = '';
    for (const state of statesRes.game_states) {
      const div = document.createElement('div');
      div.className = 'diamond-wrapper';
      div.addEventListener('click', () => navigate(`/team/${state.team_id}`));
      grid.appendChild(div);
      renderDiamond(div, state);
    }

    // Load recent plays
    const playsRes = await api('/at-bats?limit=10');
    const recentDiv = document.getElementById('recent-plays');
    if (playsRes.at_bats?.length) {
      recentDiv.innerHTML = `
        <h2>Recent Plays</h2>
        <div class="plays-list">
          ${playsRes.at_bats.slice(0, 10).map(ab => `
            <div class="play-item">
              <span class="play-type play-${ab.hit_type}">${formatHitType(ab.hit_type)}</span>
              <span class="play-player">${ab.player_name}</span>
              <span class="play-team">${ab.team_name}</span>
              ${ab.runs_scored > 0 ? `<span class="play-runs">+${ab.runs_scored} run${ab.runs_scored > 1 ? 's' : ''}</span>` : ''}
              <span class="play-time">${timeAgo(ab.created_at)}</span>
            </div>
          `).join('')}
        </div>`;
    }
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function formatHitType(type) {
  const map = { single: '1B', double: '2B', triple: '3B', home_run: 'HR' };
  return map[type] || type;
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr + 'Z').getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
