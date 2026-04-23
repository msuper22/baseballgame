import { api, isLoggedIn, getUser, isAdmin } from '../api.js';
import { navigate } from '../router.js';
import { showToast } from '../components/toast.js';

export async function schedulePage(app) {
  if (!isLoggedIn()) { navigate('/login'); return; }

  const user = getUser();

  app.innerHTML = `
    <div class="container">
      <div class="dashboard-header">
        <h1>&#128197; Schedule</h1>
        <div class="schedule-filters">
          <label class="toggle-label">
            <input type="checkbox" id="my-games-toggle"> My Games Only
          </label>
          <select id="status-filter" class="form-input" style="width:auto;padding:0.3rem 0.5rem;font-size:1rem">
            <option value="">All Games</option>
            <option value="scheduled">Upcoming</option>
            <option value="active">In Progress</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>
      <div id="schedule-content" class="schedule-content">
        <div class="loading">Loading schedule...</div>
      </div>
    </div>`;

  await loadSchedule();

  document.getElementById('my-games-toggle')?.addEventListener('change', loadSchedule);
  document.getElementById('status-filter')?.addEventListener('change', loadSchedule);

  async function loadSchedule() {
    const content = document.getElementById('schedule-content');
    if (!content) return;

    const myGamesOnly = document.getElementById('my-games-toggle')?.checked;
    const statusFilter = document.getElementById('status-filter')?.value;

    try {
      let url = '/games/schedule';
      const params = [];
      if (myGamesOnly && user?.team_id) params.push(`team_id=${user.team_id}`);
      if (params.length) url += '?' + params.join('&');

      const res = await api(url);
      let games = res.games || [];

      if (statusFilter) {
        games = games.filter(g => g.status === statusFilter);
      }

      if (!games.length) {
        content.innerHTML = '<p class="empty-state">No games scheduled yet.</p>';
        return;
      }

      // Group by date (games without a date go in a dedicated bucket)
      const UNSCHEDULED = '__unscheduled__';
      const grouped = {};
      for (const game of games) {
        const date = game.scheduled_date || UNSCHEDULED;
        if (!grouped[date]) grouped[date] = [];
        grouped[date].push(game);
      }

      // Use Central time for "today" so the label doesn't roll over at UTC midnight.
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

      content.innerHTML = Object.entries(grouped).map(([date, dateGames]) => {
        const groupAttr = `data-drop-date="${date === UNSCHEDULED ? '' : date}"`;
        if (date === UNSCHEDULED) {
          return `
            <div class="schedule-day" ${groupAttr}>
              <h2 class="schedule-date">Unscheduled</h2>
              <div class="schedule-games">
                ${dateGames.map(g => renderGameCard(g, user)).join('')}
              </div>
            </div>`;
        }
        const isToday = date === today;
        const isPast = date < today;
        const dateLabel = isToday ? 'Today' : formatDate(date);
        const dateClass = isToday ? 'schedule-date today' : isPast ? 'schedule-date past' : 'schedule-date';

        return `
          <div class="schedule-day" ${groupAttr}>
            <h2 class="${dateClass}">${dateLabel} <span class="date-sub">${date}</span></h2>
            <div class="schedule-games">
              ${dateGames.map(g => renderGameCard(g, user)).join('')}
            </div>
          </div>`;
      }).join('');

      // Click to open — but ignore clicks inside the admin edit button/modal.
      content.querySelectorAll('.game-card').forEach(card => {
        card.addEventListener('click', (e) => {
          if (e.target.closest('.edit-sched-btn') || e.target.closest('.sched-modal')) return;
          if (card.classList.contains('dragging')) return;
          navigate(`/game/${card.dataset.id}`);
        });
      });

      // Admin: per-game schedule edit
      content.querySelectorAll('.edit-sched-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          openScheduleEditor(btn.dataset.id, btn.dataset.date, btn.dataset.time || '', loadSchedule);
        });
      });

      // Admin: per-game delete
      content.querySelectorAll('.delete-game-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const label = btn.dataset.label || 'this game';
          if (!confirm(`Delete ${label}? This removes the game, all its events, and cannot be undone.`)) return;
          try {
            await api(`/games/${btn.dataset.id}`, { method: 'DELETE' });
            showToast('Game deleted', 'success');
            loadSchedule();
          } catch (err) { showToast(err.message, 'error'); }
        });
      });

      // Admin: drag-and-drop reschedule between date groups
      if (isAdmin()) wireDragAndDrop(content, loadSchedule);
    } catch (e) {
      content.innerHTML = `<p class="error">${e.message}</p>`;
    }
  }
}

