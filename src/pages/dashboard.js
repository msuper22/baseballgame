import { api, isLoggedIn, getUser, isAdmin, isMod, isSpectator } from '../api.js';
import { navigate } from '../router.js';
import { renderDiamond } from '../components/diamond.js';
import { showToast } from '../components/toast.js';
import { startPolling } from '../lib/live-poll.js';

let pollHandle = null;
let lastKnownRuns = {};
let activeSeriesId = null;
let lastSeenHalfKey = null;

export async function dashboardPage(app) {
  if (!isLoggedIn()) { navigate('/login'); return; }

  const user = getUser();

  // Spectators don't have a dashboard — they live on /spectator
  if (isSpectator()) {
    navigate('/spectator');
    return;
  }

  // Players see only their team's current game (or a waiting card)
  if (!isAdmin() && !isMod() && user?.team_id) {
    return renderPlayerDashboard(app, user);
  }

  // Admin/Mod see the full league view
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
        <div id="todays-games" class="widget"></div>
        <div id="whos-hot" class="widget"></div>
        <div id="highlights" class="widget"></div>
      </div>
      <div id="recent-plays" class="recent-plays"></div>
    </div>`;

  // Load initial data
  await loadDashboard();

  // Set up auto-refresh
  if (pollHandle) pollHandle.stop();
  pollHandle = startPolling(loadDashboard, 8000);

  document.getElementById('refresh-btn')?.addEventListener('click', () => {
    loadDashboard();
    showToast('Refreshed!', 'info');
  });

  return () => {
    if (pollHandle) { pollHandle.stop(); pollHandle = null; }
  };
}

async function renderPlayerDashboard(app, user) {
  app.innerHTML = `
    <div class="container">
      <div class="dashboard-header">
        <h1>&#9918; My Game</h1>
        <div id="series-info" class="series-info"></div>
      </div>
      <div id="my-game-slot"><div class="loading">Finding your game...</div></div>
    </div>`;

  const load = () => loadPlayerDashboard(user);
  await load();

  if (pollHandle) pollHandle.stop();
  pollHandle = startPolling(load, 8000);

  return () => {
    if (pollHandle) { pollHandle.stop(); pollHandle = null; }
    lastSeenHalfKey = null;
  };
}

async function loadPlayerDashboard(user) {
  try {
    const [seriesRes, gamesRes] = await Promise.all([
      api('/series/active').catch(() => null),
      api(`/games/schedule?team_id=${user.team_id}`),
    ]);

    const infoEl = document.getElementById('series-info');
    if (infoEl && seriesRes?.series) {
      const s = seriesRes.series;
      infoEl.innerHTML = `<span class="series-name">${s.name}</span> <span class="series-dates">${s.start_date} - ${s.end_date}</span>`;
    }

    const games = gamesRes.games || [];
    const active = games.find(g => g.status === 'active' || g.status === 'extra_innings');

    // Team-is-up nudge: when the active half's batting team is yours and we
    // haven't toasted for this half yet, fire a one-shot.
    if (active) {
      const halfKey = `${active.id}-${active.current_inning}-${active.current_half}`;
      const battingTeamId = active.current_half === 'top' ? active.away_team_id : active.home_team_id;
      const fieldingTeamId = active.current_half === 'top' ? active.home_team_id : active.away_team_id;
      if (lastSeenHalfKey !== halfKey) {
        if (battingTeamId === user.team_id) {
          showToast(`Your team is up! ${active.current_half === 'top' ? 'Top' : 'Bottom'} of ${active.current_inning}`, 'success');
        } else if (fieldingTeamId === user.team_id) {
          showToast(`You're on defense — ${active.current_half === 'top' ? 'Top' : 'Bottom'} of ${active.current_inning}`, 'info');
        }
        lastSeenHalfKey = halfKey;
      }
      navigate(`/game/${active.id}`);
      return;
    }

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
    const upcoming = games
      .filter(g => g.status === 'scheduled' && g.scheduled_date >= today)
      .sort((a, b) => (a.scheduled_date + (a.scheduled_time || '')).localeCompare(b.scheduled_date + (b.scheduled_time || '')));
    const next = upcoming[0];

    const recentCompleted = games
      .filter(g => g.status === 'completed')
      .sort((a, b) => (b.scheduled_date || '').localeCompare(a.scheduled_date || ''))
      .slice(0, 3);

    const slot = document.getElementById('my-game-slot');
    if (!slot) return;

    slot.innerHTML = `
      ${next ? `
        <div class="next-game-card">
          <h2>Your Next Game</h2>
          <div class="next-game-matchup">
            <strong>${next.home_team_name}</strong> <span class="game-vs">vs</span> <strong>${next.away_team_name}</strong>
          </div>
          <div class="next-game-when">
            ${next.scheduled_date}${next.scheduled_time ? ' at ' + next.scheduled_time : ''}
            ${next.tournament_name ? ' · ' + next.tournament_name + (next.round ? ' Rd ' + next.round : '') : ''}
          </div>
          <a href="#/game/${next.id}" class="btn btn-primary">Open Game</a>
        </div>`
      : `
        <div class="next-game-card">
          <h2>No Game Scheduled</h2>
          <p class="empty-state">You don't have an active or upcoming game right now. Check back when your next one is posted.</p>
          <div style="display:flex;gap:0.5rem;margin-top:1rem">
            <a href="#/team/${user.team_id}" class="btn btn-sm">My Team</a>
            <a href="#/schedule" class="btn btn-sm">Full Schedule</a>
          </div>
        </div>`}
      ${recentCompleted.length ? `
        <div class="recent-results">
          <h2>Recent Results</h2>
          <div class="schedule-games">
            ${recentCompleted.map(g => {
              const won = g.winner_team_id === user.team_id;
              const tied = !g.winner_team_id;
              const resultClass = won ? 'badge-active' : tied ? '' : 'badge-inactive';
              const resultLabel = won ? 'W' : tied ? 'T' : 'L';
              return `
                <a href="#/game/${g.id}" class="game-card">
                  <div class="game-card-header">
                    <span class="game-badge ${resultClass}">${resultLabel}</span>
                    <span class="game-tournament">${g.tournament_name || 'Challenge'}</span>
                    <span class="game-time">${g.scheduled_date}</span>
                  </div>
                  <div class="game-matchup">
                    <div class="game-team"><span class="team-name">${g.home_team_name}</span><span class="team-score">${g.home_runs}</span></div>
                    <span class="game-vs">vs</span>
                    <div class="game-team"><span class="team-name">${g.away_team_name}</span><span class="team-score">${g.away_runs}</span></div>
                  </div>
                </a>`;
            }).join('')}
          </div>
        </div>`
      : ''}`;
  } catch (e) {
    const slot = document.getElementById('my-game-slot');
    if (slot) slot.innerHTML = `<p class="error">${e.message}</p>`;
  }
}

