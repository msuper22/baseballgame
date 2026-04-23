import { api, isLoggedIn } from '../api.js';
import { navigate } from '../router.js';
import { renderDiamond } from '../components/diamond.js';
import { renderScoreboard } from '../components/scoreboard.js';
import { renderChat } from '../components/chat.js';
import { renderEmotes } from '../components/emotes.js';
import { showToast } from '../components/toast.js';
import { formatHit } from '../components/hit-label.js';

let refreshInterval = null;
let chatCleanup = null;
let emotesCleanup = null;

export async function spectatorGamePage(app, params) {
  if (!isLoggedIn()) { navigate('/login'); return; }

  const gameId = parseInt(params.id);

  app.innerHTML = `
    <div class="container">
      <a href="#/spectator" class="back-link">&larr; All Games</a>
      <div id="spec-scoreboard"></div>
      <div class="spec-game-layout">
        <div class="spec-game-main">
          <div id="spec-diamond" class="spec-diamond-area"></div>
          <div id="spec-recent-plays" class="recent-plays"></div>
        </div>
        <div class="spec-game-sidebar">
          <div id="spec-emotes"></div>
          <button class="spec-sidebar-toggle" id="chat-toggle">
            <span>Game Chat</span>
            <span class="toggle-arrow" id="chat-arrow">&#9660;</span>
          </button>
          <div class="spec-sidebar-body expanded" id="chat-body">
            <div id="spec-chat"></div>
          </div>
        </div>
      </div>
    </div>`;

  // Chat toggle
  document.getElementById('chat-toggle')?.addEventListener('click', () => {
    const body = document.getElementById('chat-body');
    const arrow = document.getElementById('chat-arrow');
    if (body.classList.contains('expanded')) {
      body.classList.remove('expanded');
      body.classList.add('collapsed');
      arrow.classList.add('collapsed');
    } else {
      body.classList.remove('collapsed');
      body.classList.add('expanded');
      arrow.classList.remove('collapsed');
    }
  });

  await loadGameState(gameId);
  refreshInterval = setInterval(() => loadGameState(gameId), 8000);

  // Init chat and emotes
  chatCleanup = renderChat(document.getElementById('spec-chat'), gameId);
  emotesCleanup = renderEmotes(document.getElementById('spec-emotes'), gameId);

  return () => {
    if (refreshInterval) { clearInterval(refreshInterval); refreshInterval = null; }
    if (chatCleanup) chatCleanup();
    if (emotesCleanup) emotesCleanup();
  };
}

async function loadGameState(gameId) {
  try {
    const state = await api(`/spectator/games/${gameId}`);
    const game = state.game;
    const hi = state.halfInning;

    // Scoreboard
    let inningsData = [];
    try {
      const sbRes = await api(`/games/${gameId}/scoreboard`);
      inningsData = sbRes.innings || [];
    } catch { /* silent */ }

    const sbDiv = document.getElementById('spec-scoreboard');
    if (sbDiv) renderScoreboard(sbDiv, game, inningsData);

    // Diamond - show batting team's state
    const battingTeamName = game.current_half === 'top' ? game.away_team_name : game.home_team_name;
    const battingTeamId = game.current_half === 'top' ? game.away_team_id : game.home_team_id;
    const diamondState = {
      team_name: battingTeamName,
      team_id: battingTeamId,
      total_runs: game.current_half === 'top' ? game.away_score : game.home_score,
      total_bases: 0,
      first_base_name: hi?.first_base_name || null,
      second_base_name: hi?.second_base_name || null,
      third_base_name: hi?.third_base_name || null,
    };

    const diamondDiv = document.getElementById('spec-diamond');
    if (diamondDiv) {
      renderDiamond(diamondDiv, diamondState, {
        outs: hi?.outs || 0,
        strikes: hi?.strikes || 0,
        showOutsStrikes: true,
      });
    }

    // Recent plays
    const playsDiv = document.getElementById('spec-recent-plays');
    if (playsDiv && state.recent_plays?.length) {
      playsDiv.innerHTML = `
        <h3>Recent Plays</h3>
        <div class="plays-list">
          ${state.recent_plays.slice(0, 10).map(ab => `
            <div class="play-item">
              <span class="play-side ${ab.event_side === 'defense' ? 'play-defense' : 'play-offense'}">${ab.event_side === 'defense' ? 'DEF' : 'OFF'}</span>
              <span class="play-type play-${ab.hit_type} ${ab.event_side === 'defense' ? 'play-defense-type' : ''}">${formatHit(ab.hit_type, ab.event_side)}</span>
              <span class="play-player">${ab.player_name}</span>
              <span class="play-team">${ab.team_name}</span>
              ${ab.runs_scored > 0 ? `<span class="play-runs">+${ab.runs_scored}R</span>` : ''}
              <span class="play-time">${timeAgo(ab.created_at)}</span>
            </div>
          `).join('')}
        </div>`;
    }
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function formatHitType(type) {
  const map = { single: '1B', double: '2B', triple: '3B', home_run: 'HR' };
  return map[type] || type;
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
