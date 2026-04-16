import { api } from '../api.js';

const EMOJIS = ['\u{1F525}', '\u{1F44F}', '\u{1F44D}', '\u{1F4AF}', '\u26BE', '\u{1F389}', '\u{1F602}', '\u{1F62D}'];

/**
 * Renders an emote bar and floating reactions. Returns cleanup function.
 */
export function renderEmotes(container, gameId) {
  let pollInterval = null;
  let seenIds = new Set();

  container.innerHTML = `
    <div class="emote-area">
      <div class="floating-emotes" id="floating-emotes-${gameId}"></div>
      <div class="emote-bar" id="emote-bar-${gameId}">
        ${EMOJIS.map(e => `<button class="emote-btn" data-emoji="${e}">${e}</button>`).join('')}
      </div>
    </div>`;

  const bar = document.getElementById(`emote-bar-${gameId}`);
  const floatingArea = document.getElementById(`floating-emotes-${gameId}`);

  bar?.addEventListener('click', async (e) => {
    const btn = e.target.closest('.emote-btn');
    if (!btn) return;
    const emoji = btn.dataset.emoji;

    spawnFloatingEmoji(floatingArea, emoji);

    try {
      await api(`/spectator/games/${gameId}/react`, {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      });
    } catch { /* silent */ }
  });

  async function loadReactions() {
    try {
      const res = await api(`/spectator/games/${gameId}/reactions`);
      if (res.reactions?.length) {
        for (const r of res.reactions) {
          if (!seenIds.has(r.id)) {
            seenIds.add(r.id);
            spawnFloatingEmoji(floatingArea, r.emoji);
          }
        }
      }
    } catch { /* silent */ }
  }

  pollInterval = setInterval(loadReactions, 3000);

  return () => {
    if (pollInterval) clearInterval(pollInterval);
  };
}

function spawnFloatingEmoji(container, emoji) {
  const el = document.createElement('span');
  el.className = 'floating-emote';
  el.textContent = emoji;
  el.style.left = `${20 + Math.random() * 60}%`;
  el.style.animationDuration = `${1.5 + Math.random() * 1}s`;
  container.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}
