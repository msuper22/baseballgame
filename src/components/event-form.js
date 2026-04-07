import { api, getUser, isMod } from '../api.js';
import { showToast } from '../components/toast.js';

/**
 * Renders the "log production event" form.
 * @param {HTMLElement} container
 * @param {object} options - { onSuccess: callback }
 */
export async function renderEventForm(container, options = {}) {
  const user = getUser();
  let players = [];

  try {
    const res = await api('/players');
    players = res.players.filter(p => p.is_active);
  } catch (e) {
    container.innerHTML = `<p class="error">Failed to load players</p>`;
    return;
  }

  // If player role, only show self. Mods/admins see all.
  const canLogForOthers = isMod();
  const filteredPlayers = canLogForOthers ? players : players.filter(p => p.id === user.id);

  container.innerHTML = `
    <div class="event-form">
      <h3>Log Production Event</h3>
      <div class="form-group">
        <label for="event-player">Player</label>
        <select id="event-player" class="form-input">
          ${filteredPlayers.map(p => `<option value="${p.id}" ${p.id === user.id ? 'selected' : ''}>${p.display_name} (${p.team_name || 'No team'})</option>`).join('')}
        </select>
      </div>
      <div class="hit-buttons">
        <button class="btn hit-btn hit-single" data-type="single">
          <span class="hit-icon">&#9312;</span>
          <span class="hit-label">Single</span>
          <span class="hit-desc">App Taken</span>
        </button>
        <button class="btn hit-btn hit-double" data-type="double">
          <span class="hit-icon">&#9313;</span>
          <span class="hit-label">Double</span>
          <span class="hit-desc">Light House</span>
        </button>
        <button class="btn hit-btn hit-triple" data-type="triple">
          <span class="hit-icon">&#9314;</span>
          <span class="hit-label">Triple</span>
          <span class="hit-desc">Out</span>
        </button>
        <button class="btn hit-btn hit-homer" data-type="home_run">
          <span class="hit-icon">&#9315;</span>
          <span class="hit-label">Home Run</span>
          <span class="hit-desc">Out + Docs Back</span>
        </button>
      </div>
      <div id="event-result" class="event-result"></div>
    </div>`;

  container.querySelectorAll('.hit-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const playerId = parseInt(document.getElementById('event-player').value);
      const hitType = btn.dataset.type;
      const resultDiv = document.getElementById('event-result');

      btn.disabled = true;
      try {
        const res = await api('/at-bats', {
          method: 'POST',
          body: JSON.stringify({ player_id: playerId, hit_type: hitType }),
        });

        const ab = res.at_bat;
        let msg = `${ab.player_name} hit a ${ab.hit_type.replace('_', ' ')}!`;
        if (ab.runs_scored > 0) {
          msg += ` ${ab.runs_scored} run${ab.runs_scored > 1 ? 's' : ''} scored!`;
        }
        showToast(msg, 'success');
        resultDiv.innerHTML = `<p class="success">${msg}</p>`;

        if (options.onSuccess) options.onSuccess(res);
      } catch (e) {
        showToast(e.message, 'error');
        resultDiv.innerHTML = `<p class="error">${e.message}</p>`;
      } finally {
        btn.disabled = false;
      }
    });
  });
}
