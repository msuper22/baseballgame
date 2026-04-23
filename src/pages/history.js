import { api, isLoggedIn, isAdmin } from '../api.js';
import { navigate } from '../router.js';
import { showToast } from '../components/toast.js';

export async function historyPage(app) {
  if (!isLoggedIn()) { navigate('/login'); return; }

  app.innerHTML = `
    <div class="container">
      <h1>&#128218; History</h1>
      <div class="tab-bar">
        <button class="tab tab-active" data-tab="games">Games</button>
        <button class="tab" data-tab="series">Series</button>
      </div>
      <div id="history-body"><div class="loading">Loading...</div></div>
    </div>`;

  const body = document.getElementById('history-body');
  const tabs = app.querySelectorAll('.tab');
  tabs.forEach(t => t.addEventListener('click', () => {
    tabs.forEach(x => x.classList.toggle('tab-active', x === t));
    if (t.dataset.tab === 'games') renderGames(body);
    else renderSeries(body);
  }));

  renderGames(body);
}

async function renderGames(container) {
  container.innerHTML = '<div class="loading">Loading games...</div>';
  try {
    const res = await api('/games?status=completed');
    const games = (res.games || []).sort((a, b) =>
      (b.scheduled_date + (b.scheduled_time || '')).localeCompare(a.scheduled_date + (a.scheduled_time || ''))
    );

    if (!games.length) {
      container.innerHTML = '<p class="empty-state">No completed games yet.</p>';
      return;
    }

    const byDate = {};
    for (const g of games) {
      const d = g.scheduled_date || 'Unscheduled';
      byDate[d] = byDate[d] || [];
      byDate[d].push(g);
    }

    const dateKeys = Object.keys(byDate).sort((a, b) => b.localeCompare(a));
    container.innerHTML = dateKeys.map(d => `
      <section class="history-date-group">
        <h3 class="history-date-header">${d}</h3>
        <div class="history-games-grid">
          ${byDate[d].map(g => {
            const home = g.home_runs ?? g.home_score ?? 0;
            const away = g.away_runs ?? g.away_score ?? 0;
            const winner = g.winner_team_id
              ? (g.winner_team_id === g.home_team_id ? g.home_team_name : g.away_team_name)
              : 'Tie';
            const source = g.tournament_name
              ? `${g.tournament_name}${g.round ? ` · Rd ${g.round}` : ''}`
              : (g.series_name || 'Game');
            return `
              <a href="#/game/${g.id}" class="history-game-card">
                <div class="history-game-source">${source}</div>
                <div class="history-game-score">
                  <div class="history-game-team ${g.winner_team_id === g.home_team_id ? 'winner' : ''}">
                    <span class="history-game-team-name">${g.home_team_name}</span>
                    <span class="history-game-team-runs">${home}</span>
                  </div>
                  <div class="history-game-team ${g.winner_team_id === g.away_team_id ? 'winner' : ''}">
                    <span class="history-game-team-name">${g.away_team_name}</span>
                    <span class="history-game-team-runs">${away}</span>
                  </div>
                </div>
                <div class="history-game-winner">${g.winner_team_id ? `${winner} wins` : 'Tied'}</div>
              </a>`;
          }).join('')}
        </div>
      </section>
    `).join('');
  } catch (e) {
    container.innerHTML = `<p class="error">${e.message}</p>`;
  }
}

async function renderSeries(container) {
  container.innerHTML = '<div class="loading">Loading series...</div>';
  try {
    const res = await api('/series');
    if (!res.series?.length) {
      container.innerHTML = '<p class="empty-state">No series have been played yet.</p>';
      return;
    }

    const admin = isAdmin();
    const cards = [];
    for (const s of res.series) {
      let teamsHtml = '';
      try {
        const teamsRes = await api(`/stats/leaderboard/teams?series_id=${s.id}`);
        if (teamsRes.teams?.length) {
          teamsHtml = teamsRes.teams.map((t, i) => `
            <div class="history-team-row ${i === 0 ? 'history-team-leader' : ''}">
              <span class="history-rank">${i + 1}</span>
              <span class="history-team-name">${t.name}</span>
              <span class="history-team-stat">${t.total_runs} R</span>
              <span class="history-team-stat">${t.total_bases} TB</span>
              <span class="history-team-stat">${t.total_at_bats} AB</span>
            </div>`).join('');
        }
      } catch {}

      cards.push(`
        <div class="history-card" data-id="${s.id}">
          <div class="history-card-header">
            <div>
              <h3 class="history-card-title">${s.name}</h3>
              <span class="history-card-dates">${s.start_date} &mdash; ${s.end_date}</span>
            </div>
            <div class="history-card-actions">
              <span class="badge ${s.is_active ? 'badge-active' : 'badge-inactive'}">${s.is_active ? 'Active' : 'Completed'}</span>
              ${admin ? `<button class="btn btn-sm btn-danger delete-series-btn" data-id="${s.id}" data-name="${s.name}">Archive</button>` : ''}
            </div>
          </div>
          <div class="history-card-teams">${teamsHtml || '<p class="empty-state" style="padding:0.5rem">No stats recorded</p>'}</div>
          <div class="history-card-footer">
            <button class="btn btn-sm btn-primary view-series-btn" data-id="${s.id}">View Full Details</button>
          </div>
        </div>`);
    }

    container.innerHTML = `<div class="history-list">${cards.join('')}</div>`;
    container.querySelectorAll('.view-series-btn').forEach(btn =>
      btn.addEventListener('click', (e) => { e.stopPropagation(); navigate(`/series/${btn.dataset.id}`); }));
    container.querySelectorAll('.delete-series-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm(`Archive "${btn.dataset.name}"? Games stay accessible; series will be hidden from the active list.`)) return;
        try {
          await api(`/series/${btn.dataset.id}`, { method: 'DELETE' });
          showToast('Series archived', 'success');
          renderSeries(container);
        } catch (err) { showToast(err.message, 'error'); }
      });
    });
    container.querySelectorAll('.history-card').forEach(card =>
      card.addEventListener('click', () => navigate(`/series/${card.dataset.id}`)));
  } catch (e) {
    container.innerHTML = `<p class="error">${e.message}</p>`;
  }
}
