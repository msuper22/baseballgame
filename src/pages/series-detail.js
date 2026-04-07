import { api, isLoggedIn } from '../api.js';
import { navigate } from '../router.js';
import { renderDiamond } from '../components/diamond.js';
import { renderStatsTable } from '../components/stats-table.js';
import { showToast } from '../components/toast.js';

export async function seriesDetailPage(app, params) {
  if (!isLoggedIn()) { navigate('/login'); return; }

  const seriesId = params.id;

  app.innerHTML = `
    <div class="container">
      <a href="#/history" class="back-link">&larr; Back to History</a>
      <div id="series-header" class="dashboard-header">
        <div class="loading">Loading...</div>
      </div>
      <div id="series-diamonds" class="diamonds-grid"></div>
      <div class="tabs" style="margin-top:2rem">
        <button class="tab active" data-tab="teams">Team Standings</button>
        <button class="tab" data-tab="players">Player Stats</button>
        <button class="tab" data-tab="plays">Play-by-Play</button>
      </div>
      <div id="series-tab-content"></div>
    </div>`;

  try {
    // Load series info
    const seriesRes = await api('/series');
    const series = seriesRes.series.find(s => String(s.id) === String(seriesId));
    if (!series) {
      app.innerHTML = '<div class="container"><h1>Series Not Found</h1></div>';
      return;
    }

    document.getElementById('series-header').innerHTML = `
      <div>
        <h1>${series.name}</h1>
        <div class="series-info">
          <span class="series-dates">${series.start_date} &mdash; ${series.end_date}</span>
          <span class="badge ${series.is_active ? 'badge-active' : 'badge-inactive'}" style="margin-left:0.5rem">
            ${series.is_active ? 'Active' : 'Completed'}
          </span>
        </div>
      </div>`;

    // Load diamonds for this series
    const statesRes = await api(`/stats/game-states?series_id=${seriesId}`);
    const grid = document.getElementById('series-diamonds');

    if (statesRes.game_states?.length) {
      grid.innerHTML = '';
      for (const state of statesRes.game_states) {
        const div = document.createElement('div');
        div.className = 'diamond-wrapper';
        div.addEventListener('click', () => navigate(`/team/${state.team_id}`));
        grid.appendChild(div);
        renderDiamond(div, state);
      }
    } else {
      grid.innerHTML = '<p class="empty-state">No game data for this series.</p>';
    }

    // Tabs
    const tabs = app.querySelectorAll('.tabs .tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        loadSeriesTab(tab.dataset.tab, seriesId);
      });
    });

    loadSeriesTab('teams', seriesId);

  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function loadSeriesTab(tabName, seriesId) {
  const content = document.getElementById('series-tab-content');
  content.innerHTML = '<div class="loading">Loading...</div>';

  try {
    if (tabName === 'teams') {
      const res = await api(`/stats/leaderboard/teams?series_id=${seriesId}`);
      content.innerHTML = '<div id="series-team-table"></div>';
      renderStatsTable(
        document.getElementById('series-team-table'),
        res.teams,
        [
          { key: 'name', label: 'Team', sortable: true },
          { key: 'total_runs', label: 'Runs', sortable: true },
          { key: 'total_bases', label: 'TB', sortable: true },
          { key: 'total_at_bats', label: 'AB', sortable: true },
          { key: 'singles', label: '1B', sortable: true },
          { key: 'doubles', label: '2B', sortable: true },
          { key: 'triples', label: '3B', sortable: true },
          { key: 'home_runs', label: 'HR', sortable: true },
        ],
        'total_runs'
      );
    } else if (tabName === 'players') {
      const res = await api(`/stats/leaderboard/players?series_id=${seriesId}`);
      content.innerHTML = '<div id="series-player-table"></div>';
      renderStatsTable(
        document.getElementById('series-player-table'),
        res.players,
        [
          { key: 'display_name', label: 'Player', sortable: true },
          { key: 'team_name', label: 'Team', sortable: true },
          { key: 'total_at_bats', label: 'AB', sortable: true },
          { key: 'total_bases', label: 'TB', sortable: true },
          { key: 'runs_batted_in', label: 'RBI', sortable: true },
          { key: 'singles', label: '1B', sortable: true },
          { key: 'doubles', label: '2B', sortable: true },
          { key: 'triples', label: '3B', sortable: true },
          { key: 'home_runs', label: 'HR', sortable: true },
        ],
        'total_bases'
      );
    } else if (tabName === 'plays') {
      const res = await api(`/at-bats?series_id=${seriesId}`);
      if (!res.at_bats?.length) {
        content.innerHTML = '<p class="empty-state">No plays recorded for this series.</p>';
        return;
      }
      content.innerHTML = `
        <div class="plays-list">
          ${res.at_bats.map(ab => `
            <div class="play-item">
              <span class="play-type play-${ab.hit_type}">${formatHitType(ab.hit_type)}</span>
              <span class="play-player">${ab.player_name}</span>
              <span class="play-team">${ab.team_name}</span>
              ${ab.runs_scored > 0 ? `<span class="play-runs">+${ab.runs_scored} run${ab.runs_scored > 1 ? 's' : ''}</span>` : ''}
              <span class="play-time">${formatDate(ab.created_at)}</span>
            </div>
          `).join('')}
        </div>`;
    }
  } catch (e) {
    content.innerHTML = `<p class="error">${e.message}</p>`;
  }
}

function formatHitType(type) {
  const map = { single: '1B', double: '2B', triple: '3B', home_run: 'HR' };
  return map[type] || type;
}

function formatDate(dateStr) {
  try {
    const d = new Date(dateStr + 'Z');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch {
    return dateStr;
  }
}
