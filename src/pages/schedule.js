import { api, isLoggedIn, getUser } from '../api.js';
import { navigate } from '../router.js';
import { showToast } from '../components/toast.js';

export async function schedulePage(app) {
  if (!isLoggedIn()) { navigate('/login'); return; }

  const user = getUser();

  app.innerHTML = `
    <div class="container">
      <div class="dashboard-header">
        <h1>&#128197; Schedule</h1>
        <div class="schedule-filters">
          <label class="toggle-label">
            <input type="checkbox" id="my-games-toggle"> My Games Only
          </label>
          <select id="status-filter" class="form-input" style="width:auto;padding:0.3rem 0.5rem;font-size:1rem">
            <option value="">All Games</option>
            <option value="scheduled">Upcoming</option>
            <option value="active">In Progress</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>
      <div id="schedule-content" class="schedule-content">
        <div class="loading">Loading schedule...</div>
      </div>
    </div>`;

  await loadSchedule();

  document.getElementById('my-games-toggle')?.addEventListener('change', loadSchedule);
  document.getElementById('status-filter')?.addEventListener('change', loadSchedule);

  async function loadSchedule() {
    const content = document.getElementById('schedule-content');
    if (!content) return;

    const myGamesOnly = document.getElementById('my-games-toggle')?.checked;
    const statusFilter = document.getElementById('status-filter')?.value;

    try {
      let url = '/games/schedule';
      const params = [];
      if (myGamesOnly && user?.team_id) params.push(`team_id=${user.team_id}`);
      if (params.length) url += '?' + params.join('&');

      const res = await api(url);
      let games = res.games || [];

      if (statusFilter) {
        games = games.filter(g => g.status === statusFilter);
      }

      if (!games.length) {
        content.innerHTML = '<p class="empty-state">No games scheduled yet.</p>';
        return;
      }

      // Group by date
      const grouped = {};
      for (const game of games) {
        const date = game.scheduled_date;
        if (!grouped[date]) grouped[date] = [];
        grouped[date].push(game);
      }

      const today = new Date().toISOString().split('T')[0];

      content.innerHTML = Object.entries(grouped).map(([date, dateGames]) => {
        const isToday = date === today;
        const isPast = date < today;
        const dateLabel = isToday ? 'Today' : formatDate(date);
        const dateClass = isToday ? 'schedule-date today' : isPast ? 'schedule-date past' : 'schedule-date';

        return `
          <div class="schedule-day">
            <h2 class="${dateClass}">${dateLabel} <span class="date-sub">${date}</span></h2>
            <div class="schedule-games">
              ${dateGames.map(g => renderGameCard(g, user)).join('')}
            </div>
          </div>`;
      }).join('');

      // Add click handlers to game cards
      content.querySelectorAll('.game-card').forEach(card => {
        card.addEventListener('click', () => {
          navigate(`/game/${card.dataset.id}`);
        });
      });
    } catch (e) {
      content.innerHTML = `<p class="error">${e.message}</p>`;
    }
  }
}

function renderGameCard(game, user) {
  const isMyTeam = user?.team_id === game.home_team_id || user?.team_id === game.away_team_id;
  const statusClass = `game-status-${game.status}`;
  const statusLabel = { scheduled: 'Upcoming', active: 'Live', completed: 'Final', cancelled: 'Cancelled' }[game.status] || game.status;

  return `
    <div class="game-card ${isMyTeam ? 'my-game' : ''}" data-id="${game.id}">
      <div class="game-card-header">
        <span class="game-badge ${statusClass}">${statusLabel}</span>
        ${game.tournament_name ? `<span class="game-tournament">${game.tournament_name}</span>` : '<span class="game-tournament">Challenge</span>'}
        ${game.scheduled_time ? `<span class="game-time">${game.scheduled_time}</span>` : ''}
        ${game.round ? `<span class="game-round">Rd ${game.round}</span>` : ''}
      </div>
      <div class="game-matchup">
        <div class="game-team ${game.winner_team_id === game.home_team_id ? 'winner' : ''}">
          <span class="team-name">${game.home_team_name}</span>
          <span class="team-score">${game.status !== 'scheduled' ? game.home_runs : '-'}</span>
        </div>
        <span class="game-vs">vs</span>
        <div class="game-team ${game.winner_team_id === game.away_team_id ? 'winner' : ''}">
          <span class="team-name">${game.away_team_name}</span>
          <span class="team-score">${game.status !== 'scheduled' ? game.away_runs : '-'}</span>
        </div>
      </div>
    </div>`;
}

function formatDate(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
