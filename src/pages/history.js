import { api, isLoggedIn, isAdmin } from '../api.js';
import { navigate } from '../router.js';
import { showToast } from '../components/toast.js';

export async function historyPage(app) {
  if (!isLoggedIn()) { navigate('/login'); return; }

  app.innerHTML = `
    <div class="container">
      <h1>&#128218; Series History</h1>
      <div id="series-list" class="loading">Loading series...</div>
    </div>`;

  try {
    const res = await api('/series');
    const list = document.getElementById('series-list');

    if (!res.series?.length) {
      list.innerHTML = '<p class="empty-state">No series have been played yet.</p>';
      return;
    }

    // Get team leaderboard for each series to show winner
    const seriesCards = [];
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
            </div>
          `).join('');
        }
      } catch {}

      const admin = isAdmin();
      seriesCards.push(`
        <div class="history-card" data-id="${s.id}">
          <div class="history-card-header">
            <div>
              <h3 class="history-card-title">${s.name}</h3>
              <span class="history-card-dates">${s.start_date} &mdash; ${s.end_date}</span>
            </div>
            <div class="history-card-actions">
              <span class="badge ${s.is_active ? 'badge-active' : 'badge-inactive'}">${s.is_active ? 'Active' : 'Completed'}</span>
              ${admin ? `<button class="btn btn-sm btn-danger delete-series-btn" data-id="${s.id}" data-name="${s.name}">Delete</button>` : ''}
            </div>
          </div>
          <div class="history-card-teams">${teamsHtml || '<p class="empty-state" style="padding:0.5rem">No stats recorded</p>'}</div>
          <div class="history-card-footer">
            <button class="btn btn-sm btn-primary view-series-btn" data-id="${s.id}">View Full Details</button>
          </div>
        </div>
      `);
    }

    list.innerHTML = `<div class="history-list">${seriesCards.join('')}</div>`;
    list.className = '';

    // View detail buttons
    list.querySelectorAll('.view-series-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        navigate(`/series/${btn.dataset.id}`);
      });
    });

    // Delete buttons (admin)
    list.querySelectorAll('.delete-series-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm(`Delete "${btn.dataset.name}" and all its data? This cannot be undone.`)) return;
        try {
          await api(`/series/${btn.dataset.id}`, { method: 'DELETE' });
          showToast('Series deleted', 'success');
          historyPage(app); // reload
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });

    // Click card to view
    list.querySelectorAll('.history-card').forEach(card => {
      card.addEventListener('click', () => {
        navigate(`/series/${card.dataset.id}`);
      });
    });

  } catch (e) {
    document.getElementById('series-list').innerHTML = `<p class="error">${e.message}</p>`;
  }
}
