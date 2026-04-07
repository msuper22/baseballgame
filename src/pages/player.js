import { api, isLoggedIn } from '../api.js';
import { navigate } from '../router.js';
import { renderStatsTable } from '../components/stats-table.js';
import { showToast } from '../components/toast.js';

export async function playerPage(app, params) {
  if (!isLoggedIn()) { navigate('/login'); return; }

  const playerId = params.id;

  app.innerHTML = `
    <div class="container">
      <a href="#/leaderboard" class="back-link">&larr; Leaderboard</a>
      <div id="player-header" class="player-header loading">Loading player...</div>
      <div id="player-career" class="section"></div>
      <div id="player-series" class="section"></div>
      <div id="player-log" class="section"></div>
    </div>`;

  try {
    const res = await api(`/stats/player/${playerId}`);
    const { player, career, series_stats } = res;

    const hits = (career.singles || 0) + (career.doubles || 0) + (career.triples || 0) + (career.home_runs || 0);
    const avg = career.total_at_bats ? (hits / career.total_at_bats).toFixed(3) : '.000';
    const slg = career.total_at_bats ? (career.total_bases / career.total_at_bats).toFixed(3) : '.000';
    const tbPerAb = career.total_at_bats ? (career.total_bases / career.total_at_bats).toFixed(2) : '0.00';

    // Player info header
    document.getElementById('player-header').innerHTML = `
      <div class="player-info-card">
        <div class="player-avatar">${getInitials(player.display_name)}</div>
        <div class="player-info-details">
          <h1>${player.display_name}</h1>
          <div class="player-meta">
            ${player.team_name ? `<span class="badge badge-active">${player.team_name}</span>` : ''}
            <span class="badge badge-${player.role}">${player.role}</span>
            <span class="player-since">Since ${formatDate(player.created_at)}</span>
          </div>
        </div>
      </div>
      <div class="player-career-stats">
        <div class="player-stat-box">
          <span class="player-stat-value">${career.total_at_bats || 0}</span>
          <span class="player-stat-label">AB</span>
        </div>
        <div class="player-stat-box">
          <span class="player-stat-value">${career.total_bases || 0}</span>
          <span class="player-stat-label">TB</span>
        </div>
        <div class="player-stat-box">
          <span class="player-stat-value">${career.runs_batted_in || 0}</span>
          <span class="player-stat-label">RBI</span>
        </div>
        <div class="player-stat-box">
          <span class="player-stat-value">${career.singles || 0}</span>
          <span class="player-stat-label">1B</span>
        </div>
        <div class="player-stat-box">
          <span class="player-stat-value">${career.doubles || 0}</span>
          <span class="player-stat-label">2B</span>
        </div>
        <div class="player-stat-box">
          <span class="player-stat-value">${career.triples || 0}</span>
          <span class="player-stat-label">3B</span>
        </div>
        <div class="player-stat-box">
          <span class="player-stat-value">${career.home_runs || 0}</span>
          <span class="player-stat-label">HR</span>
        </div>
        <div class="player-stat-box player-stat-highlight">
          <span class="player-stat-value">${avg}</span>
          <span class="player-stat-label">AVG</span>
        </div>
        <div class="player-stat-box player-stat-highlight">
          <span class="player-stat-value">${slg}</span>
          <span class="player-stat-label">SLG</span>
        </div>
      </div>
    `;
    document.getElementById('player-header').className = 'player-header';

    // Per-series breakdown
    const seriesDiv = document.getElementById('player-series');
    if (series_stats.length) {
      seriesDiv.innerHTML = '<h2>Series Breakdown</h2><div id="series-stats-table"></div>';
      renderStatsTable(
        document.getElementById('series-stats-table'),
        series_stats.map(s => ({
          ...s,
          series_label: s.series_name + (s.is_active ? ' *' : ''),
          dates: s.start_date + ' - ' + s.end_date,
          avg: s.total_at_bats ? (((s.singles||0) + (s.doubles||0) + (s.triples||0) + (s.home_runs||0)) / s.total_at_bats).toFixed(3) : '.000',
          slg: s.total_at_bats ? (s.total_bases / s.total_at_bats).toFixed(3) : '.000',
        })),
        [
          { key: 'series_label', label: 'Series', sortable: true },
          { key: 'total_at_bats', label: 'AB', sortable: true },
          { key: 'total_bases', label: 'TB', sortable: true },
          { key: 'runs_batted_in', label: 'RBI', sortable: true },
          { key: 'singles', label: '1B', sortable: true },
          { key: 'doubles', label: '2B', sortable: true },
          { key: 'triples', label: '3B', sortable: true },
          { key: 'home_runs', label: 'HR', sortable: true },
          { key: 'avg', label: 'AVG', sortable: true },
          { key: 'slg', label: 'SLG', sortable: true },
        ],
        'total_bases'
      );
    } else {
      seriesDiv.innerHTML = '<h2>Series Breakdown</h2><p class="empty-state">No series data yet.</p>';
    }

    // Recent event log for this player
    const logRes = await api(`/at-bats?player_id=${playerId}`);
    const logDiv = document.getElementById('player-log');
    if (logRes.at_bats?.length) {
      logDiv.innerHTML = `
        <h2>Recent Events</h2>
        <div class="event-log">
          ${logRes.at_bats.map(ab => `
            <div class="log-entry">
              <span class="log-type log-${ab.hit_type}">${formatHit(ab.hit_type)}</span>
              <span class="log-player">${ab.team_name}</span>
              ${ab.description ? `<span class="log-lead">ID: ${ab.description}</span>` : ''}
              ${ab.runs_scored > 0 ? `<span class="log-runs">+${ab.runs_scored}R</span>` : ''}
              <span class="log-time">${new Date(ab.created_at + 'Z').toLocaleString()}</span>
            </div>
          `).join('')}
        </div>`;
    } else {
      logDiv.innerHTML = '<h2>Recent Events</h2><p class="empty-state">No events logged yet.</p>';
    }

  } catch (e) {
    showToast(e.message, 'error');
    document.getElementById('player-header').innerHTML = `<p class="error">${e.message}</p>`;
  }
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatHit(type) {
  const map = { single: '1B', double: '2B', triple: '3B', home_run: 'HR' };
  return map[type] || type;
}

function formatDate(dateStr) {
  try {
    const d = new Date(dateStr + 'Z');
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  } catch { return dateStr; }
}
