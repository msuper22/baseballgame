import { api, isLoggedIn, isAdmin, getUser } from '../api.js';
import { navigate } from '../router.js';
import { renderDiamond } from '../components/diamond.js';
import { renderEventForm } from '../components/event-form.js';
import { showToast } from '../components/toast.js';
import { formatHit, describeHit } from '../components/hit-label.js';
import { startPolling } from '../lib/live-poll.js';

let pollHandle = null;
let lastGameStatus = null;

export async function gamePage(app, params) {
  if (!isLoggedIn()) { navigate('/login'); return; }

  const gameId = params.id;

  app.innerHTML = `
    <div class="container">
      <div class="dashboard-header">
        <h1>&#9918; Game Detail</h1>
        <div>
          <a href="#/schedule" class="btn btn-sm">&larr; Schedule</a>
          <button id="refresh-btn" class="btn btn-sm" title="Refresh">&#8635;</button>
        </div>
      </div>
      <div id="game-header" class="game-detail-header"></div>
      <div class="game-split-view">
        <div id="offense-panel" class="offense-panel"></div>
        <div id="defense-panel" class="defense-panel"></div>
      </div>
      <div id="game-event-form"></div>
      <div id="game-plays" class="recent-plays"></div>
    </div>`;

  await loadGame(gameId);

  if (pollHandle) pollHandle.stop();
  pollHandle = startPolling(() => loadGame(gameId), 8000);

  document.getElementById('refresh-btn')?.addEventListener('click', () => {
    loadGame(gameId);
    showToast('Refreshed!', 'info');
  });

  return () => {
    if (pollHandle) { pollHandle.stop(); pollHandle = null; }
    lastGameStatus = null;
  };
}