function wireDragAndDrop(content, onDone) {
  const cards = content.querySelectorAll('.game-card[draggable="true"]');
  const groups = content.querySelectorAll('.schedule-day');

  cards.forEach(card => {
    card.addEventListener('dragstart', (e) => {
      card.classList.add('dragging');
      e.dataTransfer.setData('text/game-id', card.dataset.id);
      e.dataTransfer.setData('text/current-date', card.dataset.date || '');
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      groups.forEach(g => g.classList.remove('drop-target'));
    });
  });

  groups.forEach(group => {
    group.addEventListener('dragover', (e) => {
      const dragged = content.querySelector('.game-card.dragging');
      if (!dragged) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      group.classList.add('drop-target');
    });
    group.addEventListener('dragleave', (e) => {
      if (!group.contains(e.relatedTarget)) group.classList.remove('drop-target');
    });
    group.addEventListener('drop', async (e) => {
      e.preventDefault();
      group.classList.remove('drop-target');
      const gameId = e.dataTransfer.getData('text/game-id');
      const currentDate = e.dataTransfer.getData('text/current-date');
      const newDate = group.dataset.dropDate;
      if (!gameId || !newDate) return;
      if (newDate === currentDate) return;
      try {
        await api(`/games/${gameId}`, {
          method: 'PUT',
          body: JSON.stringify({ scheduled_date: newDate }),
        });
        showToast(`Moved to ${newDate}`, 'success');
        onDone?.();
      } catch (err) { showToast(err.message, 'error'); }
    });
  });
}

function openScheduleEditor(gameId, currentDate, currentTime, onDone) {
  const existing = document.querySelector('.sched-modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'sched-modal-overlay';
  overlay.innerHTML = `
    <div class="sched-modal">
      <h3>Reschedule Game</h3>
      <div class="form-group">
        <label>Date</label>
        <input type="date" id="sm-date" class="form-input" value="${currentDate || ''}">
      </div>
      <div class="form-group">
        <label>Time (Central)</label>
        <input type="time" id="sm-time" class="form-input" value="${currentTime || ''}">
      </div>
      <div class="sched-modal-actions">
        <button class="btn sm-cancel">Cancel</button>
        <button class="btn btn-primary sm-save">Save</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  overlay.querySelector('.sm-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('.sm-save').addEventListener('click', async () => {
    const date = overlay.querySelector('#sm-date').value;
    const time = overlay.querySelector('#sm-time').value || null;
    if (!date) { showToast('Date required', 'error'); return; }
    try {
      await api(`/games/${gameId}`, {
        method: 'PUT',
        body: JSON.stringify({ scheduled_date: date, scheduled_time: time }),
      });
      showToast('Game rescheduled', 'success');
      overlay.remove();
      onDone?.();
    } catch (err) { showToast(err.message, 'error'); }
  });
}

function renderGameCard(game, user) {
  const isMyTeam = user?.team_id === game.home_team_id || user?.team_id === game.away_team_id;
  const statusClass = game.status === 'extra_innings' ? 'game-status-extra' : `game-status-${game.status}`;
  const statusLabel = { scheduled: 'Upcoming', active: 'Live', completed: 'Final', cancelled: 'Cancelled', extra_innings: 'Extra Innings' }[game.status] || game.status;
  // Admin can reschedule: 'scheduled' always; 'active' only if zero events logged
  // (premature auto-start revert). Completed/cancelled never editable.
  const canEditActive = game.status === 'active' && !(game.home_runs || game.away_runs);
  const canEdit = isAdmin() && (game.status === 'scheduled' || canEditActive);
  const canDelete = isAdmin();
  const draggable = canEdit ? 'draggable="true"' : '';
  const matchupLabel = `${game.home_team_name} vs ${game.away_team_name}`;

  return `
    <div class="game-card ${isMyTeam ? 'my-game' : ''}" data-id="${game.id}" data-date="${game.scheduled_date || ''}" ${draggable}>
      <div class="game-card-header">
        <span class="game-badge ${statusClass}">${statusLabel}</span>
        ${game.tournament_name ? `<span class="game-tournament">${game.tournament_name}</span>` : '<span class="game-tournament">Challenge</span>'}
        ${game.scheduled_time ? `<span class="game-time">${game.scheduled_time}</span>` : ''}
        ${game.round ? `<span class="game-round">Rd ${game.round}</span>` : ''}
        ${canEdit ? `<button class="btn btn-sm edit-sched-btn" data-id="${game.id}" data-date="${game.scheduled_date || ''}" data-time="${game.scheduled_time || ''}" title="Reschedule">&#128197;</button>` : ''}
        ${canDelete ? `<button class="btn btn-sm btn-danger delete-game-btn" data-id="${game.id}" data-label="${matchupLabel}" title="Delete game">&#128465;</button>` : ''}
      </div>
      <div class="game-matchup">
        <div class="game-team ${game.winner_team_id === game.home_team_id ? 'winner' : ''}">
          <span class="team-name">${game.home_team_name}</span>
          <span class="team-score">${game.status !== 'scheduled' ? game.home_runs : '-'}</span>
        </div>
        <span class="game-vs">vs</span>
        <div class="game-team ${game.winner_team_id === game.away_team_id ? 'winner' : ''}">
          <span class="team-name">${game.away_team_name}</span>
          <span class="team-score">${game.status !== 'scheduled' ? game.away_runs : '-'}</span>
        </div>
      </div>
    </div>`;
}

function formatDate(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
