import { api, isLoggedIn, isCaptain, getUser } from '../api.js';
import { navigate } from '../router.js';
import { showToast } from '../components/toast.js';
import { renderNav } from '../components/nav.js';

export async function challengesPage(app) {
  if (!isLoggedIn()) { navigate('/login'); return; }

  const user = getUser();

  app.innerHTML = `
    <div class="container">
      <h1>&#9881; Challenges</h1>
      ${isCaptain() ? `
        <div class="challenge-form-section">
          <h2>Send a Challenge</h2>
          <form id="challenge-form" class="inline-form" style="flex-wrap:wrap">
            <select id="challenge-team" class="form-input" style="min-width:180px" required>
              <option value="">Select opponent...</option>
            </select>
            <input type="date" id="challenge-date" class="form-input" required>
            <input type="time" id="challenge-time" class="form-input">
            <div class="form-group" style="margin-bottom:0">
              <label style="font-size:0.6rem">Innings</label>
              <input type="number" id="challenge-innings" class="form-input" value="9" min="1" max="18" style="width:80px">
            </div>
            <input type="text" id="challenge-message" class="form-input" placeholder="Message (optional)" style="min-width:200px">
            <button type="submit" class="btn btn-primary">Send Challenge</button>
          </form>
        </div>` : '<p class="info-text">Only team captains can send and respond to challenges.</p>'}
      <div id="challenges-incoming" class="challenge-section"></div>
      <div id="challenges-outgoing" class="challenge-section"></div>
      <div id="challenges-history" class="challenge-section"></div>
    </div>`;

  // Load teams for the challenge form
  if (isCaptain()) {
    try {
      const teamsRes = await api('/teams');
      const teamSelect = document.getElementById('challenge-team');
      if (teamSelect) {
        for (const t of teamsRes.teams) {
          if (t.id !== user.team_id) {
            teamSelect.innerHTML += `<option value="${t.id}">${t.name}</option>`;
          }
        }
      }
    } catch { /* silent */ }

    document.getElementById('challenge-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const teamId = document.getElementById('challenge-team').value;
      const date = document.getElementById('challenge-date').value;
      const time = document.getElementById('challenge-time').value;
      const message = document.getElementById('challenge-message').value;

      if (!teamId || !date) {
        showToast('Select an opponent and date', 'error');
        return;
      }

      try {
        const inningsEl = document.getElementById('challenge-innings');
        const innings = parseInt(inningsEl?.value) || 9;
        await api('/challenges', {
          method: 'POST',
          body: JSON.stringify({
            challenged_team_id: parseInt(teamId),
            proposed_date: date,
            proposed_time: time || null,
            message: message || null,
            innings,
          }),
        });
        showToast('Challenge sent!', 'success');
        loadChallenges();
      } catch (e) {
        showToast(e.message, 'error');
      }
    });
  }

  await loadChallenges();

  async function loadChallenges() {
    try {
      const res = await api('/challenges');
      const challenges = res.challenges || [];

      const incoming = challenges.filter(ch =>
        ch.challenged_team_id === user.team_id && ch.status === 'pending'
      );
      const outgoing = challenges.filter(ch =>
        ch.challenger_team_id === user.team_id && ch.status === 'pending'
      );
      const history = challenges.filter(ch =>
        ch.status !== 'pending'
      );

      renderIncoming(incoming);
      renderOutgoing(outgoing);
      renderHistory(history);
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  function renderIncoming(challenges) {
    const el = document.getElementById('challenges-incoming');
    if (!el) return;

    if (!challenges.length) {
      el.innerHTML = '<h2>Incoming Challenges</h2><p class="empty-state">No pending challenges.</p>';
      return;
    }

    el.innerHTML = `
      <h2>Incoming Challenges (${challenges.length})</h2>
      <div class="challenge-list">
        ${challenges.map(ch => `
          <div class="challenge-card incoming">
            <div class="challenge-info">
              <strong>${ch.challenger_team_name}</strong> wants to play!
              <span class="challenge-date">${formatDate(ch.proposed_date)}${ch.proposed_time ? ' at ' + ch.proposed_time : ''}</span>
              <span class="badge">${ch.innings || 9} innings</span>
              ${ch.message ? `<p class="challenge-message">"${ch.message}"</p>` : ''}
              <span class="challenge-captain">From: ${ch.challenger_captain_name}</span>
              <span class="challenge-expires">Expires: ${timeUntil(ch.expires_at)}</span>
            </div>
            ${isCaptain() ? `
              <div class="challenge-actions">
                <button class="btn btn-sm btn-primary accept-challenge" data-id="${ch.id}">Accept</button>
                <button class="btn btn-sm btn-danger decline-challenge" data-id="${ch.id}">Decline</button>
              </div>` : ''}
          </div>
        `).join('')}
      </div>`;

    el.querySelectorAll('.accept-challenge').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          const res = await api(`/challenges/${btn.dataset.id}/accept`, { method: 'PUT' });
          showToast('Challenge accepted! Game created.', 'success');
          renderNav();
          loadChallenges();
        } catch (e) { showToast(e.message, 'error'); }
      });
    });

    el.querySelectorAll('.decline-challenge').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Decline this challenge?')) return;
        try {
          await api(`/challenges/${btn.dataset.id}/decline`, { method: 'PUT' });
          showToast('Challenge declined', 'success');
          renderNav();
          loadChallenges();
        } catch (e) { showToast(e.message, 'error'); }
      });
    });
  }

  function renderOutgoing(challenges) {
    const el = document.getElementById('challenges-outgoing');
    if (!el) return;

    if (!challenges.length) {
      el.innerHTML = '<h2>Outgoing Challenges</h2><p class="empty-state">No pending outgoing challenges.</p>';
      return;
    }

    el.innerHTML = `
      <h2>Outgoing Challenges (${challenges.length})</h2>
      <div class="challenge-list">
        ${challenges.map(ch => `
          <div class="challenge-card outgoing">
            <div class="challenge-info">
              You challenged <strong>${ch.challenged_team_name}</strong>
              <span class="challenge-date">${formatDate(ch.proposed_date)}${ch.proposed_time ? ' at ' + ch.proposed_time : ''}</span>
              <span class="badge">${ch.innings || 9} innings</span>
              ${ch.message ? `<p class="challenge-message">"${ch.message}"</p>` : ''}
              <span class="challenge-expires">Expires: ${timeUntil(ch.expires_at)}</span>
            </div>
            <div class="challenge-actions">
              <button class="btn btn-sm btn-danger cancel-challenge" data-id="${ch.id}">Cancel</button>
            </div>
          </div>
        `).join('')}
      </div>`;

    el.querySelectorAll('.cancel-challenge').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Cancel this challenge?')) return;
        try {
          await api(`/challenges/${btn.dataset.id}/cancel`, { method: 'PUT' });
          showToast('Challenge cancelled', 'success');
          loadChallenges();
        } catch (e) { showToast(e.message, 'error'); }
      });
    });
  }

  function renderHistory(challenges) {
    const el = document.getElementById('challenges-history');
    if (!el) return;

    if (!challenges.length) {
      el.innerHTML = '';
      return;
    }

    el.innerHTML = `
      <h2>Challenge History</h2>
      <div class="challenge-list">
        ${challenges.slice(0, 20).map(ch => {
          const statusBadge = {
            accepted: 'badge-active',
            declined: 'badge-inactive',
            expired: 'badge-inactive',
            cancelled: 'badge-mod',
          }[ch.status] || '';

          return `
            <div class="challenge-card history">
              <div class="challenge-info">
                <strong>${ch.challenger_team_name}</strong> vs <strong>${ch.challenged_team_name}</strong>
                <span class="challenge-date">${formatDate(ch.proposed_date)}</span>
                <span class="badge ${statusBadge}">${ch.status}</span>
                ${ch.game_id ? `<a href="#/game/${ch.game_id}" class="btn btn-sm">View Game</a>` : ''}
              </div>
            </div>`;
        }).join('')}
      </div>`;
  }
}

function formatDate(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function timeUntil(dateStr) {
  const diff = new Date(dateStr + 'Z').getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
