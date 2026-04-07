import { api, getUser, isMod } from '../api.js';
import { showToast } from '../components/toast.js';
import { playBatCrack, playRunCelebration, playError } from '../sounds.js';
import { launchConfetti } from '../confetti.js';

let lastEvent = null; // Track last event for undo

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
      <div class="form-group">
        <label for="event-lead-id">Lead ID</label>
        <input type="text" id="event-lead-id" class="form-input" placeholder="Enter lead ID for this event" required>
      </div>
      <div class="hit-buttons">
        <button class="hit-btn hit-single" data-type="single">
          <span class="hit-icon">1B</span>
          <span class="hit-label">Single</span>
          <span class="hit-desc">App Taken</span>
        </button>
        <button class="hit-btn hit-double" data-type="double">
          <span class="hit-icon">2B</span>
          <span class="hit-label">Double</span>
          <span class="hit-desc">Light House</span>
        </button>
        <button class="hit-btn hit-triple" data-type="triple">
          <span class="hit-icon">3B</span>
          <span class="hit-label">Triple</span>
          <span class="hit-desc">Out</span>
        </button>
        <button class="hit-btn hit-homer" data-type="home_run">
          <span class="hit-icon">HR</span>
          <span class="hit-label">Home Run</span>
          <span class="hit-desc">Out + Docs Back</span>
        </button>
      </div>
      <div id="event-result" class="event-result"></div>
      <div id="undo-container"></div>
    </div>`;

  container.querySelectorAll('.hit-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const playerId = parseInt(document.getElementById('event-player').value);
      const leadId = document.getElementById('event-lead-id').value.trim();
      const hitType = btn.dataset.type;
      const resultDiv = document.getElementById('event-result');

      if (!leadId) {
        showToast('Please enter a Lead ID', 'error');
        document.getElementById('event-lead-id').focus();
        return;
      }

      btn.disabled = true;
      try {
        const res = await api('/at-bats', {
          method: 'POST',
          body: JSON.stringify({ player_id: playerId, hit_type: hitType, description: leadId }),
        });

        const ab = res.at_bat;
        let msg = `${ab.player_name} hit a ${ab.hit_type.replace('_', ' ')}!`;
        if (ab.runs_scored > 0) {
          msg += ` ${ab.runs_scored} run${ab.runs_scored > 1 ? 's' : ''} scored!`;
        }
        showToast(msg, 'success');
        resultDiv.innerHTML = `<p class="success">${msg}</p>`;

        document.getElementById('event-lead-id').value = '';

        // Track for undo (only own events)
        if (playerId === user.id) {
          lastEvent = { ...ab, timestamp: Date.now() };
          showUndoButton();
        }

        // Always play bat crack for the hit
        const intensity = { single: 1, double: 2, triple: 3, home_run: 3 }[hitType] || 1;
        playBatCrack(intensity);

        // Scaled celebration when runs score
        if (ab.runs_scored > 0) {
          setTimeout(() => {
            playRunCelebration(ab.runs_scored);
            launchConfetti(ab.runs_scored);
          }, 300);
        }

        if (options.onSuccess) options.onSuccess(res);
      } catch (e) {
        playError();
        showToast(e.message, 'error');
        resultDiv.innerHTML = `<p class="error">${e.message}</p>`;
      } finally {
        btn.disabled = false;
      }
    });
  });
}

function showUndoButton() {
  const container = document.getElementById('undo-container');
  if (!container || !lastEvent) return;

  const updateTimer = () => {
    const elapsed = Date.now() - lastEvent.timestamp;
    const remaining = Math.max(0, 120 - Math.floor(elapsed / 1000));
    if (remaining <= 0) {
      container.innerHTML = '';
      lastEvent = null;
      return;
    }
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    const timerEl = container.querySelector('.undo-timer');
    if (timerEl) timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  container.innerHTML = `
    <div class="undo-bar">
      <span>Last: ${lastEvent.hit_type.replace('_', ' ')}</span>
      <span class="undo-timer">2:00</span>
      <button id="undo-btn" class="btn btn-sm btn-danger">Undo</button>
    </div>`;

  const interval = setInterval(updateTimer, 1000);
  updateTimer();

  // Auto-clear after 2 min
  setTimeout(() => {
    clearInterval(interval);
    container.innerHTML = '';
    lastEvent = null;
  }, 120000);

  document.getElementById('undo-btn')?.addEventListener('click', async () => {
    try {
      await api('/at-bats/undo-last', { method: 'DELETE' });
      showToast('Event undone!', 'success');
      container.innerHTML = '';
      clearInterval(interval);
      lastEvent = null;
      const resultDiv = document.getElementById('event-result');
      if (resultDiv) resultDiv.innerHTML = '<p class="warn">Last event was undone.</p>';
    } catch (e) {
      showToast(e.message, 'error');
    }
  });
}