async function loadGame(gameId) {
  try {
    const res = await api(`/games/${gameId}`);
    const game = res.game;
    const baseStates = res.base_states || [];
    const atBats = res.at_bats || [];
    const halfInning = res.current_half_inning || null;
    const user = getUser();

    // Render header
    const headerEl = document.getElementById('game-header');
    if (headerEl) {
      const statusLabel = { scheduled: 'Upcoming', active: 'LIVE', completed: 'Final', cancelled: 'Cancelled', extra_innings: 'EXTRA INNINGS' }[game.status];
      const statusClass = game.status === 'extra_innings' ? 'game-status-extra' : `game-status-${game.status}`;
      // Only pulse the extra-innings glow while the game is actually in extras — drop it once completed.
      headerEl.classList.toggle('extra-innings-card', game.status === 'extra_innings');

      // Toast the moment the game flips into extras
      if (lastGameStatus && lastGameStatus !== 'extra_innings' && game.status === 'extra_innings') {
        showToast('Going to extra innings!', 'info');
      }
      // Toast when the game completes
      if (lastGameStatus && lastGameStatus !== 'completed' && game.status === 'completed') {
        const winner = game.winner_team_id === game.home_team_id ? game.home_team_name :
                       game.winner_team_id === game.away_team_id ? game.away_team_name : 'Tied';
        showToast(`Game over — ${winner} wins ${game.home_runs}-${game.away_runs}`, 'success');
      }
      lastGameStatus = game.status;

      // Stop polling when the game is finished — no reason to keep hitting the API.
      if ((game.status === 'completed' || game.status === 'cancelled') && pollHandle) {
        pollHandle.stop();
        pollHandle = null;
      }

      const isCompleted = game.status === 'completed';
      const winnerName = game.winner_team_id === game.home_team_id ? game.home_team_name :
                         game.winner_team_id === game.away_team_id ? game.away_team_name : null;
      const finalLine = isCompleted
        ? (winnerName
            ? `<div class="game-over-banner"><span class="game-over-label">FINAL</span><span class="game-over-winner">${winnerName} win ${Math.max(game.home_runs, game.away_runs)}&ndash;${Math.min(game.home_runs, game.away_runs)}</span></div>`
            : `<div class="game-over-banner tie"><span class="game-over-label">FINAL</span><span class="game-over-winner">Tie game ${game.home_runs}&ndash;${game.away_runs}</span></div>`)
        : '';

      headerEl.classList.toggle('game-completed', isCompleted);
      headerEl.innerHTML = `
        ${finalLine}
        <div class="game-detail-info">
          <span class="game-badge ${statusClass}">${statusLabel}</span>
          ${game.tournament_name ? `<span class="game-tournament">${game.tournament_name}${game.round ? ` - Round ${game.round}` : ''}</span>` : '<span class="game-tournament">Challenge Game</span>'}
          <span class="game-date">${formatDate(game.scheduled_date)}${game.scheduled_time ? ' at ' + game.scheduled_time : ''}</span>
        </div>
        <div class="game-scoreboard ${isCompleted ? 'final' : ''}">
          <div class="score-team ${game.winner_team_id === game.home_team_id ? 'winner' : ''}">
            <span class="score-team-name">${game.home_team_name}</span>
            <span class="score-value">${game.home_runs}</span>
          </div>
          <span class="score-separator">-</span>
          <div class="score-team ${game.winner_team_id === game.away_team_id ? 'winner' : ''}">
            <span class="score-value">${game.away_runs}</span>
            <span class="score-team-name">${game.away_team_name}</span>
          </div>
        </div>
        ${isAdmin() && game.status !== 'completed' ? `
          <div class="game-admin-controls">
            ${game.status === 'scheduled' ? `<button class="btn btn-sm btn-primary" id="activate-game">Start Game</button>` : ''}
            ${game.status === 'active' ? `<button class="btn btn-sm btn-danger" id="complete-game">End Game</button>` : ''}
          </div>` : ''}`;

      document.getElementById('activate-game')?.addEventListener('click', async () => {
        try {
          await api(`/games/${gameId}`, { method: 'PUT', body: JSON.stringify({ status: 'active' }) });
          showToast('Game started!', 'success');
          loadGame(gameId);
        } catch (e) { showToast(e.message, 'error'); }
      });

      document.getElementById('complete-game')?.addEventListener('click', async () => {
        if (!confirm('End this game? The winner will be determined by current score.')) return;
        try {
          await api(`/games/${gameId}`, { method: 'PUT', body: JSON.stringify({ status: 'completed' }) });
          showToast('Game completed!', 'success');
          loadGame(gameId);
        } catch (e) { showToast(e.message, 'error'); }
      });
    }

    // If the game is over, hide the live split view entirely — it implies play is ongoing.
    const splitViewEl = app.querySelector('.game-split-view');
    if (game.status === 'completed' || game.status === 'cancelled') {
      if (splitViewEl) splitViewEl.style.display = 'none';
    } else if (splitViewEl) {
      splitViewEl.style.display = '';
    }

    // Split view: offense (batting team's diamond) + defense (fielding team's counters + recent plays)
    const battingTeamId = halfInning?.batting_team_id ?? game.away_team_id;
    const fieldingTeamId = halfInning?.fielding_team_id ?? game.home_team_id;
    const offense = baseStates.find(bs => bs.team_id === battingTeamId);
    const defense = baseStates.find(bs => bs.team_id === fieldingTeamId);

    const offenseEl = document.getElementById('offense-panel');
    if (offenseEl && offense && game.status !== 'completed' && game.status !== 'cancelled') {
      offenseEl.innerHTML = `
        <div class="panel-header offense-header">
          <span class="panel-label">⚾ OFFENSE</span>
          <strong>${offense.team_name}</strong>
        </div>
        <div id="offense-diamond-slot" class="diamond-wrapper"></div>`;
      renderDiamond(document.getElementById('offense-diamond-slot'), {
        team_id: offense.team_id,
        team_name: offense.team_name,
        total_runs: offense.total_runs,
        total_bases: offense.total_bases,
        first_base: offense.first_base,
        second_base: offense.second_base,
        third_base: offense.third_base,
        first_base_name: offense.first_base_name,
        second_base_name: offense.second_base_name,
        third_base_name: offense.third_base_name,
      });
    }

    const defenseEl = document.getElementById('defense-panel');
    if (defenseEl && defense && game.status !== 'completed' && game.status !== 'cancelled') {
      const outs = halfInning?.outs ?? 0;
      const strikes = halfInning?.strikes ?? 0;
      const recentDefense = atBats.filter(ab => ab.event_side === 'defense' && ab.half_inning_id === halfInning?.id).slice(0, 5);

      defenseEl.innerHTML = `
        <div class="panel-header defense-header-bar">
          <span class="panel-label">🛡 DEFENSE</span>
          <strong>${defense.team_name}</strong>
        </div>
        <div class="defense-score-card">
          <div class="defense-stat">
            <span class="defense-stat-value">${outs}<span class="defense-stat-denom">/3</span></span>
            <span class="defense-stat-label">Outs</span>
          </div>
          <div class="defense-stat">
            <span class="defense-stat-value">${strikes}<span class="defense-stat-denom">/2</span></span>
            <span class="defense-stat-label">Strikes</span>
          </div>
          <div class="defense-stat">
            <span class="defense-stat-value">${offense?.total_runs ?? 0}</span>
            <span class="defense-stat-label">Runs Allowed</span>
          </div>
        </div>
        <div class="defense-feed">
          <h4>This Half-Inning</h4>
          ${recentDefense.length === 0
            ? '<p class="empty-state-small">No defensive plays yet.</p>'
            : recentDefense.map(ab => renderDefensePlay(ab, offense)).join('')}
        </div>`;
    }

    // Render event form only for live games. For games that haven't started yet,
    // show a "not yet started" notice instead — prevents silent event logging.
    const formEl = document.getElementById('game-event-form');
    if (formEl) {
      const isInGame = user?.team_id === game.home_team_id || user?.team_id === game.away_team_id;
      const isLive = game.status === 'active' || game.status === 'extra_innings';
      if (isInGame && isLive) {
        await renderEventForm(formEl, {
          gameId: parseInt(gameId),
          gameInfo: game,
          halfInning,
          onSuccess: () => loadGame(gameId),
        });
      } else if (isInGame && game.status === 'scheduled') {
        const when = game.scheduled_time
          ? `${game.scheduled_date} at ${game.scheduled_time} Central`
          : game.scheduled_date;
        formEl.innerHTML = `
          <div class="event-form not-started-card">
            <h3>Game hasn't started yet</h3>
            <p>Scheduled for <strong>${when}</strong>. You'll be able to log events once the game is live.</p>
          </div>`;
      } else {
        formEl.innerHTML = '';
      }
    }

    // Render play-by-play (admins can edit/delete inline)
    const playsEl = document.getElementById('game-plays');
    if (playsEl) {
      if (atBats.length) {
        const adminView = isAdmin();
        playsEl.innerHTML = `
          <h2>Play-by-Play${adminView ? ' <span class="admin-hint">(click any play to edit)</span>' : ''}</h2>
          <div class="plays-list">
            ${atBats.map(ab => {
              const isDef = ab.event_side === 'defense';
              return `
              <div class="play-item ${adminView ? 'play-editable' : ''} ${isDef ? 'play-defense' : ''}" data-id="${ab.id}" data-current="${ab.hit_type}" data-side="${ab.event_side || 'offense'}">
                <span class="play-type play-${ab.hit_type} ${isDef ? 'play-defense-type' : ''}">${formatHit(ab.hit_type, ab.event_side)}</span>
                <span class="play-player">${ab.player_name}</span>
                <span class="play-team">${ab.team_name}</span>
                <span class="play-descriptor">${describeHit(ab.hit_type, ab.event_side)}</span>
                ${ab.runs_scored > 0 ? `<span class="play-runs">+${ab.runs_scored} run${ab.runs_scored > 1 ? 's' : ''}</span>` : ''}
                <span class="play-time">${timeAgo(ab.created_at)}</span>
                ${adminView ? `<button class="btn btn-sm play-edit-btn">Edit</button>` : ''}
              </div>`;
            }).join('')}
          </div>`;

        if (adminView) {
          playsEl.querySelectorAll('.play-edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
              e.stopPropagation();
              const item = btn.closest('.play-item');
              const id = item.dataset.id;
              const currentType = item.dataset.current;
              const side = item.dataset.side;
              openEventEditor(id, currentType, side, () => loadGame(gameId));
            });
          });
        }
      } else {
        playsEl.innerHTML = '<p class="empty-state">No plays yet.</p>';
      }
    }
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function renderDefensePlay(ab, offenseBaseState) {
  // If a DP/TP was logged but offense had no runners to "double/triple up",
  // show it as N individual strikeouts instead — more believable narrative.
  const runnersOn = offenseBaseState
    ? [offenseBaseState.first_base, offenseBaseState.second_base, offenseBaseState.third_base].filter(Boolean).length
    : 0;

  if (ab.hit_type === 'triple' && runnersOn === 0) {
    return `
      <div class="play-item play-defense">
        <span class="play-type play-defense-type">K×2</span>
        <span class="play-player">${ab.player_name}</span>
        <span class="play-descriptor">Struck out 2 batters</span>
        <span class="play-time">${timeAgo(ab.created_at)}</span>
      </div>`;
  }
  if (ab.hit_type === 'home_run' && runnersOn < 2) {
    const n = runnersOn === 0 ? 3 : 2;
    return `
      <div class="play-item play-defense">
        <span class="play-type play-defense-type">K×${n}</span>
        <span class="play-player">${ab.player_name}</span>
        <span class="play-descriptor">Struck out ${n} batters</span>
        <span class="play-time">${timeAgo(ab.created_at)}</span>
      </div>`;
  }

  // Default — use normal defense label
  return `
    <div class="play-item play-defense">
      <span class="play-type play-defense-type">${formatHit(ab.hit_type, 'defense')}</span>
      <span class="play-player">${ab.player_name}</span>
      <span class="play-descriptor">${describeHit(ab.hit_type, 'defense')}</span>
      <span class="play-time">${timeAgo(ab.created_at)}</span>
    </div>`;
}

