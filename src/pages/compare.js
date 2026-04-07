import { api, isLoggedIn } from '../api.js';
import { navigate } from '../router.js';
import { showToast } from '../components/toast.js';

export async function comparePage(app) {
  if (!isLoggedIn()) { navigate('/login'); return; }

  let teams = [];
  try {
    const res = await api('/teams');
    teams = res.teams;
  } catch (e) {
    app.innerHTML = `<div class="container"><p class="error">${e.message}</p></div>`;
    return;
  }

  app.innerHTML = `
    <div class="container">
      <a href="#/leaderboard" class="back-link">&larr; Leaderboard</a>
      <h1>&#9878; Head-to-Head</h1>
      <div class="compare-selectors">
        <select id="team1-select" class="form-input">
          ${teams.map((t, i) => `<option value="${t.id}" ${i === 0 ? 'selected' : ''}>${t.name}</option>`).join('')}
        </select>
        <span class="compare-vs">VS</span>
        <select id="team2-select" class="form-input">
          ${teams.map((t, i) => `<option value="${t.id}" ${i === 1 ? 'selected' : ''}>${t.name}</option>`).join('')}
        </select>
        <button id="compare-btn" class="btn btn-primary">Compare</button>
      </div>
      <div id="compare-result"></div>
    </div>`;

  document.getElementById('compare-btn')?.addEventListener('click', loadComparison);
  loadComparison();

  async function loadComparison() {
    const t1 = document.getElementById('team1-select').value;
    const t2 = document.getElementById('team2-select').value;
    const result = document.getElementById('compare-result');

    if (t1 === t2) {
      result.innerHTML = '<p class="empty-state">Select two different teams.</p>';
      return;
    }

    result.innerHTML = '<div class="loading">Loading...</div>';

    try {
      const res = await api(`/stats/head-to-head?team1=${t1}&team2=${t2}`);
      const s1 = res.team1;
      const s2 = res.team2;

      if (!s1 || !s2) {
        result.innerHTML = '<p class="empty-state">No data available.</p>';
        return;
      }

      const stats = [
        { label: 'Runs', key: 'total_runs' },
        { label: 'Total Bases', key: 'total_bases' },
        { label: 'At Bats', key: 'total_at_bats' },
        { label: 'RBI', key: 'total_rbi' },
        { label: 'Singles', key: 'singles' },
        { label: 'Doubles', key: 'doubles' },
        { label: 'Triples', key: 'triples' },
        { label: 'Home Runs', key: 'home_runs' },
        { label: 'SLG', key: 'slg' },
      ];

      result.innerHTML = `
        <div class="compare-table">
          <div class="compare-header">
            <span class="compare-team-name">${s1.name}</span>
            <span class="compare-label">STAT</span>
            <span class="compare-team-name">${s2.name}</span>
          </div>
          ${stats.map(stat => {
            const v1 = s1[stat.key] || 0;
            const v2 = s2[stat.key] || 0;
            const v1Num = parseFloat(v1);
            const v2Num = parseFloat(v2);
            const w1 = v1Num > v2Num ? 'compare-winner' : '';
            const w2 = v2Num > v1Num ? 'compare-winner' : '';
            return `
              <div class="compare-row">
                <span class="compare-val ${w1}">${v1}</span>
                <span class="compare-stat-label">${stat.label}</span>
                <span class="compare-val ${w2}">${v2}</span>
              </div>`;
          }).join('')}
        </div>`;
    } catch (e) {
      result.innerHTML = `<p class="error">${e.message}</p>`;
    }
  }
}
