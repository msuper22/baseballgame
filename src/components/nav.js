import { isLoggedIn, isAdmin, isMod, getUser, clearToken } from '../api.js';
import { navigate } from '../router.js';

export function renderNav() {
  const nav = document.getElementById('nav');
  if (!nav) return;

  if (!isLoggedIn()) {
    nav.innerHTML = `
      <div class="nav-inner">
        <a href="#/" class="nav-logo">&#9918; MLB Tracker</a>
      </div>`;
    return;
  }

  const user = getUser();
  const adminLink = isAdmin() ? '<a href="#/admin" class="nav-link">Admin</a>' : '';
  const logEventLink = isMod() || isLoggedIn() ? '<a href="#/log-event" class="nav-link">Log Event</a>' : '';

  nav.innerHTML = `
    <div class="nav-inner">
      <a href="#/" class="nav-logo">&#9918; MLB Tracker</a>
      <div class="nav-links">
        <a href="#/" class="nav-link">Dashboard</a>
        <a href="#/leaderboard" class="nav-link">Leaderboard</a>
        <a href="#/history" class="nav-link">History</a>
        ${logEventLink}
        ${adminLink}
        <span class="nav-user">${user?.display_name || user?.username}</span>
        <button id="logout-btn" class="btn btn-sm">Logout</button>
      </div>
      <button id="nav-toggle" class="nav-toggle">&#9776;</button>
    </div>`;

  document.getElementById('logout-btn')?.addEventListener('click', () => {
    clearToken();
    navigate('/login');
    renderNav();
  });

  document.getElementById('nav-toggle')?.addEventListener('click', () => {
    nav.querySelector('.nav-links')?.classList.toggle('open');
  });
}
