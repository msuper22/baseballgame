import { api, isLoggedIn, isAdmin } from '../api.js';
import { navigate } from '../router.js';
import { showToast } from '../components/toast.js';

export async function tournamentPage(app, params) {
  if (!isLoggedIn()) { navigate('/login'); return; }

  const tournamentId = params.id;

  app.innerHTML = `
    <div class="container">
      <div class="dashboard-header">
        <h1>&#127942; Tournament</h1>
        <a href="#/schedule" class="btn btn-sm">&larr; Schedule</a>
      </div>
      <div id="tournament-header"></div>
      <div id="tournament-standings"></div>
      <div id="tournament-schedule"></div>
    </div>`;

  try {
    const res = await api(`/tournaments/${tournamentId}`);
    const t = res.tournament;
    const standings = res.standings || [];
    const games = res.games || [];

    // Header
    const headerEl = document.getElementById('tournament-header');
    if (headerEl) {
      const statusBadge = { draft: 'badge-mod', active: 'badge-active', completed: 'badge-inactive' }[t.status] || '';
      headerEl.innerHTML = `
        <div class="tournament-info">
          <h2>${t.name}</h2>
          <span class="badge ${statusBadge}">${t.status}</span>
          <span class="series-dates">${t.start_date} - ${t.end_date}</span>
          <span class="badge">${t.format.replace('_', ' ')}</span>
          <span class="badge">${games.length} games</span>
        </div>
        ${isAdmin() && t.status !== 'completed' ? `
          <div class="tournament-admin-controls" style="margin-top:1rem">
            ${t.status === 'draft' ? `<button class="btn btn-sm btn-primary" id="activate-tournament">Activate Tournament</button>` : ''}
            ${t.status === 'active' ? `<button class="btn btn-sm btn-danger" id="complete-tournament">Complete Tournament</button>` : ''}
          </div>` : ''}`;

      document.getElementById('activate-tournament')?.addEventListener('click', async () => {
        try {
          await api(`/tournaments/${tournamentId}`, { method: 'PUT', body: JSON.stringify({ status: 'active' }) });
          showToast('Tournament activated!', 'success');
          tournamentPage(app, params);
        } catch (e) { showToast(e.message, 'error'); }
      });

      document.getElementById('complete-tournament')?.addEventListener('click', async () => {
        if (!confirm('Complete this tournament? All remaining games will be finalized.')) return;
        try {
          await api(`/tournaments/${tournamentId}`, { method: 'PUT', body: JSON.stringify({ status: 'completed' }) });
          showToast('Tournament completed!', 'success');
          tournamentPage(app, params);
        } catch (e) { showToast(e.message, 'error'); }
      });
    }

    // Standings
    const standingsEl = document.getElementById('tournament-standings');
    if (standingsEl && standings.length) {
      standingsEl.innerHTML = `
        <h2>Standings</h2>
        <div class="table-wrapper">
          <table class="stats-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Team</th>
                <th>W</th>
                <th>L</th>
                <th>T</th>
                <th>GP</th>
                <th>RF</th>
                <th>RA</th>
                <th>DIFF</th>
              </tr>
            </thead>
            <tbody>
              ${standings.map((s, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td><a href="#/team/${s.team_id}" class="table-link">${s.team_name}</a></td>
                  <td>${s.wins}</td>
                  <td>${s.losses}</td>
                  <td>${s.ties}</td>
                  <td>${s.games_played}</td>
                  <td>${s.runs_for}</td>
                  <td>${s.runs_against}</td>
                  <td class="${s.runs_for - s.runs_against > 0 ? 'positive' : s.runs_for - s.runs_against < 0 ? 'negative' : ''}">${s.runs_for - s.runs_against > 0 ? '+' : ''}${s.runs_for - s.runs_against}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>`;
    }

    // Schedule by round
    const scheduleEl = document.getElementById('tournament-schedule');
    if (scheduleEl && games.length) {
      const byRound = {};
      for (const g of games) {
        const round = g.round || 0;
        if (!byRound[round]) byRound[round] = [];
        byRound[round].push(g);
      }

      scheduleEl.innerHTML = `
        <h2>Schedule</h2>
        ${Object.entries(byRound).map(([round, roundGames]) => `
          <div class="schedule-day">
            <h3 class="schedule-date">Round ${round} <span class="date-sub">${roundGames[0]?.scheduled_date || ''}</span></h3>
            <div class="schedule-games">
              ${roundGames.map(g => `
                <div class="game-card ${g.status === 'completed' ? 'completed' : ''}" data-id="${g.id}" style="cursor:pointer">
                  <div class="game-matchup">
                    <div class="game-team ${g.winner_team_id === g.home_team_id ? 'winner' : ''}">
                      <span class="team-name">${g.home_team_name}</span>
                      <span class="team-score">${g.status !== 'scheduled' ? g.home_runs : '-'}</span>
                    </div>
                    <span class="game-vs">vs</span>
                    <div class="game-team ${g.winner_team_id === g.away_team_id ? 'winner' : ''}">
                      <span class="team-name">${g.away_team_name}</span>
                      <span class="team-score">${g.status !== 'scheduled' ? g.away_runs : '-'}</span>
                    </div>
                  </div>
                  <span class="game-badge game-status-${g.status}">${g.status}</span>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}`;

      scheduleEl.querySelectorAll('.game-card').forEach(card => {
        card.addEventListener('click', () => navigate(`/game/${card.dataset.id}`));
      });
    }
  } catch (e) {
    showToast(e.message, 'error');
    app.innerHTML += `<p class="error">${e.message}</p>`;
  }
}
