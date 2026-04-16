import { api, isLoggedIn, isAdmin, getUser } from '../api.js';
import { navigate } from '../router.js';
import { renderDiamond } from '../components/diamond.js';
import { renderEventForm } from '../components/event-form.js';
import { showToast } from '../components/toast.js';

let refreshInterval = null;

export async function gamePage(app, params) {
  if (!isLoggedIn()) { navigate('/login'); return; }

  const gameId = params.id;

  app.innerHTML = `
    <div class="container">
      <div class="dashboard-header">
        <h1>&#9918; Game Detail</h1>
        <div>
          <a href="#/schedule" class="btn btn-sm">&larr; Schedule</a>
          <button id="refresh-btn" class="btn btn-sm" title="Refresh">&#8635;</button>
        </div>
      </div>
      <div id="game-header" class="game-detail-header"></div>
      <div id="game-diamonds" class="game-diamonds-grid"></div>
      <div id="game-event-form"></div>
      <div id="game-plays" class="recent-plays"></div>
    </div>`;

  await loadGame(gameId);

  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = setInterval(() => loadGame(gameId), 30000);

  document.getElementById('refresh-btn')?.addEventListener('click', () => {
    loadGame(gameId);
    showToast('Refreshed!', 'info');
  });

  return () => {
    if (refreshInterval) { clearInterval(refreshInterval); refreshInterval = null; }
  };
}

async function loadGame(gameId) {
  try {
    const res = await api(`/games/${gameId}`);
    const game = res.game;
    const baseStates = res.base_states || [];
    const atBats = res.at_bats || [];
    const user = getUser();

    // Render header
    const headerEl = document.getElementById('game-header');
    if (headerEl) {
      const statusLabel = { scheduled: 'Upcoming', active: 'LIVE', completed: 'Final', cancelled: 'Cancelled' }[game.status];
      headerEl.innerHTML = `
        <div class="game-detail-info">
          <span class="game-badge game-status-${game.status}">${statusLabel}</span>
          ${game.tournament_name ? `<span class="game-tournament">${game.tournament_name}${game.round ? ` - Round ${game.round}` : ''}</span>` : '<span class="game-tournament">Challenge Game</span>'}
          <span class="game-date">${formatDate(game.scheduled_date)}${game.scheduled_time ? ' at ' + game.scheduled_time : ''}</span>
        </div>
        <div class="game-scoreboard">
          <div class="score-team ${game.winner_team_id === game.home_team_id ? 'winner' : ''}">
            <span class="score-team-name">${game.home_team_name}</span>
            <span class="score-value">${game.home_runs}</span>
          </div>
          <span class="score-separator">-</span>
          <div class="score-team ${game.winner_team_id === game.away_team_id ? 'winner' : ''}">
            <span class="score-value">${game.away_runs}</span>
            <span class="score-team-name">${game.away_team_name}</span>
          </div>
        </div>
        ${isAdmin() && game.status !== 'completed' ? `
          <div class="game-admin-controls">
            ${game.status === 'scheduled' ? `<button class="btn btn-sm btn-primary" id="activate-game">Start Game</button>` : ''}
            ${game.status === 'active' ? `<button class="btn btn-sm btn-danger" id="complete-game">End Game</button>` : ''}
          </div>` : ''}`;

      document.getElementById('activate-game')?.addEventListener('click', async () => {
        try {
          await api(`/games/${gameId}`, { method: 'PUT', body: JSON.stringify({ status: 'active' }) });
          showToast('Game started!', 'success');
          loadGame(gameId);
        } catch (e) { showToast(e.message, 'error'); }
      });

      document.getElementById('complete-game')?.addEventListener('click', async () => {
        if (!confirm('End this game? The winner will be determined by current score.')) return;
        try {
          await api(`/games/${gameId}`, { method: 'PUT', body: JSON.stringify({ status: 'completed' }) });
          showToast('Game completed!', 'success');
          loadGame(gameId);
        } catch (e) { showToast(e.message, 'error'); }
      });
    }

    // Render diamonds side by side
    const diamondsEl = document.getElementById('game-diamonds');
    if (diamondsEl) {
      diamondsEl.innerHTML = '';
      for (const bs of baseStates) {
        const div = document.createElement('div');
        div.className = 'diamond-wrapper';
        diamondsEl.appendChild(div);
        renderDiamond(div, {
          team_id: bs.team_id,
          team_name: bs.team_name,
          total_runs: bs.total_runs,
          total_bases: bs.total_bases,
          first_base: bs.first_base,
          second_base: bs.second_base,
          third_base: bs.third_base,
          first_base_name: bs.first_base_name,
          second_base_name: bs.second_base_name,
          third_base_name: bs.third_base_name,
        });
      }
    }

    // Render event form if user is on one of the teams and game is active
    const formEl = document.getElementById('game-event-form');
    if (formEl) {
      const isInGame = user?.team_id === game.home_team_id || user?.team_id === game.away_team_id;
      if (isInGame && (game.status === 'active' || game.status === 'scheduled')) {
        await renderEventForm(formEl, {
          gameId: parseInt(gameId),
          gameInfo: game,
          onSuccess: () => loadGame(gameId),
        });
      } else {
        formEl.innerHTML = '';
      }
    }

    // Render play-by-play
    const playsEl = document.getElementById('game-plays');
    if (playsEl) {
      if (atBats.length) {
        playsEl.innerHTML = `
          <h2>Play-by-Play</h2>
          <div class="plays-list">
            ${atBats.map(ab => `
              <div class="play-item">
                <span class="play-type play-${ab.hit_type}">${formatHitType(ab.hit_type)}</span>
                <span class="play-player">${ab.player_name}</span>
                <span class="play-team">${ab.team_name}</span>
                ${ab.runs_scored > 0 ? `<span class="play-runs">+${ab.runs_scored} run${ab.runs_scored > 1 ? 's' : ''}</span>` : ''}
                <span class="play-time">${timeAgo(ab.created_at)}</span>
              </div>
            `).join('')}
          </div>`;
      } else {
        playsEl.innerHTML = '<p class="empty-state">No plays yet.</p>';
      }
    }
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function formatHitType(type) {
  return { single: '1B', double: '2B', triple: '3B', home_run: 'HR' }[type] || type;
}

function formatDate(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
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
