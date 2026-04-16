import { api, isMod } from '../api.js';
import { showToast } from './toast.js';

/**
 * Renders a chat panel for a game. Returns a cleanup function.
 */
export function renderChat(container, gameId) {
  let lastTimestamp = null;
  let pollInterval = null;
  const canModerate = isMod();

  container.innerHTML = `
    <div class="chat-panel">
      <h4 class="chat-title">Game Chat</h4>
      <div class="chat-messages" id="chat-messages-${gameId}"></div>
      <form class="chat-form" id="chat-form-${gameId}">
        <input type="text" class="chat-input" placeholder="Type a message..." maxlength="200" autocomplete="off" />
        <button type="submit" class="chat-send">Send</button>
      </form>
    </div>`;

  const messagesDiv = document.getElementById(`chat-messages-${gameId}`);
  const form = document.getElementById(`chat-form-${gameId}`);

  async function loadMessages() {
    try {
      const url = lastTimestamp
        ? `/spectator/games/${gameId}/chat?since=${encodeURIComponent(lastTimestamp)}`
        : `/spectator/games/${gameId}/chat`;
      const res = await api(url);
      if (res.messages?.length) {
        for (const msg of res.messages) {
          appendMessage(messagesDiv, msg, canModerate);
          lastTimestamp = msg.created_at;
        }
      }
    } catch { /* silent */ }
  }

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = form.querySelector('.chat-input');
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    try {
      await api(`/spectator/games/${gameId}/chat`, {
        method: 'POST',
        body: JSON.stringify({ message: text }),
      });
      await loadMessages();
    } catch (err) {
      if (err.message.includes('wait')) {
        showToast(err.message, 'info');
      }
    }
  });

  // Delegate click for delete buttons
  messagesDiv?.addEventListener('click', async (e) => {
    const btn = e.target.closest('.chat-delete');
    if (!btn) return;
    const msgId = btn.dataset.id;
    try {
      await api(`/spectator/chat/${msgId}`, { method: 'DELETE' });
      btn.closest('.chat-message')?.remove();
    } catch { /* silent */ }
  });

  loadMessages();
  pollInterval = setInterval(loadMessages, 4000);

  return () => {
    if (pollInterval) clearInterval(pollInterval);
  };
}

function appendMessage(container, msg, canModerate) {
  const div = document.createElement('div');
  div.className = 'chat-message';
  div.innerHTML = `
    <span class="chat-author">${msg.player_name}</span>
    <span class="chat-text">${escapeHtml(msg.message)}</span>
    ${canModerate ? `<button class="chat-delete" data-id="${msg.id}" title="Delete">\u2715</button>` : ''}`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}
