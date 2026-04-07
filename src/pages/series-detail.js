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
      <div id="series-awards"></div>
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

    // Load awards if series is completed
    if (!series.is_active) {
      loadAwards(seriesId);
    }

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

async function loadAwards(seriesId) {
  const el = document.getElementById('series-awards');
  if (!el) return;

  try {
    const res = await api(`/stats/awards/${seriesId}`);
    const a = res.awards;
    if (!a) return;

    const awardCards = [];

    if (a.winning_team) {
      awardCards.push(`
        <div class="award-card award-champion">
          <span class="award-icon">&#127942;</span>
          <span class="award-title">Champion</span>
          <span class="award-winner">${a.winning_team.name}</span>
          <span class="award-value">${a.winning_team.value} Runs</span>
        </div>`);
    }
    if (a.mvp_rbi && a.mvp_rbi.value > 0) {
      awardCards.push(`
        <div class="award-card">
          <span class="award-icon">&#11088;</span>
          <span class="award-title">RBI Leader</span>
          <a href="#/player/${a.mvp_rbi.id}" class="award-winner table-link">${a.mvp_rbi.display_name}</a>
          <span class="award-value">${a.mvp_rbi.value} RBI</span>
        </div>`);
    }
    if (a.mvp_bases && a.mvp_bases.value > 0) {
      awardCards.push(`
        <div class="award-card">
          <span class="award-icon">&#128170;</span>
          <span class="award-title">TB Leader</span>
          <a href="#/player/${a.mvp_bases.id}" class="award-winner table-link">${a.mvp_bases.display_name}</a>
          <span class="award-value">${a.mvp_bases.value} TB</span>
        </div>`);
    }
    if (a.hr_leader && a.hr_leader.value > 0) {
      awardCards.push(`
        <div class="award-card">
          <span class="award-icon">&#128165;</span>
          <span class="award-title">HR Leader</span>
          <a href="#/player/${a.hr_leader.id}" class="award-winner table-link">${a.hr_leader.display_name}</a>
          <span class="award-value">${a.hr_leader.value} HR</span>
        </div>`);
    }
    if (a.hustle && a.hustle.value > 0) {
      awardCards.push(`
        <div class="award-card">
          <span class="award-icon">&#9889;</span>
          <span class="award-title">Hustle Award</span>
          <a href="#/player/${a.hustle.id}" class="award-winner table-link">${a.hustle.display_name}</a>
          <span class="award-value">${a.hustle.value} AB</span>
        </div>`);
    }
    if (a.best_slg && a.best_slg.value > 0) {
      awardCards.push(`
        <div class="award-card">
          <span class="award-icon">&#127919;</span>
          <span class="award-title">Best SLG</span>
          <a href="#/player/${a.best_slg.id}" class="award-winner table-link">${a.best_slg.display_name}</a>
          <span class="award-value">${a.best_slg.value} SLG</span>
        </div>`);
    }
    if (a.grand_slams?.length) {
      for (const gs of a.grand_slams) {
        awardCards.push(`
          <div class="award-card award-grandslam">
            <span class="award-icon">&#127881;</span>
            <span class="award-title">Grand Slam Club</span>
            <a href="#/player/${gs.id}" class="award-winner table-link">${gs.display_name}</a>
            <span class="award-value">${gs.value}x Grand Slam</span>
          </div>`);
      }
    }

    if (awardCards.length) {
      el.innerHTML = `
        <div class="awards-section">
          <h2>&#127942; Awards</h2>
          <div class="awards-grid">${awardCards.join('')}</div>
        </div>`;
    }
  } catch { /* silent */ }
}

async function loadSeriesTab(tabName, seriesId) {
  const content = document.getElementById('series-tab-content');
  content.innerHTML = '<div class="loading">Loading...</div>';

  try {
    if (tabName === 'teams') {
      const res = await api(`/stats/leaderboard/teams?series_id=${seriesId}`);
      content.innerHTML = '<div id="series-team-table"></div>';
      const teams = res.teams.map(t => ({
        ...t,
        slg: t.total_at_bats > 0 ? (t.total_bases / t.total_at_bats).toFixed(3) : '.000',
      }));
      renderStatsTable(
        document.getElementById('series-team-table'),
        teams,
        [
          { key: 'name', label: 'Team', sortable: true },
          { key: 'total_runs', label: 'Runs', sortable: true },
          { key: 'total_bases', label: 'TB', sortable: true },
          { key: 'total_at_bats', label: 'AB', sortable: true },
          { key: 'singles', label: '1B', sortable: true },
          { key: 'doubles', label: '2B', sortable: true },
          { key: 'triples', label: '3B', sortable: true },
          { key: 'home_runs', label: 'HR', sortable: true },
          { key: 'slg', label: 'SLG', sortable: true },
        ],
        'total_runs'
      );
    } else if (tabName === 'players') {
      const res = await api(`/stats/leaderboard/players?series_id=${seriesId}`);
      content.innerHTML = '<div id="series-player-table"></div>';
      const players = res.players.map(p => ({
        ...p,
        avg: p.total_at_bats > 0 ? ((p.singles + p.doubles + p.triples + p.home_runs) / p.total_at_bats).toFixed(3) : '.000',
        slg: p.total_at_bats > 0 ? (p.total_bases / p.total_at_bats).toFixed(3) : '.000',
      }));
      renderStatsTable(
        document.getElementById('series-player-table'),
        players,
        [
          { key: 'display_name', label: 'Player', sortable: true, link: (row) => `#/player/${row.id}` },
          { key: 'team_name', label: 'Team', sortable: true },
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
              <a href="#/player/${ab.player_id}" class="play-player table-link">${ab.player_name}</a>
              <span class="play-team">${ab.team_name}</span>
              ${ab.description ? `<span class="play-lead">ID: ${ab.description}</span>` : ''}
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
