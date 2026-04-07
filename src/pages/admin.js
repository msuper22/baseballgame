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
        <button class="tab" data-tab="events">Events</button>
        <button class="tab" data-tab="audit">Audit Log</button>
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
    else if (tabName === 'events') await loadEventsTab(content);
    else if (tabName === 'audit') await loadAuditTab(content);
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

        <div class="bulk-import-section">
          <h3>Bulk Import</h3>
          <p style="font-size:1rem;color:var(--text-muted);margin-bottom:0.5rem">
            Paste CSV: <code>display_name,username,team_id,password</code> (password optional, defaults to username)
          </p>
          <textarea id="bulk-csv" class="form-input" rows="4" placeholder="John Doe,jdoe,1&#10;Jane Smith,jsmith,2,mypass"></textarea>
          <button id="bulk-import-btn" class="btn btn-primary" style="margin-top:0.5rem">Import Players</button>
          <div id="bulk-result"></div>
        </div>

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

    document.getElementById('bulk-import-btn')?.addEventListener('click', async () => {
      const csv = document.getElementById('bulk-csv').value.trim();
      if (!csv) { showToast('Paste CSV data first', 'error'); return; }

      const lines = csv.split('\n').filter(l => l.trim());
      const players = lines.map(line => {
        const [display_name, username, team_id, password] = line.split(',').map(s => s.trim());
        return { display_name, username, team_id: parseInt(team_id) || null, password: password || undefined };
      });

      try {
        const res = await api('/players/bulk', {
          method: 'POST',
          body: JSON.stringify({ players }),
        });
        const s = res.summary;
        document.getElementById('bulk-result').innerHTML = `
          <p class="success">${s.created} created, ${s.skipped} skipped, ${s.errors} errors</p>`;
        showToast(`Imported ${s.created} players`, 'success');
        if (s.created > 0) setTimeout(() => loadPlayersTab(content), 1500);
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
                ${s.is_locked ? '<span class="badge" style="background:#e53935;color:white;border:none">Locked</span>' : ''}
              </div>
              <div class="admin-item-actions">
                ${s.is_active ? `<button class="btn btn-sm btn-danger end-series" data-id="${s.id}">End Series</button>` : ''}
                <button class="btn btn-sm lock-series" data-id="${s.id}" data-locked="${s.is_locked || 0}">
                  ${s.is_locked ? 'Unlock' : 'Lock'}
                </button>
                <button class="btn btn-sm btn-danger delete-series" data-id="${s.id}" data-name="${s.name}">Delete</button>
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

    content.querySelectorAll('.lock-series').forEach(btn => {
      btn.addEventListener('click', async () => {
        const isLocked = btn.dataset.locked === '1';
        try {
          await api(`/series/${btn.dataset.id}`, {
            method: 'PUT',
            body: JSON.stringify({ is_locked: isLocked ? 0 : 1 }),
          });
          showToast(isLocked ? 'Series unlocked' : 'Series locked', 'success');
          loadSeriesTab(content);
        } catch (e) {
          showToast(e.message, 'error');
        }
      });
    });

    content.querySelectorAll('.delete-series').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm(`Delete "${btn.dataset.name}" and ALL its data? This cannot be undone.`)) return;
        try {
          await api(`/series/${btn.dataset.id}`, { method: 'DELETE' });
          showToast('Series deleted', 'success');
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

async function loadEventsTab(content) {
  content.innerHTML = '<div class="loading">Loading...</div>';
  try {
    const res = await api('/at-bats?limit=50');
    const playersRes = await api('/players');
    const activePlayers = playersRes.players.filter(p => p.is_active);

    if (!res.at_bats?.length) {
      content.innerHTML = '<p class="empty-state">No events logged yet.</p>';
      return;
    }

    content.innerHTML = `
      <div class="admin-section">
        <h2>Recent Events</h2>
        <p style="font-size:1rem;color:var(--text-muted);margin-bottom:1rem">Edit or delete events. Changes recalculate game state.</p>
        <div class="admin-list">
          ${res.at_bats.map(ab => `
            <div class="admin-item" id="event-${ab.id}">
              <div class="admin-item-info" style="flex:1">
                <span class="play-type play-${ab.hit_type}" style="font-size:0.5rem">${formatHit(ab.hit_type)}</span>
                <strong>${ab.player_name}</strong>
                <span class="badge">${ab.team_name}</span>
                ${ab.description ? `<span style="color:var(--text-muted);font-style:italic">ID: ${ab.description}</span>` : ''}
                ${ab.runs_scored > 0 ? `<span style="color:var(--success)">+${ab.runs_scored}R</span>` : ''}
                <span style="color:var(--text-muted);font-size:0.9rem">${new Date(ab.created_at + 'Z').toLocaleString()}</span>
              </div>
              <div class="admin-item-actions">
                <select class="form-input edit-hit-type" data-id="${ab.id}" style="width:auto;padding:0.2rem 0.4rem;font-size:1rem">
                  <option value="single" ${ab.hit_type === 'single' ? 'selected' : ''}>1B</option>
                  <option value="double" ${ab.hit_type === 'double' ? 'selected' : ''}>2B</option>
                  <option value="triple" ${ab.hit_type === 'triple' ? 'selected' : ''}>3B</option>
                  <option value="home_run" ${ab.hit_type === 'home_run' ? 'selected' : ''}>HR</option>
                </select>
                <button class="btn btn-sm btn-primary save-event" data-id="${ab.id}">Save</button>
                <button class="btn btn-sm btn-danger delete-event" data-id="${ab.id}">Delete</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>`;

    content.querySelectorAll('.save-event').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const select = content.querySelector(`.edit-hit-type[data-id="${id}"]`);
        try {
          await api(`/at-bats/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ hit_type: select.value }),
          });
          showToast('Event updated', 'success');
          loadEventsTab(content);
        } catch (e) {
          showToast(e.message, 'error');
        }
      });
    });

    content.querySelectorAll('.delete-event').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this event? Game state will be recalculated.')) return;
        try {
          await api(`/at-bats/${btn.dataset.id}`, { method: 'DELETE' });
          showToast('Event deleted', 'success');
          loadEventsTab(content);
        } catch (e) {
          showToast(e.message, 'error');
        }
      });
    });
  } catch (e) {
    content.innerHTML = `<p class="error">${e.message}</p>`;
  }
}

async function loadAuditTab(content) {
  content.innerHTML = '<div class="loading">Loading...</div>';
  try {
    const res = await api('/stats/audit-log');
    if (!res.logs?.length) {
      content.innerHTML = '<p class="empty-state">No audit log entries yet.</p>';
      return;
    }

    content.innerHTML = `
      <div class="admin-section">
        <h2>Audit Log</h2>
        <div class="audit-list">
          ${res.logs.map(log => `
            <div class="audit-entry">
              <span class="audit-action badge ${getAuditBadgeClass(log.action)}">${log.action}</span>
              <span class="audit-user">${log.user_name}</span>
              <span class="audit-details">${log.details || ''}</span>
              <span class="audit-time">${new Date(log.created_at + 'Z').toLocaleString()}</span>
            </div>
          `).join('')}
        </div>
      </div>`;
  } catch (e) {
    content.innerHTML = `<p class="error">${e.message}</p>`;
  }
}

function getAuditBadgeClass(action) {
  if (action.includes('delete')) return 'badge-inactive';
  if (action.includes('edit')) return 'badge-mod';
  if (action.includes('undo')) return 'badge-mod';
  return 'badge-active';
}

function formatHit(type) {
  const map = { single: '1B', double: '2B', triple: '3B', home_run: 'HR' };
  return map[type] || type;
}
