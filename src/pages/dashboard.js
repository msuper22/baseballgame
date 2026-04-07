import { api, isLoggedIn, getUser } from '../api.js';
import { navigate } from '../router.js';
import { renderDiamond } from '../components/diamond.js';
import { showToast } from '../components/toast.js';

let refreshInterval = null;
let lastKnownRuns = {};

export async function dashboardPage(app) {
  if (!isLoggedIn()) { navigate('/login'); return; }

  app.innerHTML = `
    <div class="container">
      <div class="dashboard-header">
        <h1>&#9918; Scoreboard</h1>
        <div style="display:flex;align-items:center;gap:0.75rem">
          <div id="series-info" class="series-info"></div>
          <button id="refresh-btn" class="btn btn-sm" title="Refresh">&#8635;</button>
          <span id="auto-refresh-indicator" class="auto-refresh-dot" title="Auto-refreshing every 30s"></span>
        </div>
      </div>
      <div id="diamonds-grid" class="diamonds-grid">
        <div class="loading">Loading game state...</div>
      </div>
      <div class="dashboard-widgets">
        <div id="whos-hot" class="widget"></div>
        <div id="highlights" class="widget"></div>
      </div>
      <div id="recent-plays" class="recent-plays"></div>
    </div>`;

  // Load initial data
  await loadDashboard();

  // Set up auto-refresh
  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = setInterval(loadDashboard, 30000);

  document.getElementById('refresh-btn')?.addEventListener('click', () => {
    loadDashboard();
    showToast('Refreshed!', 'info');
  });

  // Return cleanup function
  return () => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
  };
}

async function loadDashboard() {
  try {
    // Load series info
    try {
      const seriesRes = await api('/series/active');
      const s = seriesRes.series;
      const infoEl = document.getElementById('series-info');
      if (infoEl) {
        infoEl.innerHTML = `<span class="series-name">${s.name}</span> <span class="series-dates">${s.start_date} - ${s.end_date}</span>`;
      }
    } catch {
      const infoEl = document.getElementById('series-info');
      if (infoEl) infoEl.innerHTML = '<span class="warn">No active series.</span>';
    }

    // Load game states
    const statesRes = await api('/stats/game-states');
    const grid = document.getElementById('diamonds-grid');
    if (!grid) return;

    if (!statesRes.game_states?.length) {
      grid.innerHTML = '<p class="empty-state">No teams in the current series yet.</p>';
      return;
    }

    // Check for new runs and notify
    const user = getUser();
    for (const state of statesRes.game_states) {
      const key = state.team_id;
      if (lastKnownRuns[key] !== undefined && state.total_runs > lastKnownRuns[key]) {
        const diff = state.total_runs - lastKnownRuns[key];
        if (state.team_id === user?.team_id) {
          showToast(`Your team scored ${diff} run${diff > 1 ? 's' : ''}! (${state.team_name})`, 'success');
        } else {
          showToast(`${state.team_name} scored ${diff} run${diff > 1 ? 's' : ''}!`, 'info');
        }
      }
      lastKnownRuns[key] = state.total_runs;
    }

    grid.innerHTML = '';
    for (const state of statesRes.game_states) {
      const div = document.createElement('div');
      div.className = 'diamond-wrapper';
      div.addEventListener('click', () => navigate(`/team/${state.team_id}`));
      grid.appendChild(div);
      renderDiamond(div, state);
    }

    // Load who's hot + highlights + recent plays in parallel
    await Promise.all([loadWhosHot(), loadHighlights(), loadRecentPlays()]);
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function loadWhosHot() {
  try {
    const res = await api('/stats/whos-hot');
    const el = document.getElementById('whos-hot');
    if (!el || !res.players?.length) { if (el) el.innerHTML = ''; return; }

    el.innerHTML = `
      <div class="widget-card">
        <h3>&#128293; Who's Hot</h3>
        <div class="hot-list">
          ${res.players.slice(0, 3).map((p, i) => `
            <div class="hot-item">
              <span class="hot-rank">${i + 1}</span>
              <a href="#/player/${p.id}" class="table-link hot-name">${p.display_name}</a>
              <span class="hot-team">${p.team_name}</span>
              <span class="hot-stats">${p.recent_bases} TB &middot; ${p.recent_rbi} RBI</span>
            </div>
          `).join('')}
        </div>
        <span class="widget-subtitle">Last 48 hours</span>
      </div>`;
  } catch { /* silent */ }
}

async function loadHighlights() {
  try {
    const res = await api('/stats/highlights');
    const el = document.getElementById('highlights');
    if (!el || !res.highlights?.length) { if (el) el.innerHTML = ''; return; }

    el.innerHTML = `
      <div class="widget-card">
        <h3>&#127775; Big Plays</h3>
        <div class="highlight-list">
          ${res.highlights.slice(0, 5).map(h => `
            <div class="highlight-item">
              <span class="play-type play-${h.hit_type}">${formatHitType(h.hit_type)}</span>
              <a href="#/player/${h.player_id}" class="table-link">${h.player_name}</a>
              <span class="highlight-runs">+${h.runs_scored}R</span>
              <span class="play-time">${timeAgo(h.created_at)}</span>
            </div>
          `).join('')}
        </div>
      </div>`;
  } catch { /* silent */ }
}

async function loadRecentPlays() {
  try {
    const playsRes = await api('/at-bats?limit=10');
    const recentDiv = document.getElementById('recent-plays');
    if (!recentDiv) return;
    if (playsRes.at_bats?.length) {
      recentDiv.innerHTML = `
        <h2>Recent Plays</h2>
        <div class="plays-list">
          ${playsRes.at_bats.slice(0, 10).map(ab => `
            <div class="play-item">
              <span class="play-type play-${ab.hit_type}">${formatHitType(ab.hit_type)}</span>
              <a href="#/player/${ab.player_id}" class="play-player table-link">${ab.player_name}</a>
              <span class="play-team">${ab.team_name}</span>
              ${ab.description ? `<span class="play-lead">ID: ${ab.description}</span>` : ''}
              ${ab.runs_scored > 0 ? `<span class="play-runs">+${ab.runs_scored} run${ab.runs_scored > 1 ? 's' : ''}</span>` : ''}
              <span class="play-time">${timeAgo(ab.created_at)}</span>
            </div>
          `).join('')}
        </div>`;
    }
  } catch { /* silent */ }
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
