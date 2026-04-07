import { api, isLoggedIn } from '../api.js';
import { navigate } from '../router.js';
import { renderDiamond } from '../components/diamond.js';
import { renderStatsTable } from '../components/stats-table.js';
import { showToast } from '../components/toast.js';

export async function teamPage(app, params) {
  if (!isLoggedIn()) { navigate('/login'); return; }

  const teamId = params.id;

  app.innerHTML = `
    <div class="container">
      <a href="#/" class="back-link">&larr; Dashboard</a>
      <div id="team-diamond" class="team-diamond-large"></div>
      <div id="team-roster" class="section"></div>
      <div id="team-history" class="section"></div>
    </div>`;

  try {
    // Load game state
    const stateRes = await api(`/stats/game-state/${teamId}`);
    const diamondDiv = document.getElementById('team-diamond');
    renderDiamond(diamondDiv, stateRes.game_state);

    // Load team roster stats
    const playersRes = await api(`/stats/leaderboard/players?team_id=${teamId}`);
    const rosterDiv = document.getElementById('team-roster');
    rosterDiv.innerHTML = '<h2>Player Stats</h2><div id="roster-table"></div>';
    const rosterPlayers = playersRes.players.map(p => ({
      ...p,
      avg: p.total_at_bats > 0 ? ((p.singles + p.doubles + p.triples + p.home_runs) / p.total_at_bats).toFixed(3) : '.000',
      slg: p.total_at_bats > 0 ? (p.total_bases / p.total_at_bats).toFixed(3) : '.000',
    }));
    renderStatsTable(
      document.getElementById('roster-table'),
      rosterPlayers,
      [
        { key: 'display_name', label: 'Player', sortable: true, link: (row) => `#/player/${row.id}` },
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

    // Load at-bat history
    const historyRes = await api(`/at-bats?team_id=${teamId}`);
    const historyDiv = document.getElementById('team-history');
    if (historyRes.at_bats?.length) {
      historyDiv.innerHTML = `
        <h2>Event Log</h2>
        <div class="event-log">
          ${historyRes.at_bats.map(ab => `
            <div class="log-entry">
              <span class="log-type log-${ab.hit_type}">${formatHit(ab.hit_type)}</span>
              <span class="log-player">${ab.player_name}</span>
              ${ab.description ? `<span class="log-lead">ID: ${ab.description}</span>` : ''}
              ${ab.runs_scored > 0 ? `<span class="log-runs">+${ab.runs_scored}R</span>` : ''}
              <span class="log-time">${new Date(ab.created_at + 'Z').toLocaleString()}</span>
            </div>
          `).join('')}
        </div>`;
    } else {
      historyDiv.innerHTML = '<h2>Event Log</h2><p class="empty-state">No events yet.</p>';
    }
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function formatHit(type) {
  const map = { single: 'Single', double: 'Double', triple: 'Triple', home_run: 'Home Run' };
  return map[type] || type;
}
