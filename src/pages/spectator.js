import { api, isLoggedIn } from '../api.js';
import { navigate } from '../router.js';
import { renderDiamond } from '../components/diamond.js';
import { showToast } from '../components/toast.js';

let refreshInterval = null;

export async function spectatorPage(app) {
  if (!isLoggedIn()) { navigate('/login'); return; }

  app.innerHTML = `
    <div class="container">
      <div class="dashboard-header">
        <h1>&#127911; Spectator View</h1>
        <span id="auto-refresh-indicator" class="auto-refresh-dot" title="Auto-refreshing every 10s"></span>
      </div>
      <div id="spectator-games">
        <div class="loading">Loading games...</div>
      </div>
    </div>`;

  await loadGames();
  refreshInterval = setInterval(loadGames, 10000);

  return () => {
    if (refreshInterval) { clearInterval(refreshInterval); refreshInterval = null; }
  };
}

async function loadGames() {
  const container = document.getElementById('spectator-games');
  if (!container) return;

  try {
    const res = await api('/spectator/games');
    const games = res.games || [];

    if (!games.length) {
      container.innerHTML = '<p class="empty-state">No active games right now. Check back when one starts.</p>';
      return;
    }

    container.innerHTML = games.map(g => {
      const hi = g.current_half_inning;
      const battingTeamId = hi?.batting_team_id;
      const inningLabel = `${g.current_half === 'top' ? '\u25B2' : '\u25BC'} ${g.current_inning}${getOrdinal(g.current_inning)}`;
      const statusBadge = g.status === 'extra_innings'
        ? '<span class="game-badge game-status-extra">EXTRA INNINGS</span>'
        : '<span class="game-badge game-status-active">LIVE</span>';
      const wrapperClass = g.status === 'extra_innings' ? 'spectator-game-wrapper extra-innings-card' : 'spectator-game-wrapper';

      return `
        <div class="${wrapperClass}" data-game-id="${g.id}">
          <div class="spectator-game-header">
            <div class="spec-header-left">
              ${statusBadge}
              <span class="spec-inning-label">${inningLabel}</span>
              ${hi ? `<span class="spec-batting">${hi.batting_team_name} batting (${hi.outs} out${hi.outs === 1 ? '' : 's'}, ${hi.strikes} strike${hi.strikes === 1 ? '' : 's'})</span>` : ''}
            </div>
            <div class="spec-header-score">
              <span class="spec-team">${g.away_team_name}</span>
              <span class="spec-scoreval ${g.away_runs > g.home_runs ? 'leading' : ''}">${g.away_runs}</span>
              <span class="spec-dash">-</span>
              <span class="spec-scoreval ${g.home_runs > g.away_runs ? 'leading' : ''}">${g.home_runs}</span>
              <span class="spec-team">${g.home_team_name}</span>
            </div>
            <a class="btn btn-sm" href="#/spectator/${g.id}">Watch \u2192</a>
          </div>
          <div class="spectator-diamond-pair" id="diamonds-${g.id}"></div>
        </div>`;
    }).join('');

    // Render diamonds for each game (home + away side by side)
    for (const g of games) {
      const pairEl = document.getElementById(`diamonds-${g.id}`);
      if (!pairEl) continue;
      // Order: away team first (they bat top), home team second (bat bottom)
      const ordered = [
        g.base_states.find(bs => bs.team_id === g.away_team_id),
        g.base_states.find(bs => bs.team_id === g.home_team_id),
      ].filter(Boolean);
      for (const bs of ordered) {
        const wrap = document.createElement('div');
        wrap.className = 'diamond-wrapper';
        const isBatting = g.current_half_inning && bs.team_id === g.current_half_inning.batting_team_id;
        if (isBatting) wrap.classList.add('batting-now');
        pairEl.appendChild(wrap);

        // Only show runners for the batting team — the fielding team has no runners on base
        const showRunners = isBatting;
        renderDiamond(wrap, {
          team_id: bs.team_id,
          team_name: bs.team_name,
          total_runs: bs.total_runs,
          total_bases: bs.total_bases,
          first_base: showRunners ? bs.first_base : null,
          second_base: showRunners ? bs.second_base : null,
          third_base: showRunners ? bs.third_base : null,
          first_base_name: showRunners ? bs.first_base_name : null,
          second_base_name: showRunners ? bs.second_base_name : null,
          third_base_name: showRunners ? bs.third_base_name : null,
        });
      }
    }

    container.querySelectorAll('.spectator-game-wrapper').forEach(w => {
      w.addEventListener('click', (e) => {
        if (e.target.closest('a, button')) return;
        navigate(`/spectator/${w.dataset.gameId}`);
      });
    });
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function getOrdinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
