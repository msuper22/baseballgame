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
        content.innerHTML = '<div id="team-table"></div>';
        renderStatsTable(
          document.getElementById('team-table'),
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
      } else {
        const res = await api('/stats/leaderboard/players');
        content.innerHTML = '<div id="player-table"></div>';
        renderStatsTable(
          document.getElementById('player-table'),
          res.players,
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
          ],
          'total_bases'
        );
      }
    } catch (e) {
      showToast(e.message, 'error');
      content.innerHTML = `<p class="error">${e.message}</p>`;
    }
  }

  loadTab('teams');
}
