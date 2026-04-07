import { api, isLoggedIn } from '../api.js';
import { navigate } from '../router.js';
import { renderStatsTable } from '../components/stats-table.js';
import { showToast } from '../components/toast.js';

export async function leaderboardPage(app) {
  if (!isLoggedIn()) { navigate('/login'); return; }

  app.innerHTML = `
    <div class="container">
      <h1>&#127942; Leaderboard</h1>
      <div class="tabs">
        <button class="tab active" data-tab="teams">Team Standings</button>
        <button class="tab" data-tab="players">Individual Stats</button>
      </div>
      <div id="tab-content"></div>
    </div>`;

  const tabs = app.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      loadTab(tab.dataset.tab);
    });
  });

  async function loadTab(tabName) {
    const content = document.getElementById('tab-content');
    content.innerHTML = '<div class="loading">Loading...</div>';

    try {
      if (tabName === 'teams') {
        const res = await api('/stats/leaderboard/teams');
        content.innerHTML = `
          <div class="export-bar">
            <button id="export-teams-csv" class="btn btn-sm">&#128229; Export CSV</button>
          </div>
          <div id="team-table"></div>`;

        // Add computed stats
        const teams = res.teams.map(t => ({
          ...t,
          slg: t.total_at_bats > 0 ? (t.total_bases / t.total_at_bats).toFixed(3) : '.000',
        }));

        renderStatsTable(
          document.getElementById('team-table'),
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

        document.getElementById('export-teams-csv')?.addEventListener('click', () => {
          downloadCsv('/stats/export/teams', 'team-stats.csv');
        });
      } else {
        const res = await api('/stats/leaderboard/players');
        content.innerHTML = `
          <div class="export-bar">
            <button id="export-players-csv" class="btn btn-sm">&#128229; Export CSV</button>
          </div>
          <div id="player-table"></div>`;

        // Add computed stats
        const players = res.players.map(p => ({
          ...p,
          avg: p.total_at_bats > 0 ? ((p.singles + p.doubles + p.triples + p.home_runs) / p.total_at_bats).toFixed(3) : '.000',
          slg: p.total_at_bats > 0 ? (p.total_bases / p.total_at_bats).toFixed(3) : '.000',
        }));

        renderStatsTable(
          document.getElementById('player-table'),
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

        document.getElementById('export-players-csv')?.addEventListener('click', () => {
          downloadCsv('/stats/export/players', 'player-stats.csv');
        });
      }
    } catch (e) {
      showToast(e.message, 'error');
      content.innerHTML = `<p class="error">${e.message}</p>`;
    }
  }

  loadTab('teams');
}

async function downloadCsv(endpoint, filename) {
  try {
    const token = localStorage.getItem('token');
    const resp = await fetch(`/api${endpoint}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV downloaded!', 'success');
  } catch (e) {
    showToast('Export failed', 'error');
  }
}