async function loadDashboard() {
  try {
    // Load series info
    try {
      const seriesRes = await api('/series/active');
      const s = seriesRes.series;
      activeSeriesId = s.id;
      const infoEl = document.getElementById('series-info');
      if (infoEl) {
        infoEl.innerHTML = `<span class="series-name">${s.name}</span> <span class="series-dates">${s.start_date} - ${s.end_date}</span>`;
      }
    } catch {
      activeSeriesId = null;
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

    // Load widgets in parallel
    await Promise.all([loadTodaysGames(), loadWhosHot(), loadHighlights(), loadRecentPlays()]);
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function loadTodaysGames() {
  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
    const res = await api(`/games?date=${today}`);
    const el = document.getElementById('todays-games');
    if (!el) return;

    const games = res.games || [];
    if (!games.length) { el.innerHTML = ''; return; }

    el.innerHTML = `
      <div class="widget-card">
        <h3>&#127918; Today's Games</h3>
        <div class="todays-games-list">
          ${games.map(g => {
            const statusLabel = { scheduled: 'Upcoming', active: 'LIVE', completed: 'FINAL', extra_innings: 'EXTRA' }[g.status] || g.status;
            const rowClass = g.status === 'completed' ? 'today-game-item game-done' : 'today-game-item';
            const homeWon = g.winner_team_id === g.home_team_id;
            const awayWon = g.winner_team_id === g.away_team_id;
            const teams = g.status === 'completed'
              ? `<span class="today-teams"><span class="${homeWon ? 'winner-team' : ''}">${g.home_team_name}</span> vs <span class="${awayWon ? 'winner-team' : ''}">${g.away_team_name}</span></span>`
              : `<span class="today-teams">${g.home_team_name} vs ${g.away_team_name}</span>`;
            return `
              <a href="#/game/${g.id}" class="${rowClass}">
                <span class="game-badge game-status-${g.status}" style="font-size:0.5rem">${statusLabel}</span>
                ${teams}
                ${g.status !== 'scheduled' ? `<span class="today-score">${g.home_runs}-${g.away_runs}</span>` : ''}
                ${g.scheduled_time ? `<span class="today-time">${g.scheduled_time}</span>` : ''}
              </a>`;
          }).join('')}
        </div>
      </div>`;
  } catch { /* silent */ }
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
              <span class="hot-stats">${p.recent_bases} TB</span>
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
    const seriesFilter = activeSeriesId ? `&series_id=${activeSeriesId}` : '';
    const playsRes = await api(`/at-bats?limit=10${seriesFilter}`);
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