function openEventEditor(atBatId, currentType, side, onChange) {
  const existing = document.getElementById('event-editor-modal');
  if (existing) existing.remove();

  const isDef = side === 'defense';
  const opts = isDef
    ? [['single','K — Strike'], ['double','OUT — Caught Out'], ['triple','DP — Double Play'], ['home_run','TP — Triple Play']]
    : [['single','1B — Single'], ['double','2B — Double'], ['triple','3B — Triple'], ['home_run','HR — Home Run']];

  const modal = document.createElement('div');
  modal.id = 'event-editor-modal';
  modal.className = 'event-editor-modal';
  modal.innerHTML = `
    <div class="event-editor-card">
      <h3>Edit ${isDef ? 'Defense Play' : 'Play'}</h3>
      <label style="font-size:0.7rem;margin-bottom:0.5rem;display:block">Change play type</label>
      <select id="editor-hit-type" class="form-input">
        ${opts.map(([v,l]) => `<option value="${v}" ${currentType === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
      <div class="event-editor-actions">
        <button id="editor-save" class="btn btn-primary">Save</button>
        <button id="editor-delete" class="btn btn-danger">Delete play</button>
        <button id="editor-cancel" class="btn">Cancel</button>
      </div>
      <p class="event-editor-note">Editing recalculates base state and scores.</p>
    </div>`;
  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  document.getElementById('editor-cancel').addEventListener('click', close);

  document.getElementById('editor-save').addEventListener('click', async () => {
    const newType = document.getElementById('editor-hit-type').value;
    try {
      await api(`/at-bats/${atBatId}`, { method: 'PUT', body: JSON.stringify({ hit_type: newType }) });
      showToast('Play updated', 'success');
      close();
      if (onChange) await onChange();
    } catch (e) {
      showToast(e.message, 'error');
    }
  });

  document.getElementById('editor-delete').addEventListener('click', async () => {
    if (!confirm('Delete this play? Scores and runners will be recalculated.')) return;
    try {
      await api(`/at-bats/${atBatId}`, { method: 'DELETE' });
      showToast('Play deleted', 'success');
      close();
      if (onChange) await onChange();
    } catch (e) {
      showToast(e.message, 'error');
    }
  });
}

function formatHitType(type) {
  return { single: '1B', double: '2B', triple: '3B', home_run: 'HR' }[type] || type;
}

function formatDate(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
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
