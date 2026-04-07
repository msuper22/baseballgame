import { api, isAdmin, isLoggedIn } from '../api.js';
import { navigate } from '../router.js';
import { showToast } from '../components/toast.js';
import { renderEventForm } from '../components/event-form.js';

export async function adminPage(app) {
  if (!isLoggedIn()) { navigate('/login'); return; }
  if (!isAdmin()) {
    app.innerHTML = '<div class="container"><h1>Access Denied</h1><p>Admin access required.</p></div>';
    return;
  }

  app.innerHTML = `
    <div class="container">
      <h1>&#9881; Admin Panel</h1>
      <div class="admin-tabs">
        <button class="tab active" data-tab="teams">Teams</button>
        <button class="tab" data-tab="players">Players</button>
        <button class="tab" data-tab="series">Series</button>
        <button class="tab" data-tab="log-event">Log Event</button>
      </div>
      <div id="admin-content"></div>
    </div>`;

  const tabs = app.querySelectorAll('.admin-tabs .tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      loadAdminTab(tab.dataset.tab);
    });
  });

  async function loadAdminTab(tabName) {
    const content = document.getElementById('admin-content');
    if (tabName === 'teams') await loadTeamsTab(content);
    else if (tabName === 'players') await loadPlayersTab(content);
    else if (tabName === 'series') await loadSeriesTab(content);
    else if (tabName === 'log-event') await renderEventForm(content, { onSuccess: () => showToast('Event logged!', 'success') });
  }

  loadAdminTab('teams');
}

async function loadTeamsTab(content) {
  content.innerHTML = '<div class="loading">Loading...</div>';
  try {
    const res = await api('/teams');
    content.innerHTML = `
      <div class="admin-section">
        <h2>Teams</h2>
        <form id="add-team-form" class="inline-form">
          <input type="text" id="team-name" class="form-input" placeholder="Team name" required>
          <button type="submit" class="btn btn-primary">Add Team</button>
        </form>
        <div class="admin-list">
          ${res.teams.map(t => `
            <div class="admin-item">
              <div class="admin-item-info">
                <strong>${t.name}</strong>
                <span class="badge">Code: ${t.invite_code}</span>
                <span class="badge">${t.player_count || 0} players</span>
              </div>
              <div class="admin-item-actions">
                <button class="btn btn-sm btn-danger delete-team" data-id="${t.id}">Delete</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>`;

    document.getElementById('add-team-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const res = await api('/teams', {
          method: 'POST',
          body: JSON.stringify({ name: document.getElementById('team-name').value }),
        });
        showToast(`Team created! Invite code: ${res.team.invite_code}`, 'success');
        loadTeamsTab(content);
      } catch (e) {
        showToast(e.message, 'error');
      }
    });

    content.querySelectorAll('.delete-team').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this team?')) return;
        try {
          await api(`/teams/${btn.dataset.id}`, { method: 'DELETE' });
          showToast('Team deleted', 'success');
          loadTeamsTab(content);
        } catch (e) {
          showToast(e.message, 'error');
        }
      });
    });
  } catch (e) {
    content.innerHTML = `<p class="error">${e.message}</p>`;
  }
}

async function loadPlayersTab(content) {
  content.innerHTML = '<div class="loading">Loading...</div>';
  try {
    const [playersRes, teamsRes] = await Promise.all([api('/players'), api('/teams')]);

    content.innerHTML = `
      <div class="admin-section">
        <h2>Players</h2>
        <form id="add-player-form" class="inline-form">
          <input type="text" id="player-display" class="form-input" placeholder="Display Name" required>
          <input type="text" id="player-username" class="form-input" placeholder="Username" required>
          <input type="password" id="player-password" class="form-input" placeholder="Password" required>
          <select id="player-team" class="form-input">
            <option value="">No Team</option>
            ${teamsRes.teams.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
          </select>
          <select id="player-role" class="form-input">
            <option value="player">Player</option>
            <option value="mod">Mod</option>
            <option value="admin">Admin</option>
          </select>
          <button type="submit" class="btn btn-primary">Add Player</button>
        </form>
        <div class="admin-list">
          ${playersRes.players.map(p => `
            <div class="admin-item ${!p.is_active ? 'inactive' : ''}">
              <div class="admin-item-info">
                <strong>${p.display_name}</strong>
                <span class="badge">${p.username}</span>
                <span class="badge">${p.team_name || 'No team'}</span>
                <span class="badge badge-${p.role}">${p.role}</span>
                ${!p.is_active ? '<span class="badge badge-inactive">Inactive</span>' : ''}
              </div>
              <div class="admin-item-actions">
                ${p.is_active ? `<button class="btn btn-sm btn-danger deactivate-player" data-id="${p.id}">Deactivate</button>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>`;

    document.getElementById('add-player-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('/players', {
          method: 'POST',
          body: JSON.stringify({
            display_name: document.getElementById('player-display').value,
            username: document.getElementById('player-username').value,
            password: document.getElementById('player-password').value,
            team_id: document.getElementById('player-team').value || null,
            role: document.getElementById('player-role').value,
          }),
        });
        showToast('Player created!', 'success');
        loadPlayersTab(content);
      } catch (e) {
        showToast(e.message, 'error');
      }
    });

    content.querySelectorAll('.deactivate-player').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Deactivate this player?')) return;
        try {
          await api(`/players/${btn.dataset.id}`, { method: 'DELETE' });
          showToast('Player deactivated', 'success');
          loadPlayersTab(content);
        } catch (e) {
          showToast(e.message, 'error');
        }
      });
    });
  } catch (e) {
    content.innerHTML = `<p class="error">${e.message}</p>`;
  }
}

async function loadSeriesTab(content) {
  content.innerHTML = '<div class="loading">Loading...</div>';
  try {
    const res = await api('/series');
    content.innerHTML = `
      <div class="admin-section">
        <h2>Competition Series</h2>
        <form id="add-series-form" class="inline-form">
          <input type="text" id="series-name" class="form-input" placeholder="Series name" required>
          <input type="date" id="series-start" class="form-input" required>
          <input type="date" id="series-end" class="form-input" required>
          <button type="submit" class="btn btn-primary">Create Series</button>
        </form>
        <div class="admin-list">
          ${res.series.map(s => `
            <div class="admin-item">
              <div class="admin-item-info">
                <strong>${s.name}</strong>
                <span class="badge">${s.start_date} - ${s.end_date}</span>
                <span class="badge ${s.is_active ? 'badge-active' : 'badge-inactive'}">${s.is_active ? 'Active' : 'Ended'}</span>
              </div>
              <div class="admin-item-actions">
                ${s.is_active ? `<button class="btn btn-sm btn-danger end-series" data-id="${s.id}">End Series</button>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>`;

    document.getElementById('add-series-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('/series', {
          method: 'POST',
          body: JSON.stringify({
            name: document.getElementById('series-name').value,
            start_date: document.getElementById('series-start').value,
            end_date: document.getElementById('series-end').value,
          }),
        });
        showToast('Series created!', 'success');
        loadSeriesTab(content);
      } catch (e) {
        showToast(e.message, 'error');
      }
    });

    content.querySelectorAll('.end-series').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('End this series?')) return;
        try {
          await api(`/series/${btn.dataset.id}`, {
            method: 'PUT',
            body: JSON.stringify({ is_active: 0 }),
          });
          showToast('Series ended', 'success');
          loadSeriesTab(content);
        } catch (e) {
          showToast(e.message, 'error');
        }
      });
    });
  } catch (e) {
    content.innerHTML = `<p class="error">${e.message}</p>`;
  }
}
